import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { appliesTo, blocking, canWait, gapFor, merge, noteJump } from '../hooks/register'

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 }

// Unter dem Mod steht hier die Engine: Uhr, Limits, Kindprozess und die Anfrage selbst.
// resetsInMs null: Das 5-h-Fenster nennt keinen Reset-Zeitpunkt.
function engine(on: On, fiveHour: number, resetsInMs: number | null) {
  const seen = {
    fiveHour,
    now: 1_000_000,
    requests: 0,
    naps: 0,
    aborts: 0,
    toasts: [] as string[],
    logs: [] as string[],
    registered: null as unknown,
    // Hält den Schläfer an, bis der Test ihn weiterlaufen lässt.
    onNap: null as (() => Promise<void>) | null,
  }
  const resetsAt = resetsInMs === null ? undefined : new Date(seen.now + resetsInMs).toISOString()

  on('clock.now', () => ({ value: seen.now }))
  on('tool.check', () => ({ decision: 'deny', reason: 'kein App-Werkzeug im Test' }) as never)
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
  on('ui.status', () => ({ value: undefined }) as never)
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
  on('turn.step', async function* () {
    seen.requests += 1
    return { turnId: 't1', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  return seen
}

async function step($: Engine, model = STEP.model, agentId?: string) {
  // Die Stücke der Antwort sind egal, es zählt, was am Ende zurückkommt.
  const stream = $.turn.step({ ...STEP, model, ...(agentId === undefined ? {} : { agentId }) })
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
