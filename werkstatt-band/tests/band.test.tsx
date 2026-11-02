import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'werkstatt-band',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const NOW = Date.parse('2026-10-31T01:00:00Z')

// So antwortet das App-Werkzeug get_usage (echte Antwort vom 31.10.2026,
// das Guthaben zusätzlich einmal eingeschaltet).
function appUsage(extraUsage: object) {
  return JSON.stringify({
    plan: {
      status: 'ok',
      plan: 'Pro',
      windows: [
        { label: '5-hour limit', percentUsed: 12, resetsAt: '2026-10-31T04:40:00.493Z', resetsIn: '3h 23m' },
        { label: 'Weekly · all models', percentUsed: 15, resetsAt: '2026-11-02T00:00:00.493Z' },
        { label: 'Weekly · Fable', percentUsed: 0, resetsAt: '2026-11-02T00:00:00.000Z' },
      ],
      extraUsage,
    },
    context: { session: 'self', status: 'ok', percentUsed: 50, autoCompactsAtPercent: 97 },
  })
}

function engine(
  on: Parameters<TestBody>[1],
  toasts: string[],
  app?: string,
  decision: 'allow' | 'ask' | 'deny' = 'allow',
  usageCalls: string[] = [],
) {
  on('command.register', () => ({ value: { command: 'limits' } }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: NOW }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined }
  })
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 37, resetsAt: '2026-10-31T03:13:00Z' },
        { kind: 'seven_day', percentUsed: 91.5, resetsAt: '2026-11-03T05:00:00Z' },
      ],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Steht für die Mods hinter diesem in der Kette und für die Engine: Das Band
  // ruft next(e) und stellt deren Zeilen unter sich.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['unten'] }))
  on('tool.check', () => ({ decision }))
  on('tool.call', (_, e) => {
    if (String(e.tool) !== 'mcp__ccd_session_mgmt__get_usage') return { result: {} }
    usageCalls.push(String(e.tool))
    return app !== undefined ? { result: [{ type: 'text', text: app }] } : { result: {} }
  })
}

test('verlangt das App-Werkzeug eine Freigabe, ruft der Mod es nicht auf', async ($, on) => {
  const usageCalls: string[] = []
  engine(on, [], appUsage({ enabled: false, currency: 'USD' }), 'ask', usageCalls)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(usageCalls).toEqual([])
  expect(await ui.find({ type: 'Text', text: /^Woche Fable$/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^37 %$/ }))?.text).toBe('37 %')
  await ui.unmount()
})

test('mit der App: 5 h, Woche, Woche Fable und Kontext; ausgeschaltetes Guthaben fehlt', async ($, on) => {
  engine(on, [], appUsage({ enabled: false, currency: 'USD' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /^5 h$/ }))?.text).toBe('5 h')
    expect((await ui.find({ type: 'Text', text: /^Woche$/ }))?.text).toBe('Woche')
    expect((await ui.find({ type: 'Text', text: /^Woche Fable$/ }))?.text).toBe('Woche Fable')
    expect((await ui.find({ type: 'Text', text: /^12 %$/ }))?.text).toBe('12 %')
    expect((await ui.find({ type: 'Text', text: /^0 %$/ }))?.text).toBe('0 %')
    expect(await ui.find({ type: 'Text', text: /^Guthaben$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^50 %$/ }))?.text).toBe('50 %')
    await ui.unmount()
  }
})

test('mit der App und eingeschaltetem Guthaben: Anteil und Betrag', async ($, on) => {
  engine(on, [], appUsage({ enabled: true, currency: 'USD', used: 1.25, limit: 5 }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^25 %$/ }))?.text).toBe('25 %')
  expect((await ui.find({ type: 'Text', text: /1,25/ }))?.text).toBe('· 1,25 von 5,00 USD')
  await ui.unmount()
})

test('das Band zeigt 5 h, Woche und Kontext auf jeder Oberfläche', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /^37 %$/ }))?.text).toBe('37 %')
    expect((await ui.find({ type: 'Text', text: /^91,5 %$/ }))?.text).toBe('91,5 %')
    expect((await ui.find({ type: 'Text', text: /^42 %$/ }))?.text).toBe('42 %')
    expect((await ui.find({ type: 'Text', text: /2:13 h/ }))?.text).toBe('(2:13 h)')
    expect((await ui.find({ type: 'Text', text: /3 T/ }))?.text).toBe('(3 T 4 h)')
    await ui.unmount()
  }
})

