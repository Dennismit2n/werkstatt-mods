import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'uebergabe',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const FILE = 'C:\\Users\\x\\notizen\\uebergabe-2026-11-11.md'

type World = { tokens: number; sent: string[]; toasts: string[]; copied: string[]; settle: () => Promise<void> }

// Unter der Mod steht hier die Engine: Nutzung, Eingabe, Toast, Zwischenablage
// und was andere Mods im Band zeichnen.
function engine(on: Parameters<TestBody>[1], tokens: number) {
  // Das Absenden läuft über einen Zeitgeber: settle stellt die Uhr vor und lässt ihn feuern.
  const clock = mock.clock(on, { now: 1_000_000 })
  const w: World = {
    tokens,
    sent: [],
    toasts: [],
    copied: [],
    settle: async () => {
      await clock.advance(5)
      await clock.settle()
    },
  }
  on('command.register', () => ({ value: { command: 'uebergabe' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: w.tokens, window: 1_000_000, percent: w.tokens / 10_000 }, rateLimits: [] },
  }))
  on('prompt.submit', (_, e) => {
    w.sent.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_, e) => {
    w.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['unten'] }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return w
}

type Engine = Parameters<TestBody>[0]
const done = ($: Engine, answer: string, agentId?: string) =>
  $.turn.complete({
    turnId: 't1',
    answer,
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  } as unknown as Parameters<Engine['turn']['complete']>[0])

const find = async (
  ui: { find: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<{ text: string } | undefined> },
  pattern: RegExp,
) => (await ui.find({ type: 'Text', text: pattern }))?.text

test('unter der Grenze bleibt das Band, wie es ist', async ($, on) => {
  engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await done($, 'fertig')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await find(ui, /Übergabe/)).toBeUndefined()
  expect(await find(ui, /^unten$/)).toBe('unten')
  await ui.unmount()
})

test('ab der Grenze: Hinweis mit Tokenstand, „Später“ blendet ihn aus, bis der Kontext gewachsen ist', async ($, on) => {
  const w = engine(on, 262_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await done($, 'fertig')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await find(ui, /Kontext bei/)).toBe('Kontext bei 262.000 Token: Zeit für eine Übergabe an eine frische Sitzung?')
    expect(await find(ui, /^unten$/)).toBe('unten')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'uebergabe-later' })
  expect(await find(ui, /Kontext bei/)).toBeUndefined()

  // 30.000 Token mehr: noch still. 60.000 mehr: wieder da.
  w.tokens = 292_000
  await done($, 'weiter')
  expect(await find(ui, /Kontext bei/)).toBeUndefined()
  w.tokens = 322_000
  await done($, 'weiter')
  expect(await find(ui, /Kontext bei/)).toContain('322.000')
  await ui.unmount()
})

test('der Knopf lässt Claude die Übergabe schreiben; die Pfadzeile der Antwort macht sie bereit', async ($, on) => {
  const w = engine(on, 262_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await done($, 'fertig')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'uebergabe-write' })
  await w.settle()
  expect(w.sent.length).toBe(1)
  expect(w.sent[0]).toContain('Schreibe jetzt eine Übergabe')
  expect(w.sent[0]).toContain('ÜBERGABE: <voller Pfad der Datei>')
  expect(await find(ui, /wird geschrieben/)).toBe('Übergabe wird geschrieben …')

  // Die Antwort eines Subagenten zählt nicht.
  await done($, `ÜBERGABE: C:\\falsch.md`, 'a1')
  expect(await find(ui, /wird geschrieben/)).toBe('Übergabe wird geschrieben …')

  await done($, `Die Übergabe steht.\n\nÜBERGABE: \`${FILE}\``)
  expect(await find(ui, /liegt bereit/)).toBe('Übergabe liegt bereit: uebergabe-2026-11-11.md')

  await ui.press({ key: 'uebergabe-copy' })
  expect(w.copied).toEqual([FILE])
  expect(w.toasts.at(-1)).toBe('Pfad der Übergabe kopiert.')

  await ui.press({ key: 'uebergabe-start' })
  await w.settle()
  expect(w.sent.length).toBe(2)
  expect(w.sent[1]).toContain(`Starte eine neue Sitzung, die mit dieser Übergabe weiterarbeitet: ${FILE}`)
  expect(await find(ui, /liegt bereit/)).toBeUndefined()
  await ui.unmount()
})

test('/uebergabe geht auch unter der Grenze; eine Antwort ohne Pfadzeile setzt zurück', async ($, on) => {
  const w = engine(on, 40_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const run = () => $.command.run({ command: 'uebergabe', args: '' } as unknown as Parameters<Engine['command']['run']>[0])
  const first = await run()
  await w.settle()
  expect(first.text).toContain('Übergabe angefordert')
  const again = await run()
  await w.settle()
  expect(again.text).toBe('Die Übergabe wird schon geschrieben.')
  expect(w.sent.length).toBe(1)

  await done($, 'Ich habe es mir anders überlegt.')
  expect(w.toasts.at(-1)).toContain('nannte keinen Pfad')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await find(ui, /wird geschrieben/)).toBeUndefined()
  await ui.unmount()
})

test(
  'eigene Einstellungen: fester Ordner im Auftrag, Hinweis abgeschaltet',
  { options: { folder: 'D:\\Notizen\\Übergaben', thresholdTokens: 0 } },
  async ($, on) => {
    const w = engine(on, 900_000)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await done($, 'fertig')

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await find(ui, /Kontext bei/)).toBeUndefined()
    await ui.unmount()

    await $.command.run({ command: 'uebergabe', args: '' } as unknown as Parameters<Engine['command']['run']>[0])
    await w.settle()
    expect(w.sent[0]).toContain('im Ordner D:\\Notizen\\Übergaben')
  },
)

test('auf Englisch: Hinweis, Auftrag und die Zeile HANDOFF', { options: { language: 'en' } }, async ($, on) => {
  const w = engine(on, 262_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await done($, 'done')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await find(ui, /Context at/)).toBe('Context at 262,000 tokens: time for a handoff to a fresh session?')
  await ui.press({ key: 'uebergabe-write' })
  await w.settle()
  expect(w.sent[0]).toContain('HANDOFF: <full path of the file>')
  await done($, 'HANDOFF: /home/x/handoff.md')
  expect(await find(ui, /is ready/)).toBe('Handoff is ready: handoff.md')
  await ui.unmount()
})
