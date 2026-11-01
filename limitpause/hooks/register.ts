import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LimitWindow, Limits, Pause } from '../types'
import { fromEngine, readLimits } from './limits'
import { labelText, pct, setLanguage, t, untilText } from './text'

// Keine Modell-Anfrage, die ein Limit über diese Grenze tragen könnte
// (Dennis, 31.10.2026): Eine Aufgabe soll nie mehr am Limit abbrechen.
// Einstellung limitPercent im Manifest; register setzt sie.
export const DEFAULT_LIMIT = 99.89
let limit = DEFAULT_LIMIT

// Eine Anfrage kostet selbst etwas, und andere Sitzungen und Agenten zählen
// zwischen zwei Messungen mit. Deshalb wird früher angehalten: um das Doppelte
// des größten Sprungs der letzten zehn Anstiege, mindestens einen halben Punkt,
// höchstens fünf. Nur die letzten zehn: Ein einzelner großer Sprung soll nicht
// bis zum Reset ab 94,89 % sperren (31.10.2026). Ein Reset leert die Liste.
const MIN_GAP = 0.5
const MAX_GAP = 5
const MAX_JUMP = 20
const KEEP_JUMPS = 10

// Die App-Zahlen höchstens einmal die Minute holen, ab 90 % vor jeder Anfrage.
const APP_MAX_AGE_MS = 60_000
const NEAR = 90

// Gewartet wird in Häppchen: ein kurzer Kindprozess schläft, denn ein
// $.clock.sleep zählt gegen die zehn Sekunden, die ein Hook hat, ein
// laufender $-Aufruf nicht. Nach dem Reset noch eine Minute Puffer.
const NAP_MS = 30_000
const AFTER_RESET_MS = 60_000
const NO_RESET_RECHECK_MS = 5 * 60_000

// Ohne Reset-Zeitpunkt kann die Pause nicht von selbst enden: Die Engine
// erfährt neue Zahlen erst mit der nächsten Antwort. Nach einer halben Stunde
// geht die Anfrage deshalb trotzdem raus.
const NO_RESET_MAX_MS = 30 * 60_000

const offState = atom({ plugin: 'limitpause', key: 'isOff' } as const, false)
const pauseState = atom({ plugin: 'limitpause', key: 'pause' } as const, null, { shape: 'pause-1' })
const jumpsState = atom({ plugin: 'limitpause', key: 'jumps' } as const, [] as number[])

let appReading: Limits | null = null
const lastEngine = new Map<string, number>()
let waiting = 0

// /limitpause aus läuft sofort, auch mitten in einer wartenden Anfrage. Die
// Warteschleife sieht das über diese Variable gleich, nicht erst über $.state.
let isOffNow = false
// Welcher Schläfer zuletzt lief; der nächste Versuch fängt bei ihm an.
let sleeper = 0

// Ein Wochenlimit eines Modells („Woche Fable“) gilt nur für Anfragen an
// dieses Modell, alle anderen Fenster für jede.
export function appliesTo(label: string, model: string) {
  const own = label.match(/^Woche (.+)$/)
  return own ? model.toLowerCase().includes((own[1] ?? '').trim().toLowerCase()) : true
}

// App und Engine zusammen, je Fenster der höhere Wert. Ein Fenster, dessen
// Reset vorbei ist, fällt weg: Die Engine erfährt neue Zahlen erst mit der
// nächsten Antwort und hielte die Pause sonst ewig fest.
export function merge(lists: readonly (readonly LimitWindow[])[], now: number): LimitWindow[] {
  const byLabel = new Map<string, LimitWindow>()
  for (const one of lists.flat()) {
    if (one.resetsAt !== null && one.resetsAt <= now) continue
    const seen = byLabel.get(one.label)
    if (!seen || one.percent > seen.percent) byLabel.set(one.label, one)
  }
  return [...byLabel.values()]
}

export function gapFor(jump: number) {
  return Math.min(MAX_GAP, Math.max(MIN_GAP, jump * 2))
}

// Die Liste der letzten Anstiege nach einer neuen Messung eines Fensters.
// Fällt der Wert, war ein Reset: Die alten Sprünge zählen nicht mehr.
export function noteJump(jumps: readonly number[], before: number | undefined, after: number): number[] {
  if (before === undefined || after === before) return [...jumps]
  if (after < before) return []
  const jump = after - before
  return jump < MAX_JUMP ? [...jumps, jump].slice(-KEEP_JUMPS) : [...jumps]
}

