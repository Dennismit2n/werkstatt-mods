import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { withEnabled } from '../hooks/register'

type Engine = Parameters<TestBody>[0]

const PANE = {
  plugin: 'schalttafel',
  component: 'Pane',
  requestId: 'schalttafel',
  props: {
    title: 'Mods',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const HOME = 'C:\\Users\\x'
const SETTINGS_PATH = `${HOME}/.claude/settings.json`
// Eine Einstellungsdatei mit eigenwilliger Formatierung: Sie muss so bleiben.
const SETTINGS = [
  '{',
  '  "enabledPlugins": {"superpowers@superpowers-dev": true},',
  '  "outputStyle": "Proactive",',
  '  "pluginConfigs": {',
  '    "next-steps@inline": { "options": { "language": "German" } }',
  '  },',
  '  "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\\\mods\\\\statistik;C:\\\\mods\\\\waechter;C:\\\\mods\\\\schalttafel" }',
  '}',
  '',
].join('\n')

const manifest = (name: string, version: string, description: string) => JSON.stringify({ name, version, description })

// Unter der Mod steht hier die Engine: Umgebung, Dateien, Befehle und Leisten.
function engine(on: Parameters<TestBody>[1], settings: string | null = SETTINGS) {
  const w = { settings, writes: 0, toasts: [] as string[], open: new Set<string>() }
  const files: Record<string, string> = {
    'C:\\mods\\statistik/.claude-plugin/plugin.json': manifest('statistik', '0.2.1', 'Nutzungsstatistik als Seitenleiste'),
    'C:\\mods\\waechter/.claude-plugin/plugin.json': manifest('waechter', '0.3.0', 'Schützt eine Datei und bremst Agenten'),
    'C:\\mods\\schalttafel/.claude-plugin/plugin.json': manifest('schalttafel', '0.1.0', 'Diese Leiste'),
  }
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({
    value:
      e.name === 'USERPROFILE'
        ? HOME
        : e.name === 'CLAUDE_CODE_PLUGIN_DIRS'
          ? 'C:\\mods\\statistik;C:\\mods\\waechter;C:\\mods\\schalttafel'
          : undefined,
  }))
  // Die Engine reicht Pfade in ihrer eigenen Schreibweise weiter: mit / vergleichen.
  const same = (path: string) => path.replace(/\\/g, '/').toLowerCase()
  on('fs.read', (_, e) => {
    if (same(e.path) === same(SETTINGS_PATH)) {
      if (w.settings === null) throw new Error('ENOENT')
      return { value: w.settings }
    }
    const found = Object.entries(files).find(([path]) => same(path) === same(e.path))?.[1]
    if (found === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: found }
  })
  on('fs.write', (_, e) => {
    w.settings = e.text
    w.writes += 1
    return { value: undefined }
  })
  on('command.list', () => ({
    value: [
      { name: 'statistik', description: 'd', source: 'plugin', plugin: 'statistik' },
      { name: 'agentenbremse', description: 'd', source: 'plugin', plugin: 'waechter@inline' },
      { name: 'help', description: 'd', source: 'builtin' },
    ],
  }))
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    w.open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    w.open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...w.open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  return w
}

const run = ($: Engine) => $.command.run({ command: 'mods', args: '' } as unknown as Parameters<Engine['command']['run']>[0])
const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('withEnabled ändert nur enabledPlugins und lässt den Rest der Datei Zeichen für Zeichen stehen', () => {
  const off = withEnabled(SETTINGS, 'waechter@inline', false)
  expect(off).not.toBeNull()
  expect(JSON.parse(off ?? '').enabledPlugins).toEqual({ 'superpowers@superpowers-dev': true, 'waechter@inline': false })
  // Alles ab der zweiten Einstellung ist unverändert.
  const tail = SETTINGS.slice(SETTINGS.indexOf('  "outputStyle"'))
  expect(off?.endsWith(tail)).toBe(true)

  // Einschalten nimmt den Eintrag eines Ordner-Mods wieder weg.
  const on = withEnabled(off ?? '', 'waechter@inline', true)
  expect(JSON.parse(on ?? '').enabledPlugins).toEqual({ 'superpowers@superpowers-dev': true })
  // Ein Plugin aus einem Marketplace behält seinen Eintrag, nur der Wert wechselt.
  const other = withEnabled(SETTINGS, 'superpowers@superpowers-dev', false)
  expect(JSON.parse(other ?? '').enabledPlugins).toEqual({ 'superpowers@superpowers-dev': false })
})

test('withEnabled: ohne enabledPlugins wird der Eintrag angelegt; kaputtes JSON bleibt unangetastet', () => {
  const plain = '{\n  "theme": "dark"\n}\n'
  const off = withEnabled(plain, 'flugdeck@inline', false)
  expect(JSON.parse(off ?? '')).toEqual({ enabledPlugins: { 'flugdeck@inline': false }, theme: 'dark' })
  expect(JSON.parse(withEnabled('{}', 'flugdeck@inline', false) ?? '')).toEqual({ enabledPlugins: { 'flugdeck@inline': false } })

  expect(withEnabled('{ kaputt', 'flugdeck@inline', false)).toBeNull()
  expect(withEnabled('[]', 'flugdeck@inline', false)).toBeNull()
  expect(withEnabled('{"enabledPlugins": []}', 'flugdeck@inline', false)).toBeNull()
  // Eine geschweifte Klammer in einer Zeichenkette verwirrt die Suche nach dem Ende nicht.
  const tricky = '{"enabledPlugins": {"a}b@x": true}, "note": "}{"}'
  expect(JSON.parse(withEnabled(tricky, 'c@inline', false) ?? '')).toEqual({
    enabledPlugins: { 'a}b@x': true, 'c@inline': false },
    note: '}{',
  })
})

test('/mods zeigt jeden Mod mit Version, Zustand und Befehlen; der Schalter schreibt die Einstellungen', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await run($)).text).toBe('Schalttafel geöffnet.')
  expect(w.open.has('schalttafel')).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = (await texts(ui)).join('\n')
    expect(all).toContain('3 von 3 laufen in dieser Sitzung')
    expect(all).toContain('statistik 0.2.1')
    expect(all).toContain('waechter 0.3.0')
    expect(all).toContain('Befehle: /statistik')
    expect(all).toContain('Befehle: /agentenbremse')
    expect(all).toContain('Weitere Plugins')
    expect(all).toContain('superpowers')
    expect(all).toContain('diese Leiste')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Die Schalttafel selbst hat keinen Schalter.
  expect(await ui.find({ type: 'Button', key: 'toggle-schalttafel@inline' })).toBeUndefined()

  await ui.press({ key: 'toggle-waechter@inline' })
  expect(w.writes).toBe(1)
  expect(JSON.parse(w.settings ?? '').enabledPlugins['waechter@inline']).toBe(false)
  expect(w.settings).toContain('"outputStyle": "Proactive",')
  expect(w.toasts.at(-1)).toBe('waechter ist ab der nächsten Sitzung aus.')
  // In dieser Sitzung läuft er weiter, die Zeile sagt beides.
  expect((await texts(ui)).join('\n')).toContain('aktiv, ab der nächsten Sitzung aus')
  expect((await texts(ui)).join('\n')).toContain('3 von 3 laufen in dieser Sitzung')

  await ui.press({ key: 'toggle-waechter@inline' })
  expect(w.writes).toBe(2)
  expect(JSON.parse(w.settings ?? '').enabledPlugins).toEqual({ 'superpowers@superpowers-dev': true })
  expect(w.toasts.at(-1)).toBe('waechter ist ab der nächsten Sitzung wieder an.')
  await ui.unmount()

  expect((await run($)).text).toBe('Schalttafel geschlossen.')
})

