import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { parseNotice, parseSessions, toolLabel } from '../hooks/register'

const BAND = {
  plugin: 'ampel',
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

const T0 = Date.parse('2026-11-15T12:00:00Z')

type World = { agents: AgentInfo[]; toasts: string[]; clock: ReturnType<typeof mock.clock> }

// Die Engine unter der Mod: Uhr, Agentenliste, Werkzeuge, Toast und was
// andere Mods im Band zeichnen.
function engine(on: Parameters<TestBody>[1]) {
  const w: World = { agents: [], toasts: [], clock: mock.clock(on, { now: T0 }) }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'ampel' } }))
  on('agent.list', () => ({ value: w.agents }))
  // Nebensitzungen gibt es im Test nicht: list_sessions bräuchte eine Freigabe.
  on('tool.check', (_, e) =>
    String(e.tool).includes('list_sessions') ? { decision: 'deny', reason: 'nicht im Test' } : { decision: 'allow' },
  )
  on('tool.call', (_, e) => {
    const name = String(e.tool)
    const args = e as unknown as Record<string, unknown>
    if (name === 'Bash' && args.run_in_background === true)
      return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }
    if (name === 'Bash') return { result: { stdout: 'ok', stderr: '', interrupted: args.command === 'kaputt' } }
    if (name === 'Monitor') return { result: { taskId: 'm1', timeoutMs: 300000 } }
    if (name === 'TaskStop')
      return { result: { message: 'stopped', task_id: String(args.task_id), task_type: 'local_bash' } }
    return { result: { text: 'ok' } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['unten'] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return w
}

type Engine = Parameters<TestBody>[0]
const start = ($: Engine) => $.turn.start({ text: 'los', turnId: 't1' })
const end = ($: Engine, reason: 'answer' | 'aborted' | 'error' = 'answer') =>
  $.turn.complete({
    turnId: 't1',
    answer: 'fertig',
    durationMs: 1000,
    isAborted: reason === 'aborted',
    reason,
  } as unknown as Parameters<Engine['turn']['complete']>[0])

const texts = async (ui: { find: (q: { type?: string; text?: RegExp }) => Promise<{ text: string } | undefined> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

const notice = (id: string, status: string, summary: string) =>
  `<task-notification>\n<task-id>${id}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`

test('Leerlauf: grün, „Alles steht“, und das Band der anderen bleibt darunter', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await texts(ui, /Alles steht/)).toBe('Alles steht, nichts läuft.')
    expect(await texts(ui, /^unten$/)).toBe('unten')
    await ui.unmount()
  }
})

test('laufender Zug: gelb mit Uhr und Werkzeug, danach wieder grün', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await start($)
  await w.clock.advance(65_000)
  await w.clock.settle()
  expect(await texts(ui, /Claude arbeitet/)).toBe('Claude arbeitet 1:05 · Antwort')
  await end($)
  expect(await texts(ui, /Alles steht/)).toBe('Alles steht, nichts läuft.')
  expect(await texts(ui, /✗/)).toBeUndefined()
  await ui.unmount()
})

test('Hintergrundbefehl: läuft nach dem Zug weiter; Fehlercode macht rot, „Gesehen“ quittiert', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'Build', run_in_background: true } as never)
  await end($)
  expect(await texts(ui, /Claude ist fertig/)).toBe('Claude ist fertig, im Hintergrund läuft noch')
  expect(await texts(ui, /Befehl: Build/)).toContain('▸ Befehl: Build')

  await $.prompt.submit({ text: notice('b1', 'failed', 'Background command "Build" failed with exit code 1'), wait: false } as never)
  expect(await texts(ui, /Alles steht/)).toBe('Alles steht, nichts läuft.')
  expect(await texts(ui, /fehlgeschlagen/)).toMatch(/Befehl „Build“ fehlgeschlagen \(Exit 1\)/)
  expect(w.toasts).toEqual([])

  expect((await $.command.run({ command: 'ampel', args: '' } as never) as { text: string }).text).toMatch(
    /^Ampel: rot \+ grün\nAlles steht, nichts läuft\.\n✗ .*Build/,
  )
  await ui.press({ key: 'ampel-seen' })
  expect(await texts(ui, /✗/)).toBeUndefined()
  await ui.unmount()
})

