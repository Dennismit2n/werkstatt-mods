import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Counted, Inventory, Todo, TodoStatus } from '../types'
import { setLanguage, t } from './text'

// „In diesem Chat“: Die Leiste schreibt mit, was die Sitzung benutzt, und
// zeigt es geordnet. Sie schaut nur zu, ruft kein Modell auf und hält nie
// einen Werkzeugaufruf auf.
const PANE = 'inventar'
// So viele Einträge behält jede Liste, so viele zeigt die Leiste je Abschnitt.
const KEEP = 60
const SHOWN = 8

const EMPTY: Inventory = { todos: [], connectors: [], skills: [], links: [], read: [], written: [] }

const items = atom({ plugin: 'inventar', key: 'items' } as const, EMPTY, { shape: 'items-1' })

const BLUE = '#2f86c9'
const GREEN = '#5aa846'
const GRAY = '#8e919a'

// Einstellung aus dem Manifest (userConfig), gesetzt in register.
let isAutoOpen = false
// Arbeitsordner der Sitzung, für kurze Dateipfade in der Anzeige.
let cwd = ''

// Den Eintrag nach vorn holen und seinen Zähler erhöhen.
export function bump(list: readonly Counted[], name: string): Counted[] {
  const found = list.find(one => one.name === name)
  return [{ name, count: (found?.count ?? 0) + 1 }, ...list.filter(one => one.name !== name)].slice(0, KEEP)
}

// Der Name eines Konnektors aus dem Werkzeugnamen „mcp__<server>__<werkzeug>“;
// null für die eigenen Werkzeuge der App (Aufgabenliste, Sitzungen, Ansicht).
// Trägt der Server nur eine Kennung, verrät oft der Anfang des Werkzeugnamens
// den Dienst (notion-fetch, slack_send_message).
export function connectorOf(tool: string): { kind: 'name' | 'browser' | 'chrome' | 'computer' | 'id'; name: string } | null {
  const match = tool.match(/^mcp__(.+?)__(.+)$/)
  if (!match) return null
  const server = match[1] ?? ''
  const name = match[2] ?? ''
  if (/^ccd_/.test(server)) return null
  if (/Claude_Browser$/.test(server)) return { kind: 'browser', name: '' }
  if (server === 'claude-in-chrome') return { kind: 'chrome', name: '' }
  if (server === 'computer-use') return { kind: 'computer', name: '' }
  const plugin = server.match(/^plugin[_:](.+?)[_:](.+)$/)
  if (plugin) return { kind: 'name', name: plugin[2] ?? server }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(server)) {
    const lead = name.match(/^([a-z][a-z0-9]{2,})[-_]/i)?.[1]
    const generic = /^(get|list|create|read|update|delete|search|save|find|fetch|import|export|run|send|set|add|remove)$/i
    if (lead && !generic.test(lead)) return { kind: 'name', name: lead[0]?.toUpperCase() + lead.slice(1) }
    return { kind: 'id', name: server.slice(0, 8) }
  }
  return { kind: 'name', name: server }
}

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed']
const asStatus = (value: unknown): TodoStatus => (STATUSES.includes(value as TodoStatus) ? (value as TodoStatus) : 'pending')

// Die Aufgabenliste nach einem Aufruf von TodoWrite oder update_plan. Eine
// neue Liste ersetzt die alte; advance, done und start schreiben sie fort.
export function nextTodos(todos: readonly Todo[], input: Record<string, unknown>): Todo[] {
  const fresh = Array.isArray(input.todos) ? input.todos : Array.isArray(input.items) ? input.items : null
  if (fresh) {
    return fresh.flatMap(one => {
      const row = typeof one === 'object' && one !== null ? (one as Record<string, unknown>) : {}
      const text = typeof row.content === 'string' ? row.content : typeof row.text === 'string' ? row.text : ''
      return text === '' ? [] : [{ text, status: asStatus(row.status) }]
    })
  }
  let list = todos.map(one => ({ ...one }))
  if (Array.isArray(input.done)) {
    for (const n of input.done) {
      const row = typeof n === 'number' ? list[n - 1] : undefined
      if (row) row.status = 'completed'
    }
  }
  if (input.advance === true) {
    const running = list.find(one => one.status === 'in_progress')
    if (running) running.status = 'completed'
    const waiting = list.find(one => one.status === 'pending')
    if (waiting) waiting.status = 'in_progress'
  }
  if (typeof input.start === 'number') {
    list = list.map(one => (one.status === 'in_progress' ? { ...one, status: 'completed' } : one))
    const row = list[input.start - 1]
    if (row) row.status = 'in_progress'
  }
  return list
}

