import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { appliesTo, blocking, canWait, gapFor, merge, modelName, noteJump, reroute, warning } from '../hooks/register'
import { pct } from '../hooks/text'
import { exactContext } from '../hooks/limits'

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 }

// Unter dem Mod steht hier die Engine: Uhr, Limits, Kindprozess und die Anfrage selbst.
// resetsInMs null: Das 5-h-Fenster nennt keinen Reset-Zeitpunkt.
// app: Antwort des App-Werkzeugs get_usage (sonst verweigert, dann nur Engine-Zahlen).
function engine(on: On, fiveHour: number, resetsInMs: number | null, app?: unknown) {
  const seen = {
    fiveHour,
    now: 1_000_000,
    requests: 0,
    models: [] as string[],
    naps: 0,
    aborts: 0,
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    logs: [] as string[],
    registered: null as unknown,
    // Hält den Schläfer an, bis der Test ihn weiterlaufen lässt.
    onNap: null as (() => Promise<void>) | null,
  }
  const resetsAt = resetsInMs === null ? undefined : new Date(seen.now + resetsInMs).toISOString()

  on('clock.now', () => ({ value: seen.now }))
  if (app === undefined) {
    on('tool.check', () => ({ decision: 'deny', reason: 'kein App-Werkzeug im Test' }) as never)
  } else {
    on('tool.check', () => ({ decision: 'allow' }) as never)
    on('tool.call', () => ({ result: [{ type: 'text', text: JSON.stringify(app) }] }) as never)
  }
  on('session.usage', () => ({
    value: {
      rateLimits: [
        { kind: 'five_hour', percentUsed: seen.fiveHour, resetsAt },
        { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(seen.now + 3 * 86_400_000).toISOString() },
      ],
      context: { percent: 10 },
    } as never,
  }))
  // Ein Schläfer-Häppchen: ein Lebenszeichen, dann sind 30 s um.
  on('process.spawn', async function* () {
    seen.naps += 1
    if (seen.onNap) await seen.onNap()
    seen.now += 30_000
    yield { stream: 'stdout', text: '.' } as never
    return { value: { code: 0, signal: null } } as never
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push(String((e as { text?: unknown }).text ?? JSON.stringify(e)))
    return { value: undefined } as never
  })
  on('ui.log', (_, e) => {
    seen.logs.push(String((e as { text?: unknown }).text ?? JSON.stringify(e)))
    return { value: undefined } as never
  })
  on('ui.status', (_, e) => {
    seen.statuses.push((e as { text?: string }).text)
    return { value: undefined } as never
  })
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-surface' } }) as never)
  on('turn.abort', () => {
    seen.aborts += 1
    return { value: undefined } as never
  })
  on('command.register', (_, e) => {
    seen.registered = e
    return { value: { command: 'limitpause' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    seen.requests += 1
    seen.models.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  return seen
}

async function step($: Engine, model = STEP.model, agentId?: string, turnId = STEP.turnId) {
  // Die Stücke der Antwort sind egal, es zählt, was am Ende zurückkommt.
  const stream = $.turn.step({ ...STEP, turnId, model, ...(agentId === undefined ? {} : { agentId }) })
  let piece = await stream.next()
  while (!piece.done) piece = await stream.next()
  return piece.value
}

test('unter der Grenze geht die Anfrage sofort raus', async ($, on) => {
  const seen = engine(on, 50, 3_600_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(0)
})

test('kurz vor der Grenze mit nahem Reset wartet die Anfrage bis nach dem Reset und geht dann raus', async ($, on) => {
  const seen = engine(on, 99.5, 90_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // 90 s bis zum Reset plus eine Minute Puffer, in 30-s-Häppchen.
  expect(seen.naps).toBe(5)
  expect(seen.aborts).toBe(0)
  expect(seen.toasts.some(t => t.includes('Limit-Pause: 5 h steht bei 99,5 %'))).toBe(true)
  expect(seen.toasts.some(t => t.includes('es geht weiter'))).toBe(true)
})

test('liegt der Reset weiter weg als die Wartezeit, wird die Runde mit Hinweis gestoppt', async ($, on) => {
  const seen = engine(on, 99.5, 3_600_000)

  const result = await step($)

  // Nichts gesendet, nichts gewartet, die Runde beendet, der Grund steht im Verlauf.
  expect(result.answer).toBe('')
  expect(result.stopReason).toBe(null)
  expect(seen.requests).toBe(0)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(1)
  expect(seen.logs.length).toBe(1)
  expect(seen.logs[0]).toContain('5 h steht bei 99,5 %, frei in 1 h 0 min')
  expect(seen.logs[0]).toContain('nicht gesendet')
  expect(seen.logs[0]).toContain('/limitpause aus')
  expect(seen.toasts.some(t => t.includes('nicht gesendet'))).toBe(true)
  // Kein „es geht weiter“: Die Pause hatte nie begonnen.
  expect(seen.toasts.some(t => t.includes('es geht weiter'))).toBe(false)
})

test('ohne Reset-Zeitpunkt wird die Runde gestoppt statt zu warten', async ($, on) => {
  const seen = engine(on, 99.5, null)

  const result = await step($)

  expect(result.answer).toBe('')
  expect(seen.requests).toBe(0)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(1)
  expect(seen.logs[0]).toContain('Reset-Zeitpunkt unbekannt')
})

test('ein Agent wird nie angehalten, auch kurz vor der Grenze', async ($, on) => {
  const seen = engine(on, 99.8, 3_600_000)

  const result = await step($, STEP.model, 'agent-1')

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(0)
  expect(seen.toasts).toEqual([])
})

test('mit /limitpause aus läuft auch eine volle Anfrage durch', async ($, on) => {
  const seen = engine(on, 99.8, 3_600_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const answer = await $.command.run({ command: 'limitpause', args: 'aus' } as never)
  expect(String((answer as { text?: string }).text)).toContain('AUS')

  await step($)
  expect(seen.requests).toBe(1)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(0)
})

test('/limitpause läuft sofort, auch mitten in einer Runde, und nennt die Wartezeit', async ($, on) => {
  const seen = engine(on, 50, 3_600_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((seen.registered as { immediate?: boolean }).immediate).toBe(true)
  const answer = await $.command.run({ command: 'limitpause', args: '' } as never)
  expect(String((answer as { text?: string }).text)).toContain('höchstens 5 min')
  expect(String((answer as { text?: string }).text)).toContain('Agenten warten nie')
})

test('/limitpause aus gibt eine schon wartende Anfrage sofort frei', async ($, on) => {
  // Reset in vier Minuten: nah genug zum Warten.
  const seen = engine(on, 99.8, 240_000)
  let wake = () => {}
  const napping = new Promise<void>(asleep => {
    seen.onNap = () =>
      new Promise<void>(go => {
        wake = go
        asleep()
      })
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pending = step($)
  await napping
  await $.command.run({ command: 'limitpause', args: 'aus' } as never)
  wake()
  const result = await pending

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // Freigegeben beim ersten Lebenszeichen, nicht erst nach dem Reset.
  expect(seen.naps).toBe(1)
  expect(seen.aborts).toBe(0)
  expect(seen.toasts.some(t => t.includes('von Hand'))).toBe(true)
})

test('eigene Wartezeit: mit 120 Minuten wartet die Anfrage eine Stunde auf den Reset', { options: { maxWaitMinutes: 120 } }, async ($, on) => {
  const seen = engine(on, 99.5, 3_600_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // 60 min bis zum Reset plus eine Minute Puffer, in 30-s-Häppchen.
  expect(seen.naps).toBe(122)
  expect(seen.aborts).toBe(0)
})

test('Wartezeit 0: nie warten, sofort stoppen', { options: { maxWaitMinutes: 0 } }, async ($, on) => {
  const seen = engine(on, 99.5, 90_000)

  const result = await step($)

  expect(result.answer).toBe('')
  expect(seen.requests).toBe(0)
  expect(seen.naps).toBe(0)
  expect(seen.aborts).toBe(1)
})

test('ein Wochenlimit eines Modells gilt nur für dieses Modell', () => {
  expect(appliesTo('Woche Fable', 'claude-fable-5-1')).toBe(true)
  expect(appliesTo('Woche Fable', 'claude-opus-5-5')).toBe(false)
  expect(appliesTo('5 h', 'claude-opus-5-5')).toBe(true)
  expect(appliesTo('Woche', 'claude-opus-5-5')).toBe(true)
})

test('Abstand, Zusammenführen, Grenze und Wartezeit', () => {
  expect(gapFor(0)).toBe(0.5)
  expect(gapFor(0.4)).toBe(0.8)
  // Gedeckelt auf zwei Punkte: Ein großer Sprung sperrt nicht schon ab 95 %.
  expect(gapFor(9)).toBe(2)

  // Ein großer Sprung zählt nur, bis zehn neuere ihn verdrängt haben.
  let jumps = noteJump([], 50, 53)
  expect(jumps).toEqual([3])
  for (let i = 0; i < 10; i += 1) jumps = noteJump(jumps, 53 + i * 0.1, 53 + (i + 1) * 0.1)
  expect(jumps.length).toBe(10)
  expect(Math.max(...jumps)).toBeLessThan(0.2)
  // Ein Reset leert die Liste, ein Sprung über 20 Punkte ist kein Messwert.
  expect(noteJump([3, 1], 80, 2)).toEqual([])
  expect(noteJump([1], 10, 40)).toEqual([1])
  expect(noteJump([1], undefined, 40)).toEqual([1])

  const now = 100
  const merged = merge(
    [
      [{ label: '5 h', percent: 98, resetsAt: 500 }],
      [
        { label: '5 h', percent: 99.4, resetsAt: 500 },
        { label: 'Woche', percent: 99.9, resetsAt: 50 },
      ],
    ],
    now,
  )
  // Der höhere Wert gewinnt, ein schon zurückgesetztes Fenster fällt weg.
  expect(merged).toEqual([{ label: '5 h', percent: 99.4, resetsAt: 500 }])

  expect(blocking(merged, 'claude-opus-5-5', 0.5)?.label).toBe('5 h')
  expect(blocking(merged, 'claude-opus-5-5', 0.4)).toBe(null)
  // Eine eigene Grenze zieht die Pause vor.
  expect(blocking(merged, 'claude-opus-5-5', 0.5, 90)?.label).toBe('5 h')
  expect(blocking([{ label: '5 h', percent: 80, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 90)).toBe(null)
  // Ganze Prozent der App: 99 % kann 99,9 % sein, also anhalten; 98 % mit kleinem Abstand nicht.
  expect(blocking([{ label: 'Woche', percent: 99, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 99.89)?.label).toBe('Woche')
  expect(blocking([{ label: 'Woche', percent: 98, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 99.89)).toBe(null)
  expect(blocking([{ label: 'Woche', percent: 99.2, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 99.89)).toBe(null)

  // Warten lohnt nur mit Reset-Zeitpunkt innerhalb der Wartezeit (plus eine Minute Puffer).
  const soon = { label: '5 h', percent: 99.5, resetsAt: 1_000_000 + 90_000 }
  expect(canWait(soon, 1_000_000, 5 * 60_000)).toBe(true)
  expect(canWait(soon, 1_000_000, 60_000)).toBe(false)
  expect(canWait({ ...soon, resetsAt: null }, 1_000_000, 5 * 60_000)).toBe(false)
})

test('auf Englisch: Toasts, Status und Stopp, „off“ schaltet aus', { options: { language: 'en' } }, async ($, on) => {
  const seen = engine(on, 99.5, 90_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(seen.toasts.some(t => t.includes('Limit pause: 5 h is at 99.5%'))).toBe(true)
  expect(seen.toasts.some(t => t.includes('Limit reset, continuing.'))).toBe(true)

  const status = await $.command.run({ command: 'limitpause', args: '' } as never)
  expect(String((status as { text?: string }).text)).toContain('waits at most 5 min')

  const answer = await $.command.run({ command: 'limitpause', args: 'off' } as never)
  expect(String((answer as { text?: string }).text)).toContain('Limit pause is OFF')
  await step($)
  expect(seen.requests).toBe(2)
  expect(seen.naps).toBe(5)
})

test('auf Englisch: ferner Reset stoppt mit englischem Hinweis', { options: { language: 'en' } }, async ($, on) => {
  const seen = engine(on, 99.5, 3_600_000)

  await step($)

  expect(seen.requests).toBe(0)
  expect(seen.aborts).toBe(1)
  expect(seen.logs[0]).toContain('5 h is at 99.5%, free in 1 h 0 min')
  expect(seen.logs[0]).toContain('/limitpause off')
})

test('eigene Grenze: mit 90 % hält schon 89,8 % an', { options: { limitPercent: 90 } }, async ($, on) => {
  const seen = engine(on, 89.8, 90_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.naps).toBe(5)
  expect(seen.toasts.some(t => t.includes('Limit-Pause: 5 h steht bei 89,8 %'))).toBe(true)
})

// Die Zahlen der App: ganze Prozent, dazu das Wochenlimit eines Modells.
function appUsage(fable: number, week = 40, fiveHour = 10, fiveHourResetMs = 3 * 86_400_000) {
  const soon = new Date(1_000_000 + 3 * 86_400_000).toISOString()
  const fiveReset = new Date(1_000_000 + fiveHourResetMs).toISOString()
  return {
    plan: {
      status: 'ok',
      windows: [
        { label: '5-hour limit', percentUsed: fiveHour, resetsAt: fiveReset },
        { label: 'Weekly · all models', percentUsed: week, resetsAt: soon },
        { label: 'Weekly · Fable', percentUsed: fable, resetsAt: soon },
      ],
    },
    context: { status: 'ok', percentUsed: 10 },
  }
}

test('Ausweiche, Vorwarnung und Name: reine Rechnung', () => {
  const full = [
    { label: 'Woche', percent: 40, resetsAt: 500 },
    { label: 'Woche Fable', percent: 99, resetsAt: 500 },
  ]
  // Fable voll, Opus frei: Opus. Mit Opus selbst oder ohne Ausweichmodell: nichts.
  expect(reroute(full, 'claude-fable-5-2', 0.5, 'opus', 99.89)).toBe('opus')
  expect(reroute(full, 'claude-opus-5-5', 0.5, 'opus', 99.89)).toBe(null)
  expect(reroute(full, 'claude-fable-5-2', 0.5, '', 99.89)).toBe(null)
  // Die Ausweiche entscheidet nur das Modell; ist zusätzlich die allgemeine
  // Woche voll, greift danach für Opus die Pause wie sonst.
  expect(reroute([...full, { label: 'Woche', percent: 99, resetsAt: 500 }], 'claude-fable-5-2', 0.5, 'opus', 99.89)).toBe('opus')
  // Die 5 h voll: kein Modell-Fenster, also keine Ausweiche.
  expect(reroute([{ label: '5 h', percent: 99, resetsAt: 500 }], 'claude-fable-5-2', 0.5, 'opus', 99.89)).toBe(null)

  // Vorwarnung 3 Punkte vorher: 97 % (ganz, also +1) mit 0,5 Abstand warnt, 95 % nicht.
  expect(warning([{ label: 'Woche', percent: 97, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 3, 'opus', 99.89)?.label).toBe('Woche')
  expect(warning([{ label: 'Woche', percent: 95, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 3, 'opus', 99.89)).toBe(null)
  expect(warning([{ label: 'Woche', percent: 97, resetsAt: 500 }], 'claude-opus-5-5', 0.5, 0, 'opus', 99.89)).toBe(null)
  // Ein Modell-Fenster, das die Ausweiche abfängt, warnt nicht; ohne Ausweiche schon.
  expect(warning([{ label: 'Woche Fable', percent: 97, resetsAt: 500 }], 'claude-fable-5-2', 0.5, 3, 'opus', 99.89)).toBe(null)
  expect(warning([{ label: 'Woche Fable', percent: 97, resetsAt: 500 }], 'claude-fable-5-2', 0.5, 3, '', 99.89)?.label).toBe('Woche Fable')

  expect(modelName('opus')).toBe('Opus')
  expect(modelName('claude-fable-5-2')).toBe('Fable')
})

test('Fable-Woche voll: die Anfrage läuft mit Opus, ohne Stopp, Hinweis nur einmal', async ($, on) => {
  const seen = engine(on, 10, 3_600_000, appUsage(99))

  const first = await step($, 'claude-fable-5-2')
  const second = await step($, 'claude-fable-5-2')

  expect(first.answer).toBe('ok')
  expect(second.answer).toBe('ok')
  expect(seen.models).toEqual(['opus', 'opus'])
  expect(seen.aborts).toBe(0)
  expect(seen.logs.length).toBe(1)
  expect(seen.logs[0]).toContain('mit Opus statt Fable')
})

test('auch ein Agent auf Fable weicht auf Opus aus', async ($, on) => {
  const seen = engine(on, 10, 3_600_000, appUsage(99))

  await step($, 'claude-fable-5-2', 'agent-1')

  expect(seen.models).toEqual(['opus'])
})

test('Freifahrt: /limitpause einmal lässt genau eine Runde durch', async ($, on) => {
  const seen = engine(on, 99.5, 3_600_000)

  // Wie getippt: nur Befehl und Argument, den Rest füllt die Engine.
  const said = await $.command.run({ command: 'limitpause', args: 'einmal' } as never)
  expect(JSON.stringify(said)).toContain('Freifahrt')

  // Zwei Schritte derselben Runde laufen durch, die nächste Runde wird gestoppt.
  expect((await step($, STEP.model, undefined, 'frei')).answer).toBe('ok')
  expect((await step($, STEP.model, undefined, 'frei')).answer).toBe('ok')
  expect((await step($, STEP.model, undefined, 'danach')).answer).toBe('')
  expect(seen.requests).toBe(2)
  expect(seen.aborts).toBe(1)
  expect(seen.toasts.some(t => t.includes('Freifahrt'))).toBe(true)
})

test('Vorwarnung: kurz vor der Grenze ein Hinweis auf /uebergabe, nur einmal, die Anfrage läuft', async ($, on) => {
  const seen = engine(on, 97, 3_600_000)

  await step($)
  await step($)

  expect(seen.requests).toBe(2)
  expect(seen.aborts).toBe(0)
  expect(seen.toasts.filter(t => t.includes('Limit naht')).length).toBe(1)
  expect(seen.toasts[0]).toContain('/uebergabe')
})

test('Prozent: mindestens eine, höchstens zwei Nachkommastellen', () => {
  expect(pct(74)).toBe('74,0 %')
  expect(pct(99.2)).toBe('99,2 %')
  expect(pct(99.261)).toBe('99,26 %')
  expect(pct(0)).toBe('0,0 %')
})

test('Kontext genau aus den Tokens, sonst die ganze Zahl', () => {
  expect(exactContext(136_840, 1_000_000, 14)).toBe(13.68)
  expect(exactContext(undefined, 1_000_000, 14)).toBe(14)
  expect(exactContext(5, 0, 7)).toBe(7)
  expect(exactContext(undefined, undefined, undefined)).toBe(null)
})

test('Freifahrt bindet nur eine neue Runde, nicht den nächsten Schritt einer laufenden', async ($, on) => {
  const seen = engine(on, 99.5, 3_600_000)

  await $.command.run({ command: 'limitpause', args: 'einmal' } as never)
  // Schritt 1 der Runde, die beim Eintippen lief: gestoppt, Freifahrt bleibt bereit.
  const running = $.turn.step({ ...STEP, turnId: 'laufend', index: 1 })
  let piece = await running.next()
  while (!piece.done) piece = await running.next()
  expect(piece.value.answer).toBe('')
  // Die nächste Runde (Schritt 0) ist frei.
  expect((await step($, STEP.model, undefined, 'uebergabe')).answer).toBe('ok')
  expect(seen.requests).toBe(1)
})

test('Vorwarnung: die Statuszeile verschwindet, wenn danach gestoppt wird', async ($, on) => {
  const seen = engine(on, 97, 3_600_000)

  await step($)
  expect(seen.statuses.at(-1)).toContain('Limit naht')
  seen.fiveHour = 99.5
  expect((await step($, STEP.model, undefined, 'zwei')).answer).toBe('')
  expect(seen.statuses.at(-1)).toBe(undefined)
})

test('Fable-Woche voll und 5 h kurz vor dem Reset: warten, dann mit Opus', async ($, on) => {
  const seen = engine(on, 10, 3_600_000, appUsage(100, 40, 99, 90_000))

  const result = await step($, 'claude-fable-5-2')

  expect(result.answer).toBe('ok')
  expect(seen.models).toEqual(['opus'])
  expect(seen.aborts).toBe(0)
})