test('Limits klappt das Band ein, die Knöpfe bleiben, /limits klappt es wieder aus', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'statistik' })).toBeDefined()
    await ui.press({ key: 'toggle-band' })
    expect(await ui.find({ type: 'Text', text: /^37 %$/ })).toBeUndefined()
    expect(await ui.find({ key: 'statistik' })).toBeDefined()
    expect(await ui.find({ key: 'toggle-band' })).toBeDefined()
    await ui.unmount()

    // origin und presentation setzt sonst die Engine; der Mod liest sie nicht.
    await $.command.run({ command: 'limits', args: '' } as Parameters<typeof $.command.run>[0])
    const again = await $.ui.mount({ ...BAND, surface })
    expect((await again.find({ type: 'Text', text: /^37 %$/ }))?.text).toBe('37 %')
    await again.unmount()
  }
})

test('was andere Mods und die Engine im Band zeichnen, bleibt unter dem Band stehen, auch eingeklappt', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^37 %$/ }))?.text).toBe('37 %')
    expect((await ui.find({ type: 'Text', text: /^unten$/ }))?.text).toBe('unten')
    await ui.press({ key: 'toggle-band' })
    expect(await ui.find({ type: 'Text', text: /^37 %$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^unten$/ }))?.text).toBe('unten')
    await ui.unmount()
    await $.command.run({ command: 'limits', args: '' } as Parameters<typeof $.command.run>[0])
  }
})

test('News-Erinnerung nach einer sichtbaren Änderung, weg nach news.js', async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call({
    tool: 'Write',
    file_path: 'C:\\Users\\danyr\\source\\repos\\spectroton\\index.html',
    content: "<p>It's done — fertig</p>",
  })
  await $.tool.call({
    tool: 'Edit',
    file_path: 'C:\\Users\\danyr\\source\\repos\\pocketsum\\README.md',
    old_string: 'a',
    new_string: 'b',
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Geändert/ }))?.text).toBe('Geändert: Spectroton.')
  expect(toasts.join(' ')).toContain('1 gerader Apostroph')
  expect(toasts.join(' ')).toContain('1 Gedankenstrich')
  await ui.unmount()

  await $.tool.call({
    tool: 'Edit',
    file_path: 'C:\\Users\\danyr\\source\\repos\\dennismit2n.github.io\\js\\news.js',
    old_string: 'x',
    new_string: 'y',
  })
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await after.find({ type: 'Text', text: /Geändert/ })).toBeUndefined()
  await after.unmount()
})

test('auf Englisch: Fenster, Prozent, Knöpfe, News und Textprüfer', { options: { language: 'en' } }, async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts, appUsage({ enabled: false, currency: 'USD' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call({
    tool: 'Write',
    file_path: 'C:\\Users\\danyr\\source\\repos\\spectroton\\index.html',
    content: "<p>It's done — fertig</p>",
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Week Fable$/ }))?.text).toBe('Week Fable')
  expect((await ui.find({ type: 'Text', text: /^12%$/ }))?.text).toBe('12%')
  expect((await ui.find({ type: 'Text', text: /^Statistics$/ }))?.text).toBe('Statistics')
  expect((await ui.find({ type: 'Text', text: /Changed/ }))?.text).toBe('Changed: Spectroton.')
  expect((await ui.find({ type: 'Text', text: /news\.js/ }))?.text).toBe('Add a line to news.js?')
  expect(toasts.join(' ')).toContain('1 straight apostrophe')
  expect(toasts.join(' ')).toContain('1 dash')
  await ui.unmount()
})

test(
  'eigene Einstellungen: anderer Repo-Ordner, andere News-Datei, Textprüfer aus',
  {
    options: {
      reposRoot: '/home/x/code/',
      newsFile: '/site/news/latest.js',
      toolRepos: ['meintool=Mein Tool', 'nurordner'],
      textCheck: false,
    },
  },
  async ($, on) => {
    const toasts: string[] = []
    engine(on, toasts)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

    await $.tool.call({ tool: 'Write', file_path: '/home/x/code/meintool/index.html', content: "It's — x" })
    await $.tool.call({ tool: 'Write', file_path: '/home/x/code/nurordner/app.js', content: 'x' })
    // Der alte Repo-Ordner zählt mit der neuen Einstellung nicht mehr.
    await $.tool.call({
      tool: 'Write',
      file_path: 'C:\\Users\\danyr\\source\\repos\\spectroton\\index.html',
      content: "It's",
    })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /Geändert/ }))?.text).toBe('Geändert: Mein Tool, nurordner.')
    expect((await ui.find({ type: 'Text', text: /latest\.js/ }))?.text).toBe('Satz in latest.js nachziehen?')
    expect(toasts).toEqual([])
    await ui.unmount()

    await $.tool.call({ tool: 'Edit', file_path: '/site/news/latest.js', old_string: 'a', new_string: 'b' })
    const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await after.find({ type: 'Text', text: /Geändert/ })).toBeUndefined()
    await after.unmount()
  },
)
