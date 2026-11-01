import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { appliesTo, blocking, gapFor, merge, noteJump } from '../hooks/register'

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 }

// Unter dem Mod steht hier die Engine: Uhr, Limits, Kindprozess und die Anfrage selbst.
// resetsInMs null: Das 5-h-Fenster nennt keinen Reset-Zeitpunkt.
function engine(on: On, fiveHour: number, resetsInMs: number | null) {
  const seen = {
    fiveHour,
    now: 1_000_000,
    requests: 0,
    naps: 0,
    toasts: [] as string[],
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
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-surface' } }) as never)
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

async function step($: Engine, model = STEP.model) {
  // Die Stücke der Antwort sind egal, es zählt, was am Ende zurückkommt.
  const stream = $.turn.step({ ...STEP, model })
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
})

test('kurz vor der Grenze wartet die Anfrage bis nach dem Reset und geht dann raus', async ($, on) => {
  const seen = engine(on, 99.5, 90_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // 90 s bis zum Reset plus eine Minute Puffer, in 30-s-Häppchen.
  expect(seen.naps).toBe(5)
  expect(seen.toasts.some(t => t.includes('Limit-Pause'))).toBe(true)
  expect(seen.toasts.some(t => t.includes('es geht weiter'))).toBe(true)
})

test('mit /limitpause aus läuft auch eine volle Anfrage durch', async ($, on) => {
  const seen = engine(on, 99.8, 3_600_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const answer = await $.command.run({ command: 'limitpause', args: 'aus' } as never)
  expect(String((answer as { text?: string }).text)).toContain('AUS')

  await step($)
  expect(seen.requests).toBe(1)
  expect(seen.naps).toBe(0)
})

test('/limitpause läuft sofort, auch mitten in einer Runde', async ($, on) => {
  const seen = engine(on, 50, 3_600_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((seen.registered as { immediate?: boolean }).immediate).toBe(true)
})

test('/limitpause aus gibt eine schon wartende Anfrage sofort frei', async ($, on) => {
  const seen = engine(on, 99.8, 3_600_000)
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
  // Freigegeben beim ersten Lebenszeichen, nicht erst nach dem Reset in einer Stunde.
  expect(seen.naps).toBe(1)
  expect(seen.toasts.some(t => t.includes('von Hand'))).toBe(true)
})

test('ohne Reset-Zeitpunkt geht die Anfrage nach einer halben Stunde trotzdem raus', async ($, on) => {
  const seen = engine(on, 99.5, null)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // 30 min in 30-s-Häppchen.
  expect(seen.naps).toBe(60)
  expect(seen.toasts.some(t => t.includes('keinen Reset-Zeitpunkt'))).toBe(true)
})

test('ohne Reset-Zeitpunkt wird alle fünf Minuten neu gemessen', async ($, on) => {
  const seen = engine(on, 99.5, null)
  // Nach anderthalb Minuten ist wieder Luft, gemerkt wird das bei der nächsten Messung.
  seen.onNap = async () => {
    if (seen.naps === 3) seen.fiveHour = 50
  }

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.requests).toBe(1)
  // 5 min in 30-s-Häppchen, nicht die volle halbe Stunde.
  expect(seen.naps).toBe(10)
  expect(seen.toasts.some(t => t.includes('keinen Reset-Zeitpunkt'))).toBe(false)
})

test('ein Wochenlimit eines Modells gilt nur für dieses Modell', () => {
  expect(appliesTo('Woche Fable', 'claude-fable-5-1')).toBe(true)
  expect(appliesTo('Woche Fable', 'claude-opus-5-5')).toBe(false)
  expect(appliesTo('5 h', 'claude-opus-5-5')).toBe(true)
  expect(appliesTo('Woche', 'claude-opus-5-5')).toBe(true)
})

test('Abstand, Zusammenführen und Grenze', () => {
  expect(gapFor(0)).toBe(0.5)
  expect(gapFor(0.4)).toBe(0.8)
  expect(gapFor(9)).toBe(5)

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
})

test('auf Englisch: Toasts und Status, „off“ schaltet aus', { options: { language: 'en' } }, async ($, on) => {
  const seen = engine(on, 99.5, 90_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(seen.toasts.some(t => t.includes('Limit pause: 5 h is at 99.5%'))).toBe(true)
  expect(seen.toasts.some(t => t.includes('Limit reset, continuing.'))).toBe(true)

  const answer = await $.command.run({ command: 'limitpause', args: 'off' } as never)
  expect(String((answer as { text?: string }).text)).toContain('Limit pause is OFF')
  await step($)
  expect(seen.requests).toBe(2)
  expect(seen.naps).toBe(5)
})

test('eigene Grenze: mit 90 % hält schon 89,8 % an', { options: { limitPercent: 90 } }, async ($, on) => {
  const seen = engine(on, 89.8, 90_000)

  const result = await step($)

  expect(result.answer).toBe('ok')
  expect(seen.naps).toBe(5)
  expect(seen.toasts.some(t => t.includes('Limit-Pause: 5 h steht bei 89,8 %'))).toBe(true)
})