test('ein beim Start abgeschalteter Mod steht als „aus“ da und lässt sich wieder einschalten', async ($, on) => {
  const w = engine(on, SETTINGS.replace('{"superpowers@superpowers-dev": true}', '{"statistik@inline": false}'))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).join('\n')).toContain('2 von 3 laufen in dieser Sitzung')
  expect(await texts(ui)).toContain('aus')

  await ui.press({ key: 'toggle-statistik@inline' })
  expect(JSON.parse(w.settings ?? '').enabledPlugins).toEqual({})
  expect((await texts(ui)).join('\n')).toContain('aus, ab der nächsten Sitzung an')
  await ui.unmount()
})

test('ohne Einstellungsdatei: Liste mit Hinweis, der Schalter schreibt nichts', async ($, on) => {
  const w = engine(on, null)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await texts(ui)).toContain('Die Einstellungsdatei von Claude Code wurde nicht gefunden.')
  await ui.press({ key: 'toggle-waechter@inline' })
  expect(w.writes).toBe(0)
  expect(w.toasts.at(-1)).toBe('Die Einstellungsdatei von Claude Code wurde nicht gefunden.')
  await ui.unmount()
})

test('auf Englisch: Überschrift, Zustand und Meldung', { options: { language: 'en' } }, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await run($)).text).toBe('Switchboard opened.')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).join('\n')).toContain('3 of 3 run in this session')
  await ui.press({ key: 'toggle-statistik@inline' })
  expect(w.toasts.at(-1)).toBe('statistik is off from the next session.')
  await ui.unmount()
})
