import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'inventar',
  component: 'Pane',
  requestId: 'inventar',
  props: {
    title: 'In diesem Chat',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

type Engine = Parameters<TestBody>[0]

// Unter der Mod steht hier die Engine: Befehl, Leisten und Werkzeugaufrufe.
function engine(on: Parameters<TestBody>[1]) {
  const open = new Set<string>()
  on('command.register', () => ({ value: { command: 'inventar' } }))
  on('ui.open', (_, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('tool.call', () => ({ result: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { open }
}

const call = ($: Engine, tool: string, input: Record<string, unknown> = {}) =>
  $.tool.call({ tool, ...input } as unknown as Parameters<Engine['tool']['call']>[0])

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('leer steht ein Hinweis da; /inventar klappt die Leiste auf und zu', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: 'C:\\arbeit', surface: 'desktop', isInteractive: true })
  expect(w.open.size).toBe(0)

  const run = () => $.command.run({ command: 'inventar', args: '' } as unknown as Parameters<Engine['command']['run']>[0])
  expect((await run()).text).toBe('Leiste „In diesem Chat“ geöffnet.')
  expect(w.open.has('inventar')).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await texts(ui)).toContain('Noch nichts benutzt. Sobald Claude ein Werkzeug aufruft, steht es hier.')
  await ui.unmount()

  expect((await run()).text).toBe('Leiste „In diesem Chat“ geschlossen.')
  expect(w.open.has('inventar')).toBe(false)
})

test('Dateien, Skills, Links und Konnektoren werden gezählt, das Neueste steht vorn', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\\arbeit', surface: 'desktop', isInteractive: true })

  await call($, 'Read', { file_path: 'C:\\arbeit\\src\\b.ts' })
  await call($, 'Read', { file_path: 'C:\\arbeit\\src\\a.ts' })
  await call($, 'Read', { file_path: 'C:\\arbeit\\src\\a.ts' })
  await call($, 'Edit', { file_path: 'C:\\arbeit\\src\\c.ts', old_string: 'x', new_string: 'y' })
  await call($, 'Write', { file_path: 'D:\\fremd\\tief\\unten\\notiz.md', content: 'n' })
  await call($, 'Skill', { skill: 'kein-slop' })
  await call($, 'WebFetch', { url: 'https://www.example.org/seite?x=1', prompt: 'p' })
  await call($, 'mcp__598593ff-146d-4b45-a84f-b5814947cd3a__notion-fetch', { id: 'x' })
  await call($, 'mcp__598593ff-146d-4b45-a84f-b5814947cd3a__notion-search', { query: 'x' })
  await call($, 'mcp__7e1fbaad-85ff-4f61-85ef-bcf3174f2232__search_threads', { query: 'x' })
  await call($, 'mcp__Claude_Browser__navigate', { url: 'https://example.org' })
  await call($, 'mcp__plugin_legal-clinic_Descrybe__search_case_text', { query: 'x' })
  // Die eigenen Werkzeuge der App und gewöhnliche Werkzeuge zählen nicht als Konnektor.
  await call($, 'mcp__ccd_session_mgmt__get_usage')
  await call($, 'Bash', { command: 'ls' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = await texts(ui)
    expect(all).toContain('src/a.ts')
    expect(all).toContain('src/b.ts')
    expect(all).toContain('src/c.ts')
    expect(all).toContain('×2')
    expect(all).toContain('…/unten/notiz.md')
    expect(all).toContain('kein-slop')
    expect(all).toContain('example.org')
    expect(all).toContain('Notion')
    expect(all).toContain('Konnektor 7e1fbaad')
    expect(all).toContain('Browser der App')
    expect(all).toContain('Descrybe')
    expect(all.some(one => /ccd_|Bash/.test(one))).toBe(false)
    // Zuletzt gelesen wurde a.ts: Es steht vor b.ts.
    expect(all.indexOf('src/a.ts')).toBeLessThan(all.indexOf('src/b.ts'))
    await ui.unmount()
  }
})

test('die Aufgabenliste folgt update_plan: neue Liste, weiter, erledigt', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await call($, 'mcp__ccd_turn__update_plan', {
    items: [
      { content: 'Lesen', status: 'in_progress' },
      { content: 'Bauen', status: 'pending' },
      { content: 'Prüfen', status: 'pending' },
    ],
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const count = async () => (await texts(ui)).find(one => /erledigt/.test(one))
  const row = async (word: string) => (await texts(ui)).find(one => one.includes(word))
  expect(await count()).toContain('0 von 3 erledigt')

  await call($, 'mcp__ccd_turn__update_plan', { advance: true })
  expect(await count()).toContain('1 von 3 erledigt')
  expect(await row('Bauen')).toContain('● Bauen')

  await call($, 'mcp__ccd_turn__update_plan', { done: [2], start: 3 })
  expect(await count()).toContain('2 von 3 erledigt')
  expect(await row('Prüfen')).toContain('● Prüfen')

  await call($, 'TodoWrite', { todos: [{ content: 'Nur eins', status: 'completed' }] })
  expect(await count()).toContain('1 von 1 erledigt')

  await ui.press({ key: 'clear' })
  expect(await row('Nur eins')).toBeUndefined()
  await ui.unmount()
})

test('auf Englisch und mit Öffnen beim Start', { options: { language: 'en', autoOpen: true } }, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(w.open.has('inventar')).toBe(true)

  await call($, 'Read', { file_path: '/home/x/a.ts' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).some(one => one.startsWith('Files read'))).toBe(true)
  await ui.unmount()
})