test('fertiger Hintergrundbefehl ohne Fehler: grün und einmal „alles fertig“', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'sleep 60', run_in_background: true } as never)
  await end($)
  await $.prompt.submit({ text: notice('b1', 'completed', 'Background command "sleep 60" completed (exit code 0)'), wait: false } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await texts(ui, /Alles steht/)).toBe('Alles steht, nichts läuft.')
  expect(await texts(ui, /✗/)).toBeUndefined()
  expect(w.toasts).toEqual(['Ampel grün: Alles ist fertig.'])
  await ui.unmount()
})

test('abgebrochener Zug wird rot und bleibt rot, auch wenn der nächste Zug läuft', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await start($)
  await end($, 'aborted')
  expect(await texts(ui, /Zug abgebrochen/)).toMatch(/Zug abgebrochen/)
  await start($)
  expect(await texts(ui, /Claude arbeitet/)).toMatch(/Claude arbeitet/)
  expect(await texts(ui, /Zug abgebrochen/)).toMatch(/Zug abgebrochen/)
  await ui.unmount()
})

test('TaskStop und unterbrochener Befehl werden rot, ein Monitor erscheint im Hintergrund', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await start($)
  await $.tool.call({ tool: 'Monitor', description: 'Build-Log', timeout_ms: 300000, command: 'tail -f x' } as never)
  expect(await texts(ui, /Monitor: Build-Log/)).toContain('Monitor: Build-Log')
  await $.tool.call({ tool: 'TaskStop', task_id: 'm1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'kaputt' } as never)
  await end($)
  // Die spätere Meldung „killed“ zum selben Lauf trägt nichts doppelt ein.
  await $.prompt.submit({ text: notice('m1', 'killed', 'Monitor stopped'), wait: false } as never)
  expect(await texts(ui, /Monitor „Build-Log“ gestoppt/)).toMatch(/gestoppt/)
  expect(await texts(ui, /unterbrochen/)).toMatch(/Befehl „kaputt“ unterbrochen/)
  expect(await texts(ui, /Monitor:/)).toBeUndefined()
  await ui.unmount()
})

test('Unteragent: erscheint mit Beschreibung, fehlgeschlagen wird rot', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await start($)
  w.agents = [{ id: 'a1', description: 'Repo durchsuchen', type: 'Explore', status: 'running' } as AgentInfo]
  await w.clock.advance(1_000)
  await w.clock.settle()
  expect(await texts(ui, /Agent: Repo durchsuchen/)).toContain('Agent: Repo durchsuchen')
  w.agents = [{ id: 'a1', description: 'Repo durchsuchen', type: 'Explore', status: 'failed' } as AgentInfo]
  await end($)
  expect(await texts(ui, /Agent „Repo durchsuchen“ fehlgeschlagen/)).toMatch(/fehlgeschlagen/)
  await ui.unmount()
})

test('Englisch', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await texts(ui, /All quiet/)).toBe('All quiet, nothing running.')
  await ui.unmount()
})

test('Hilfsfunktionen: Meldung, Sitzungen, Werkzeugtext', async () => {
  expect(parseNotice(notice('x', 'failed', 'Background command "a" failed with exit code 2'))).toEqual({
    id: 'x',
    status: 'failed',
    summary: 'Background command "a" failed with exit code 2',
    exitCode: 2,
  })
  expect(parseNotice('hallo')).toBeNull()
  expect(
    parseSessions(JSON.stringify([{ sessionId: 's1', title: 'Build', isRunning: true }, { sessionId: 's2', title: 'x', isRunning: false }])),
  ).toEqual([{ id: 's1', title: 'Build' }])
  expect(toolLabel({ tool: 'mcp__ccd_session__start_session' })).toBe('start_session')
  expect(toolLabel({ tool: 'Bash', command: 'npm test', description: '' })).toBe('Bash: npm test')
})