// Was ein Werkzeugaufruf am Inventar ändert; null, wenn nichts.
export function note(now: Inventory, tool: string, input: Record<string, unknown>, labels: ReturnType<typeof t>): Inventory | null {
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (tool === 'Read' && path !== '') return { ...now, read: bump(now.read, path) }
  if ((tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') && path !== '') {
    return { ...now, written: bump(now.written, path) }
  }
  if (tool === 'Skill' && typeof input.skill === 'string') return { ...now, skills: bump(now.skills, input.skill) }
  if (tool === 'WebFetch' && typeof input.url === 'string') {
    const host = input.url.match(/^[a-z]+:\/\/([^/?#]+)/i)?.[1] ?? input.url
    return { ...now, links: bump(now.links, host.replace(/^www\./, '')) }
  }
  if (tool === 'TodoWrite' || tool === 'mcp__ccd_turn__update_plan') {
    return { ...now, todos: nextTodos(now.todos, input) }
  }
  const connector = connectorOf(tool)
  if (connector === null) return null
  const name =
    connector.kind === 'browser'
      ? labels.browser
      : connector.kind === 'chrome'
        ? labels.chrome
        : connector.kind === 'computer'
          ? labels.computer
          : connector.kind === 'id'
            ? labels.connector(connector.name)
            : connector.name
  return { ...now, connectors: bump(now.connectors, name) }
}

// Ein Pfad für die Anzeige: unter dem Arbeitsordner nur der Rest, sonst die
// letzten zwei Teile; der volle Pfad bleibt im Zustand.
export function shortPath(path: string, root: string) {
  const full = path.replace(/\\/g, '/')
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  if (base !== '' && full.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return full.slice(base.length + 1)
  const parts = full.split('/').filter(Boolean)
  return parts.length <= 2 ? full : `…/${parts.slice(-2).join('/')}`
}

// Die Leiste schaut nur zu: ein Fehler beim Mitschreiben darf nie ein Werkzeug aufhalten.
const quietly = (work: Promise<unknown>) => void work.catch(() => undefined)

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  isAutoOpen = options.autoOpen === true

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({
      name: 'inventar',
      description: t().commandDescription,
    })
    if (isAutoOpen) void $.ui.open({ id: PANE, title: t().title })

    return next(e)
  })

  // /inventar klappt die Leiste auf und zu.
  on('command.run', { command: 'inventar' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      return { text: t().closed }
    }
    await $.ui.open({ id: PANE, title: t().title })

    return { text: t().opened }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const labels = t()
    quietly(
      update($, items, now => note(now, tool, input, labels) ?? now),
    )

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()
    const all = await read($, items)

    const heading = (label: string, aside?: string) => (
      <Text size="footnote" weight="semibold">
        {label}
        {aside ? <Text dimColor> · {aside}</Text> : null}
      </Text>
    )
    const rows = (key: string, list: readonly Counted[], show: (name: string) => string) => {
      if (list.length === 0) return null
      return (
        <Box key={key} flexDirection="column">
          {heading(text[key as 'connectors' | 'skills' | 'links' | 'read' | 'written'], String(list.length))}
          {list.slice(0, SHOWN).map(one => (
            <Box key={`${key}-${one.name}`} flexDirection="row" justifyContent="space-between" gap={1}>
              <Box flexShrink={1} flexGrow={1}>
                <Text size="caption" wrap="truncate-start">
                  {show(one.name)}
                </Text>
              </Box>
              {one.count > 1 && (
                <Box flexShrink={0}>
                  <Text size="caption" dimColor tabular>
                    ×{one.count}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
          {list.length > SHOWN && (
            <Text size="caption" dimColor>
              {text.more(list.length - SHOWN)}
            </Text>
          )}
        </Box>
      )
    }

    const done = all.todos.filter(one => one.status === 'completed').length
    const todos =
      all.todos.length === 0 ? null : (
        <Box key="todos" flexDirection="column">
          {heading(text.todos, text.todoCount(done, all.todos.length))}
          {all.todos.map((one, i) => (
            <Text key={`todo-${i}`} size="caption" dimColor={one.status === 'completed'} wrap="truncate-end">
              <Text color={one.status === 'completed' ? GREEN : one.status === 'in_progress' ? BLUE : GRAY}>
                {one.status === 'completed' ? '✓' : one.status === 'in_progress' ? '●' : '○'}
              </Text>{' '}
              {one.text}
            </Text>
          ))}
        </Box>
      )

    const same = (name: string) => name
    const file = (name: string) => shortPath(name, cwd)
    const sections = [
      todos,
      rows('connectors', all.connectors, same),
      rows('skills', all.skills, same),
      rows('links', all.links, same),
      rows('written', all.written, file),
      rows('read', all.read, file),
    ].filter(one => one !== null)

    if (sections.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>{text.empty}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {sections}
        <Box flexDirection="row" justifyContent="flex-end">
          <Button key="clear" plain dimColor onPress={() => void update($, items, () => EMPTY)}>
            <Text size="footnote">{text.clear}</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
