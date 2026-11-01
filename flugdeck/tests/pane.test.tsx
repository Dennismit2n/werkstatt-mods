import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { parseSessions } from '../hooks/register'

const PANE = {
  plugin: 'flugdeck',
  component: 'Pane',
  requestId: 'flugdeck',
  props: {
    title: 'Agenten',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const T0 = Date.parse('2026-11-01T12:00:00Z')
const SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'

// So antwortet das App-Werkzeug list_sessions (echte Antwort vom 01.11.2026, gekürzt).
const SESSIONS = JSON.stringify([
  {
    sessionId: 'local_7acaf994',
    title: 'Restpunkte nach der 14-Sprachen-Runde',
    isRunning: true,
    lastActivityAt: '2026-11-01T17:06:06.758Z',
  },
  { sessionId: 'local_4184c866', title: 'Tile layout und Styling überarbeiten', isRunning: false, lastActivityAt: '2026-11-01T16:09:37.642Z' },
  { sessionId: 'local_ab568c42', title: 'Second Brain', isRunning: false, lastActivityAt: '2026-11-01T16:00:56.609Z' },
])

let nextId = 0

// Die Engine unter dem Mod: eine Uhr, die nur der Test weiterdreht, eine
// Agentenliste, die der Test vorgibt (leer, wenn er nichts sagt), und das
// App-Werkzeug list_sessions, wenn der Test ihm eine Antwort gibt.
function engine(on: Parameters<TestBody>[1], listed: () => AgentInfo[] = () => [], sessionsJson?: string) {
  nextId = 0
  let listCalls = 0
  const clock = mock.clock(on, { now: T0 })
  on('command.register', () => ({ value: { command: 'agenten' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => {
    listCalls += 1
    return { value: listed() }
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++nextId}` }))
  if (sessionsJson !== undefined) on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', (_, e) =>
    String(e.tool) === SESSIONS_TOOL && sessionsJson !== undefined
      ? { result: [{ type: 'text', text: sessionsJson }] }
      : { result: { text: 'ok' } },
  )
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { clock, listCalls: () => listCalls }
}

// Der Baukasten verlangt hier die volle Eingabe von agent.spawn; die Engine
// füllt den Rest selbst, der Mod liest nur diese drei Felder.
type SpawnArgs = Parameters<Parameters<TestBody>[0]['agent']['spawn']>[0]
const spawn = (description: string, subagentType: string) =>
  ({ prompt: 'p', description, subagentType }) as unknown as SpawnArgs
type RunArgs = Parameters<Parameters<TestBody>[0]['command']['run']>[0]
const agentenCommand = { command: 'agenten', args: '' } as unknown as RunArgs

test('leer: ein Hinweis statt Zeilen', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Noch keine Agenten/ }))?.text).toContain('Sobald einer startet')
    expect((await ui.find({ type: 'Text', text: /Andere Sitzungen/ }))?.text).toContain('keine Agenten dieser Sitzung')
    expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('0 laufen · 0 gesamt')
    // Ohne App-Werkzeug gibt es keinen Abschnitt Sitzungen.
    expect(await ui.find({ type: 'Text', text: /^Sitzungen/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('zwei Agenten: einer läuft, einer ist fertig; Zeile klappt auf, Fertige leeren', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.agent.spawn(spawn('Audit hooks/register', 'Explore'))
  await $.agent.spawn(spawn('Audit tests', 'general-purpose'))
  await clock.settle()
  await $.tool.call({ tool: 'Read', file_path: 'C:/x.ts', agentId: 'a1' })
  await $.tool.call({ tool: 'Grep', pattern: 'on\\(', agentId: 'a1' })
  await $.turn.complete({
    turnId: 't2',
    agentId: 'a2',
    answer: 'fertig',
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 300,
    },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('1 läuft · 2 gesamt')
    expect((await ui.find({ type: 'Text', text: /Audit hooks\/register/ }))?.text).toContain('1: Audit hooks/register')
    expect((await ui.find({ type: 'Text', text: /Audit tests/ }))?.text).toContain('✓')
    expect((await ui.find({ type: 'Text', text: /^→/ }))?.text).toBe('→ Grep')

    await ui.press({ key: 'row-a1' })
    expect((await ui.find({ type: 'Text', text: /Werkzeuge/ }))?.text).toBe('2 Werkzeuge · 0 Anfragen')
    expect((await ui.find({ type: 'Text', text: /^Explore/ }))?.text).toBe('Explore · claude-opus-5-5 · läuft')

    await ui.press({ key: 'row-a2' })
    expect((await ui.find({ type: 'Text', text: /Token/ }))?.text).toBe('0 Werkzeuge · 0 Anfragen · 1.500 Token')
    await ui.press({ key: 'row-a2' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'clear' })
  expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('1 läuft · 1 gesamt')
  expect(await ui.find({ type: 'Text', text: /Audit tests/ })).toBeUndefined()
  await ui.unmount()
})

test('ein Agent, den die Engine nicht mehr nennt, gilt nach zehn Sekunden als beendet; die Uhr steht dann', async ($, on) => {
  const { clock, listCalls } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.agent.spawn(spawn('Lange Suche', 'Explore'))
  await clock.settle()

  // Nach einer Sekunde fehlt er in der Liste, läuft aber noch: Schonfrist.
  await clock.advance(1000)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('1 läuft · 1 gesamt')
  expect((await ui.find({ type: 'Text', text: /Lange Suche/ }))?.text).toContain('●')
  await ui.unmount()

  // Zehn Sekunden ohne Eintrag in der Liste: beendet, Ausgang unbekannt.
  await clock.advance(10_000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('0 laufen · 1 gesamt')
  expect((await ui.find({ type: 'Text', text: /Lange Suche/ }))?.text).toContain('○')
  expect((await ui.find({ type: 'Text', text: /^0:1\d$/ }))?.text).toBe('0:10')
  await ui.press({ key: 'row-a1' })
  expect((await ui.find({ type: 'Text', text: /^Explore/ }))?.text).toBe('Explore · claude-opus-5-5 · beendet')
  await ui.unmount()

  // Ohne laufenden Agenten fragt die Leiste die Engine nicht mehr jede Sekunde.
  const before = listCalls()
  await clock.advance(5000)
  expect(listCalls()).toBe(before)
})

test('ein Agent, den die Liste als fertig oder abgeschossen führt, bekommt diesen Zustand', async ($, on) => {
  const listed: AgentInfo[] = []
  const { clock } = engine(on, () => listed)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.agent.spawn(spawn('Erst fertig', 'Explore'))
  await $.agent.spawn(spawn('Dann weg', 'general-purpose'))
  await clock.settle()
  listed.push(
    { id: 'a1', type: 'Explore', status: 'completed', description: 'Erst fertig' },
    { id: 'a2', type: 'general-purpose', status: 'killed', description: 'Dann weg' },
  )
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /gesamt/ }))?.text).toBe('0 laufen · 2 gesamt')
  expect((await ui.find({ type: 'Text', text: /Erst fertig/ }))?.text).toContain('✓')
  expect((await ui.find({ type: 'Text', text: /Dann weg/ }))?.text).toContain('■')
  await ui.unmount()
})

test('die anderen Sitzungen der App stehen unter den Agenten, die arbeitenden zuerst', async ($, on) => {
  const { clock } = engine(on, () => [], SESSIONS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // /agenten öffnet die Leiste und liest die Sitzungen.
  await $.command.run(agentenCommand)
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Sitzungen/ }))?.text).toBe('Sitzungen · 1 arbeitet · 3 offen')
    expect((await ui.find({ type: 'Text', text: /Restpunkte/ }))?.text).toContain('●')
    expect((await ui.find({ type: 'Text', text: /Second Brain/ }))?.text).toContain('○')
    await ui.unmount()
  }

  expect(parseSessions('[]')).toEqual([])
  expect(parseSessions('{"nope":1}')).toBe(null)
  expect(parseSessions(SESSIONS)?.map(row => row.isRunning)).toEqual([true, false, false])
})

test('auf Englisch: Überschrift, Hinweis und Zustände', { options: { language: 'en', showSessions: false } }, async ($, on) => {
  const { clock } = engine(on, () => [], SESSIONS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /total/ }))?.text).toBe('0 running · 0 total')
  expect((await ui.find({ type: 'Text', text: /No agents/ }))?.text).toContain('shows up here')
  await ui.unmount()

  await $.agent.spawn(spawn('Read the hooks', 'Explore'))
  await clock.settle()
  await $.command.run(agentenCommand)
  await clock.settle()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /total/ }))?.text).toBe('1 running · 1 total')
  await ui.press({ key: 'row-a1' })
  expect((await ui.find({ type: 'Text', text: /^Explore/ }))?.text).toBe('Explore · claude-opus-5-5 · running')
  expect((await ui.find({ type: 'Text', text: /tools/ }))?.text).toBe('0 tools · 0 requests')
  // showSessions aus: kein Abschnitt, obwohl das Werkzeug antworten würde.
  expect(await ui.find({ type: 'Text', text: /^Sessions/ })).toBeUndefined()
  await ui.unmount()
})
