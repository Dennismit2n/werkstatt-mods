import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModRow } from '../types'
import { setLanguage, t } from './text'

// Schalttafel: eine Leiste mit allen Mods, die über CLAUDE_CODE_PLUGIN_DIRS
// geladen werden, dazu die übrigen Plugins aus den Einstellungen. Der Schalter
// schreibt nur den Eintrag enabledPlugins in ~/.claude/settings.json; alles
// andere in der Datei bleibt Zeichen für Zeichen stehen. Die Engine lädt Mods
// beim Start einer Sitzung, ein Schalter gilt deshalb ab der nächsten.
const PANE = 'schalttafel'
const SELF = 'schalttafel@inline'

const rows = atom({ plugin: 'schalttafel', key: 'rows' } as const, null, { shape: 'rows-1' })
const note = atom({ plugin: 'schalttafel', key: 'note' } as const, '')

const BLUE = '#2f86c9'
const AMBER = '#c98a3a'
const GRAY = '#8e919a'

// Welche Kennungen beim Start dieser Sitzung abgeschaltet waren; null, solange
// die Einstellungen noch nicht gelesen sind.
let offAtStart: Set<string> | null = null

type Json = Record<string, unknown>
const asRecord = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null

// Das Ende des Objekts, das bei start mit „{“ beginnt; -1, wenn es nicht schließt.
// Zeichenketten werden übersprungen, damit eine Klammer darin nicht zählt.
function objectEnd(text: string, start: number) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Der Text der Einstellungsdatei mit einem geänderten Eintrag in
// enabledPlugins; null, wenn sich die Datei nicht sicher ändern lässt.
// Ein Mod aus einem Ordner ist ohne Eintrag an: Einschalten nimmt den Eintrag
// weg, Ausschalten setzt ihn auf false. Geändert wird nur dieses eine Objekt,
// und das Ergebnis wird gegen das Original geprüft.
export function withEnabled(text: string, key: string, isEnabled: boolean): string | null {
  let before: Json | null
  try {
    before = asRecord(JSON.parse(text))
  } catch {
    return null
  }
  if (before === null) return null
  const current = asRecord(before.enabledPlugins) ?? {}
  if (before.enabledPlugins !== undefined && asRecord(before.enabledPlugins) === null) return null

  const next: Json = { ...current }
  if (isEnabled && key.endsWith('@inline')) delete next[key]
  else next[key] = isEnabled

  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const entries = Object.entries(next)
  const rendered =
    entries.length === 0
      ? '{}'
      : `{${nl}${entries.map(([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`).join(`,${nl}`)}${nl}  }`

  let out: string
  const found = /"enabledPlugins"\s*:\s*\{/.exec(text)
  if (found) {
    const open = found.index + found[0].length - 1
    const close = objectEnd(text, open)
    if (close < 0) return null
    out = text.slice(0, open) + rendered + text.slice(close + 1)
  } else {
    const first = text.indexOf('{')
    const isEmpty = Object.keys(before).length === 0
    out = `${text.slice(0, first + 1)}${nl}  "enabledPlugins": ${rendered}${isEmpty ? nl : ','}${text.slice(first + 1)}`
  }

  // Gegenprobe: gültiges JSON, enabledPlugins wie gewollt, alles andere unverändert.
  let after: Json | null
  try {
    after = asRecord(JSON.parse(out))
  } catch {
    return null
  }
  if (after === null || JSON.stringify(after.enabledPlugins) !== JSON.stringify(next)) return null
  const others = (data: Json) => Object.keys(data).filter(name => name !== 'enabledPlugins')
  if (others(before).join('\n') !== others(after).join('\n')) return null
  for (const name of others(before)) {
    if (JSON.stringify(before[name]) !== JSON.stringify(after[name])) return null
  }
  return out
}

async function settingsPath($: EngineInterface) {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom) return `${custom.replace(/[\\/]+$/, '')}/settings.json`
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  return home ? `${home.replace(/[\\/]+$/, '')}/.claude/settings.json` : null
}

async function readSettings($: EngineInterface): Promise<{ path: string; text: string; enabled: Json } | null> {
  const path = await settingsPath($)
  if (path === null) return null
  try {
    const raw = await $.fs.read(path)
    if (typeof raw !== 'string') return null
    const enabled = asRecord(asRecord(JSON.parse(raw))?.enabledPlugins) ?? {}
    return { path, text: raw, enabled }
  } catch {
    return null
  }
}

// Liest die Mod-Ordner, ihre Manifeste, die Einstellungen und die Befehlsliste.
async function refresh($: EngineInterface) {
  const text = t()
  const settings = await readSettings($)
  const enabled = settings?.enabled ?? {}
  const off = new Set(Object.entries(enabled).flatMap(([key, value]) => (value === false ? [key] : [])))
  if (offAtStart === null) offAtStart = off

  const commands = new Map<string, string[]>()
  try {
    for (const one of await $.command.list()) {
      if (one.source !== 'plugin' || !one.plugin) continue
      const owner = one.plugin.split('@')[0] ?? one.plugin
      commands.set(owner, [...(commands.get(owner) ?? []), one.name])
    }
  } catch {
    // Ohne Befehlsliste bleibt die Zeile „Befehle“ weg.
  }

  const dirs = ((await $.env.get('CLAUDE_CODE_PLUGIN_DIRS')) ?? '')
    .split(/[;\n]/)
    .map(dir => dir.trim())
    .filter(Boolean)
  const list: ModRow[] = []
  for (const dir of dirs) {
    let manifest: Json | null = null
    try {
      const raw = await $.fs.read(`${dir.replace(/[\\/]+$/, '')}/.claude-plugin/plugin.json`)
      manifest = typeof raw === 'string' ? asRecord(JSON.parse(raw)) : null
    } catch {
      manifest = null
    }
    const fallback = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
    const name = typeof manifest?.name === 'string' ? manifest.name : fallback
    const key = `${name}@inline`
    if (list.some(row => row.key === key)) continue
    list.push({
      key,
      name,
      version: typeof manifest?.version === 'string' ? manifest.version : '',
      description: typeof manifest?.description === 'string' ? manifest.description : '',
      commands: commands.get(name) ?? [],
      isInline: true,
      isLoaded: !offAtStart.has(key),
      isEnabled: !off.has(key),
    })
  }
  // Die übrigen Plugins stehen nur mit ihrer Kennung in den Einstellungen.
  for (const [key, value] of Object.entries(enabled)) {
    if (key.endsWith('@inline') || typeof value !== 'boolean') continue
    const name = key.split('@')[0] ?? key
    list.push({
      key,
      name,
      version: '',
      description: key,
      commands: commands.get(name) ?? [],
      isInline: false,
      isLoaded: !offAtStart.has(key),
      isEnabled: value,
    })
  }

  await update($, rows, () => list)
  await update($, note, () => (settings === null ? text.noSettings : dirs.length === 0 ? text.noMods : ''))
}

async function toggle($: EngineInterface, row: ModRow) {
  const text = t()
  const settings = await readSettings($)
  if (settings === null) {
    $.ui.toast(text.noSettings)
    return
  }
  const wanted = !row.isEnabled
  const next = withEnabled(settings.text, row.key, wanted)
  if (next === null) {
    $.ui.toast(text.unreadable)
    return
  }
  try {
    await $.fs.write(settings.path, next)
  } catch (err) {
    $.ui.toast(text.writeFailed(err instanceof Error ? err.message : String(err)))
    return
  }
  $.ui.toast(wanted ? text.nowOn(row.name) : text.nowOff(row.name))
  await refresh($)
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export const register: Register = (on, options) => {
  setLanguage(options.language)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: t().commandDescription,
    })
    // Merken, was beim Start abgeschaltet war: Das ist, was in dieser Sitzung fehlt.
    const settings = await readSettings($)
    offAtStart = new Set(Object.entries(settings?.enabled ?? {}).flatMap(([key, value]) => (value === false ? [key] : [])))

    return next(e)
  })

  // /mods klappt die Leiste auf und zu.
  on('command.run', { command: 'mods' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      return { text: t().closed }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: t().title })

    return { text: t().opened }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()
    const list = await read($, rows)
    const message = await read($, note)

    if (list === null) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>{text.reading}</Text>
          <Button key="refresh" plain onPress={() => void refresh($)}>
            <Text size="footnote" color={BLUE}>
              {text.refresh}
            </Text>
          </Button>
        </Box>
      )
    }

    const stateText = (row: ModRow) =>
      row.isLoaded ? (row.isEnabled ? text.active : text.activeThenOff) : row.isEnabled ? text.offThenOn : text.off
    const stateColor = (row: ModRow) => (row.isLoaded !== row.isEnabled ? AMBER : row.isLoaded ? BLUE : GRAY)

    const view = (row: ModRow) => (
      <Box key={row.key} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Box flexShrink={1} flexGrow={1}>
            <Text size="footnote" wrap="truncate-end">
              <Text color={stateColor(row)}>{row.isLoaded ? '●' : '○'}</Text>{' '}
              <Text weight="semibold">{row.name}</Text>
              {row.version ? <Text dimColor> {row.version}</Text> : null}
            </Text>
          </Box>
          <Box flexShrink={0}>
            {row.key === SELF ? (
              <Text size="caption" dimColor>
                {text.self}
              </Text>
            ) : (
              <Button key={`toggle-${row.key}`} plain onPress={() => void toggle($, row)}>
                <Text size="caption" color={BLUE}>
                  {row.isEnabled ? text.turnOff : text.turnOn}
                </Text>
              </Button>
            )}
          </Box>
        </Box>
        <Text size="caption" color={stateColor(row)}>
          {stateText(row)}
        </Text>
        {row.description !== '' && (
          <Text size="caption" dimColor wrap="truncate-end">
            {row.description}
          </Text>
        )}
        {row.commands.length > 0 && (
          <Text size="caption" dimColor wrap="truncate-end">
            {text.commands(row.commands.map(name => `/${name}`).join(' '))}
          </Text>
        )}
      </Box>
    )

    const inline = list.filter(row => row.isInline)
    const others = list.filter(row => !row.isInline)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text size="footnote" dimColor>
            {text.summary(inline.filter(row => row.isLoaded).length, inline.length)}
          </Text>
          <Button key="refresh" plain dimColor onPress={() => void refresh($)}>
            <Text size="footnote">{text.refresh}</Text>
          </Button>
        </Box>
        {inline.map(view)}
        {others.length > 0 && (
          <Text key="others" size="footnote" weight="semibold">
            {text.others}
          </Text>
        )}
        {others.map(view)}
        {message !== '' && (
          <Text size="caption" color={AMBER}>
            {message}
          </Text>
        )}
        <Text size="caption" dimColor>
          {text.hint}
        </Text>
      </Box>
    )
  })
}