// Das vollste Fenster, das mit dem Abstand die Grenze erreicht; sonst null.
export function blocking(windows: readonly LimitWindow[], model: string, gap: number, threshold = limit) {
  const hit = windows
    .filter(w => appliesTo(w.label, model) && w.percent + gap >= threshold)
    .sort((a, b) => b.percent - a.percent)
  return hit[0] ?? null
}

async function measure($: EngineInterface, isFresh: boolean) {
  const now = await $.clock.now()
  if (isFresh || appReading === null || now - appReading.at > APP_MAX_AGE_MS) {
    appReading = await readLimits($)
  }

  const usage = await $.session.usage()
  const engine = fromEngine(usage.rateLimits, null, now).windows.filter(
    w => w.resetsAt === null || w.resetsAt > now,
  )

  // Der Sprung zählt nur zwischen zwei Engine-Messungen: Die kommen mit jeder
  // Antwort, die App-Zahlen nur einmal die Minute und wären zu grob.
  const stored = await read($, jumpsState)
  let jumps = stored
  for (const w of engine) {
    jumps = noteJump(jumps, lastEngine.get(w.label), w.percent)
    lastEngine.set(w.label, w.percent)
  }
  if (jumps.join() !== stored.join()) await update($, jumpsState, () => jumps)

  return { now, windows: merge([appReading.windows, engine], now), gap: gapFor(Math.max(0, ...jumps)) }
}

async function check($: EngineInterface, model: string, isFresh: boolean) {
  const first = await measure($, isFresh)
  const near = first.windows.some(w => appliesTo(w.label, model) && w.percent >= NEAR)
  const reading = near && !isFresh ? await measure($, true) : first
  return { ...reading, hit: blocking(reading.windows, model, reading.gap) }
}

async function isReleased($: EngineInterface) {
  return isOffNow || (await read($, offState))
}

// Der Schläfer meldet sich jede Sekunde mit einem Punkt. Zwischen zwei Punkten
// prüft die Schleife Esc und /limitpause aus; wer sie verlässt, beendet den
// Kindprozess (das tut $.process.spawn selbst, auch wenn next.signal abbricht).
function sleeperArgv(index: number, ms: number) {
  const seconds = Math.ceil(ms / 1000)
  const all = [
    ['node', '-e', `setInterval(() => process.stdout.write('.'), 1000); setTimeout(() => process.exit(0), ${ms})`],
    ['powershell', '-NoProfile', '-Command', `1..${seconds} | ForEach-Object { Start-Sleep 1; '.' }`],
    ['sh', '-c', `i=0; while [ $i -lt ${seconds} ]; do sleep 1; echo .; i=$((i+1)); done`],
  ]
  return all[index] ?? null
}

type Woke = 'woke' | 'released' | 'aborted'

async function nap($: EngineInterface, ms: number, signal: AbortSignal): Promise<Woke> {
  const wait = Math.max(1000, Math.min(NAP_MS, ms))
  for (let index = sleeper; sleeperArgv(index, wait) !== null; index += 1) {
    const argv = sleeperArgv(index, wait) ?? []
    try {
      for await (const _ of $.process.spawn({ argv })) {
        if (signal.aborted) return 'aborted'
        if (await isReleased($)) return 'released'
      }
      sleeper = index
      return 'woke'
    } catch {
      if (signal.aborted) return 'aborted'
      // Dieser Schläfer startet nicht (kein node, keine PowerShell): den nächsten.
    }
  }
  // Gar keiner läuft: ein kurzes Schläfchen auf der Uhr. Das zählt gegen das
  // Hook-Budget, nach ein paar Runden lässt die Engine die Anfrage ungeprüft durch.
  await $.clock.sleep(Math.min(wait, 5000), { signal })
  return signal.aborted ? 'aborted' : 'woke'
}

async function begin($: EngineInterface, hit: LimitWindow) {
  waiting += 1
  const entry: Pause = { label: hit.label, percent: hit.percent, until: hit.resetsAt, waiting }
  await update($, pauseState, () => entry)
  if (waiting > 1) return

  const now = await $.clock.now()
  const when =
    hit.resetsAt === null ? t().whenNoReset(untilText(NO_RESET_MAX_MS)) : t().whenIn(untilText(hit.resetsAt - now))
  const text = t().begin(labelText(hit.label), pct(hit.percent), when)
  $.ui.toast(text)
  $.ui.status(t().status(labelText(hit.label), pct(hit.percent)))
  void $.ui.notify(text, { title: t().notifyTitle }).catch(() => undefined)
}

