import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LimitWindow, Limits, Pause } from '../types'
import { fromEngine, readLimits } from './limits'
import { labelText, pct, setLanguage, t, untilText } from './text'

// Keine Modell-Anfrage der Hauptsitzung, die ein Limit über diese Grenze tragen
// könnte (Dennis, 31.10.2026). Einstellung limitPercent im Manifest; register setzt sie.
export const DEFAULT_LIMIT = 99.89
let limit = DEFAULT_LIMIT

// Wie lange eine Anfrage höchstens auf den Reset wartet. Liegt der weiter weg,
// wird die Anfrage mit Hinweis gestoppt, statt stundenlang zu hängen: Am
// 02.11.2026 hielt die Pause fast zwei Stunden, nichts war zu sehen, und Dennis
// musste die Sitzung beenden. Einstellung maxWaitMinutes; 0 heißt nie warten.
export const DEFAULT_MAX_WAIT_MIN = 5
let maxWaitMs = DEFAULT_MAX_WAIT_MIN * 60_000

// Eine Anfrage kostet selbst etwas, und andere Sitzungen und Agenten zählen
// zwischen zwei Messungen mit. Deshalb wird früher angehalten: um das Doppelte
// des größten Sprungs der letzten zehn Anstiege, mindestens einen halben Punkt,
// höchstens zwei (bis 02.11.2026 fünf: Bei vielen Untersitzungen hielt das
// schon ab 96 % an). Nur die letzten zehn, ein Reset leert die Liste.
const MIN_GAP = 0.5
const MAX_GAP = 2
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

// Wann die Anfrage frühestens raus darf: eine Minute nach dem Reset; null,
// wenn das Fenster keinen Reset-Zeitpunkt nennt.
export function dueAt(hit: LimitWindow) {
  return hit.resetsAt === null ? null : hit.resetsAt + AFTER_RESET_MS
}

// Ob sich Warten lohnt: nur mit Reset-Zeitpunkt und nur innerhalb der Wartezeit.
export function canWait(hit: LimitWindow, now: number, maxMs = maxWaitMs) {
  const due = dueAt(hit)
  return due !== null && due - now <= maxMs
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

async function begin($: EngineInterface, hit: LimitWindow, now: number) {
  waiting += 1
  const entry: Pause = { label: hit.label, percent: hit.percent, until: hit.resetsAt, waiting }
  await update($, pauseState, () => entry)
  if (waiting > 1) return

  const text = t().begin(labelText(hit.label), pct(hit.percent), t().whenIn(untilText((hit.resetsAt ?? now) - now)))
  $.ui.toast(text)
  $.ui.status(t().status(labelText(hit.label), pct(hit.percent)))
  void $.ui.notify(text, { title: t().notifyTitle }).catch(() => undefined)
}

// Warum eine Pause endet, und was der Toast dann sagt (abgebrochen oder
// gestoppt: nichts, der Stopp hat seine eigene Meldung).
type Why = 'reset' | 'off' | 'aborted' | 'stopped'
function endedText(why: Why): string | null {
  if (why === 'reset') return t().endedReset
  if (why === 'off') return t().endedOff
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

// Statt zu warten: die Runde mit Hinweis beenden. Die Meldung steht als
// Log-Zeile im Verlauf (das Modell liest sie nicht), als Toast und als
// Benachrichtigung; die Anfrage geht nicht raus.
async function stop($: EngineInterface, turnId: string, hit: LimitWindow, now: number) {
  const when = hit.resetsAt === null ? t().noResetKnown : t().freeIn(untilText(hit.resetsAt - now))
  const text = t().stopped(labelText(hit.label), pct(hit.percent), when)
  $.ui.log(text)
  $.ui.toast(text)
  void $.ui.notify(text, { title: t().notifyTitle }).catch(() => undefined)
  try {
    await $.turn.abort({ turnId })
  } catch {
    // Die Runde ist schon zu Ende oder nicht die laufende: Dann bleibt es bei
    // der leeren Antwort, die der Hook zurückgibt.
  }
}

async function statusText($: EngineInterface) {
  const reading = await measure($, true)
  const windows = reading.windows.map(w => `${labelText(w.label)} ${pct(w.percent)}`).join(', ') || t().noNumbers
  const held = await read($, pauseState)
  const state = (await read($, offState))
    ? t().stateOff
    : t().stateOn(pct(limit), pct(reading.gap), pct(limit - reading.gap), untilText(maxWaitMs))
  const now = held ? t().waitingNow(held.waiting, labelText(held.label), pct(held.percent)) : ''
  return `${state}${now}${t().stand(windows)}`
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  limit = typeof options.limitPercent === 'number' ? options.limitPercent : DEFAULT_LIMIT
  maxWaitMs =
    typeof options.maxWaitMinutes === 'number' && options.maxWaitMinutes >= 0
      ? options.maxWaitMinutes * 60_000
      : DEFAULT_MAX_WAIT_MIN * 60_000

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

  // Vor jeder Modell-Anfrage der Hauptsitzung: Würde sie ein Limit über die
  // Grenze tragen und ist der Reset nah, wartet sie hier und geht dann
  // unverändert raus. Ist der Reset fern, wird die Runde mit Hinweis beendet,
  // damit nichts stundenlang hängt. Scheitert die Prüfung, läuft die Anfrage
  // ungeprüft (die Engine ruft dann next für den Hook auf).
  on('turn.step', async function* ($, e, next) {
    if (await isReleased($)) return yield* next(e)
    // Agenten werden nie angehalten: Die Desktop-App beendet einen Agenten,
    // dessen Anfrage länger als 600 s hängt („Agent stalled“, 02.11.2026).
    // Erreicht er das Limit, scheitert nur seine Anfrage, nicht die Sitzung.
    if (e.agentId !== undefined) return yield* next(e)

    let reading = await check($, e.model, false)
    if (reading.hit === null) return yield* next(e)

    const aborted = { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    if (!canWait(reading.hit, reading.now)) {
      await stop($, e.turnId, reading.hit, reading.now)
      return aborted
    }

    await begin($, reading.hit, reading.now)
    let why: Why = 'reset'
    try {
      while (reading.hit !== null && canWait(reading.hit, reading.now)) {
        if (next.signal.aborted) {
          why = 'aborted'
          return aborted
        }
        if (await isReleased($)) {
          why = 'off'
          break
        }
        const due = dueAt(reading.hit) ?? reading.now
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
        reading = now >= due ? await check($, e.model, true) : { ...reading, now }
      }
      // Nach dem Reset immer noch zu voll und kein naher Reset mehr: nicht weiter warten.
      if (reading.hit !== null && why === 'reset') why = 'stopped'
    } finally {
      await end($, why)
    }
    if (why === 'stopped' && reading.hit !== null) {
      await stop($, e.turnId, reading.hit, reading.now)
      return aborted
    }

    return yield* next(e)
  })
}