// Warum eine Pause endet, und was der Toast dann sagt (abgebrochen: nichts).
type Why = 'reset' | 'off' | 'no-reset' | 'aborted'
function endedText(why: Why): string | null {
  if (why === 'reset') return t().endedReset
  if (why === 'off') return t().endedOff
  if (why === 'no-reset') return t().endedNoReset(untilText(NO_RESET_MAX_MS))
  return null
}

async function end($: EngineInterface, why: Why) {
  waiting = Math.max(0, waiting - 1)
  if (waiting > 0) {
    await update($, pauseState, old => (old ? { ...old, waiting } : old))
    return
  }
  await update($, pauseState, () => null)
  $.ui.status(undefined)
  const text = endedText(why)
  if (text !== null) $.ui.toast(text)
}

async function statusText($: EngineInterface) {
  const reading = await measure($, true)
  const windows = reading.windows.map(w => `${labelText(w.label)} ${pct(w.percent)}`).join(', ') || t().noNumbers
  const held = await read($, pauseState)
  const state = (await read($, offState))
    ? t().stateOff
    : t().stateOn(pct(limit), pct(reading.gap), pct(limit - reading.gap))
  const now = held ? t().waitingNow(held.waiting, labelText(held.label), pct(held.percent)) : ''
  return `${state}${now}${t().stand(windows)}`
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  limit = typeof options.limitPercent === 'number' ? options.limitPercent : DEFAULT_LIMIT

  on('session.start', async ($, e, next) => {
    // immediate: sonst wartete /limitpause aus auf das Ende der Runde, und
    // die steckt ja gerade in der Pause.
    await $.command.register({
      name: 'limitpause',
      description: t().commandDescription,
      argumentHint: t().argumentHint,
      immediate: true,
    })

    return next(e)
  })

  // „aus“/„off“ und „an“/„on“ gelten in beiden Sprachen.
  on('command.run', { command: 'limitpause' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    if (word === 'aus' || word === 'off') {
      isOffNow = true
      await update($, offState, () => true)
    }
    if (word === 'an' || word === 'on') {
      isOffNow = false
      await update($, offState, () => false)
    }

    return { text: await statusText($) }
  })

  // Vor jeder Modell-Anfrage, der Hauptsitzung wie jedes Agenten: Würde sie ein
  // Limit über die Grenze tragen, wartet sie hier, bis das Fenster zurückgesetzt
  // ist, und geht dann unverändert raus. Der Agent merkt davon nichts.
  // Scheitert die Prüfung, läuft die Anfrage ungeprüft (die Engine ruft dann
  // next für den Hook auf); anhalten soll nur, was sicher gemessen ist.
  on('turn.step', async function* ($, e, next) {
    if (await isReleased($)) return yield* next(e)

    let reading = await check($, e.model, false)
    if (reading.hit === null) return yield* next(e)

    const aborted = { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    const startedAt = reading.now
    // Wann zuletzt gemessen wurde. Ohne Reset-Zeitpunkt wird alle fünf Minuten
    // neu gemessen; das Ziel darf nicht mit jedem Häppchen weiterwandern.
    let checkedAt = reading.now
    await begin($, reading.hit)
    let why: Why = 'reset'
    try {
      while (reading.hit !== null) {
        if (next.signal.aborted) {
          why = 'aborted'
          return aborted
        }
        if (await isReleased($)) {
          why = 'off'
          break
        }
        if (reading.hit.resetsAt === null && reading.now - startedAt >= NO_RESET_MAX_MS) {
          why = 'no-reset'
          break
        }
        const due =
          reading.hit.resetsAt === null ? checkedAt + NO_RESET_RECHECK_MS : reading.hit.resetsAt + AFTER_RESET_MS
        const woke = await nap($, due - reading.now, next.signal)
        if (woke === 'aborted') {
          why = 'aborted'
          return aborted
        }
        if (woke === 'released') {
          why = 'off'
          break
        }
        const now = await $.clock.now()
        if (now >= due) {
          reading = await check($, e.model, true)
          checkedAt = reading.now
        } else {
          reading = { ...reading, now }
        }
      }
    } finally {
      await end($, why)
    }

    return yield* next(e)
  })
}
