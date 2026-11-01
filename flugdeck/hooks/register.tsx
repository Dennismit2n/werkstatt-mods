import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, AgentStatus, EngineInterface, Register, Timer } from 'claude-code'

import type { Run, RunStatus, SessionRow } from '../types'
import { setLanguage, t } from './text'

const PANE = 'flugdeck'
// Solange ein Agent läuft, tickt die Uhr jede Sekunde; danach steht sie still.
const TICK_MS = 1000
const KEEP = 30
// Ein frisch gestarteter Agent steht einen Augenblick später in der Liste der
// Engine; fehlt ein laufender dort länger, hat die Engine ihn nach seinem Ende
// ausgetragen (sonst hinge der Eintrag für immer auf „läuft“, 31.10.2026).
const GRACE_MS = 10_000
const LIVE = new Set<AgentStatus>(['pending', 'running', 'waiting'])
// Die anderen Sitzungen der App (keine Subagenten) kommen vom App-Werkzeug
// list_sessions, nur lesend: bei jedem Öffnen und alle 15 s, solange die Leiste
// offen ist. Ohne das Werkzeug (Terminal) fehlt der Abschnitt einfach.
const SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'
const SESSIONS_MS = 15_000
const SESSIONS_ROWS = 5

const runs = atom({ plugin: 'flugdeck', key: 'runs' } as const, [], { shape: 'runs-1' })
const expanded = atom({ plugin: 'flugdeck', key: 'expanded' } as const, null)
const now = atom({ plugin: 'flugdeck', key: 'now' } as const, 0)
const autoOpened = atom({ plugin: 'flugdeck', key: 'autoOpened' } as const, false)
const sessions = atom({ plugin: 'flugdeck', key: 'sessions' } as const, null, { shape: 'sessions-1' })

// Farben wie in der Statistik-Leiste: Blau läuft, Grün fertig, Rot gescheitert.
const EMPTY = '#34363d'
const BLUE = '#2f86c9'
const GREEN = '#5aa846'
const RED = '#c0504d'
const AMBER = '#c98a3a'
const GRAY = '#8e919a'

const MARK: Record<RunStatus, string> = { running: '●', done: '✓', failed: '✗', aborted: '■', ended: '○' }
const COLOR: Record<RunStatus, string> = { running: BLUE, done: GREEN, failed: RED, aborted: AMBER, ended: GRAY }

// Einstellungen aus dem Manifest (userConfig), gesetzt in register.
let isAutoOpen = true
let isSessionsOn = true

function clockText(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
const elapsed = (run: Run, at: number) => (run.endedAt ?? at) - run.startedAt

// Was die Engine über ein Ende sagt, in die eigenen Zustände übersetzt.
function fromAgentStatus(status: AgentStatus): RunStatus | null {
  if (status === 'completed' || status === 'idle') return 'done'
  if (status === 'failed') return 'failed'
  if (status === 'killed') return 'aborted'
  return null
}

let ticker: Timer | null = null
let sessionsTicker: Timer | null = null

// Die Leiste schaut nur zu: ein Fehler beim Mitschreiben darf nie einen
// Agenten, ein Werkzeug oder eine Anfrage aufhalten.
const quietly = (work: Promise<unknown>) => void work.catch(() => undefined)

async function patch($: EngineInterface, id: string, fn: (run: Run) => Run) {
  await update($, runs, list => list.map(run => (run.id === id ? fn(run) : run)))
}

async function addRun($: EngineInterface, fields: Omit<Run, 'nr'>) {
  await update($, runs, list => {
    if (list.some(run => run.id === fields.id)) return list
    const nr = list.reduce((max, run) => Math.max(max, run.nr), 0) + 1
    return [...list, { ...fields, nr }].slice(-KEEP)
  })
}

// Gleicht mit der Liste der Engine ab: fängt Enden, die kein turn.complete
// brachten (abgeschossen), Agenten, die vor dem Laden der Mod starteten, und
// Agenten, die die Engine schon ausgetragen hat.
async function reconcile($: EngineInterface) {
  const at = await $.clock.now()
  const agents = await $.agent.list()
  const known = new Set((await read($, runs)).map(run => run.id))
  for (const agent of agents) {
    if (!known.has(agent.id) && LIVE.has(agent.status)) {
      await addRun($, {
        id: agent.id,
        description: agent.description,
        type: agent.type,
        model: null,
        parentId: agent.parentId ?? null,
        startedAt: at,
        endedAt: null,
        status: 'running',
        tools: 0,
        lastTool: null,
        steps: 0,
        tokens: 0,
      })
    }
  }
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  await update($, runs, list =>
    list.map(run => {
      if (run.status !== 'running') return run
      const agent = byId.get(run.id)
      if (agent) {
        const ended = fromAgentStatus(agent.status)
        return ended ? { ...run, status: ended, endedAt: run.endedAt ?? at } : run
      }
      // Nicht mehr in der Liste: zu Ende, aber die Engine sagt nicht mehr, wie.
      return at - run.startedAt >= GRACE_MS ? { ...run, status: 'ended', endedAt: at } : run
    }),
  )
}

async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
  try {
    await reconcile($)
  } catch {
    // Beim nächsten Tick wieder versuchen.
  }
  const isAnyRunning = (await read($, runs)).some(run => run.status === 'running')
  if (!isAnyRunning && ticker) {
    ticker.cancel()
    ticker = null
  }
}

function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => void tick($))
}

// Ein MCP-Werkzeug antwortet mit Text oder mit Textblöcken; beides zu einem Text.
type Raw = Record<string, unknown>
const asRecord = (value: unknown): Raw | null =>
  typeof value === 'object' && value !== null ? (value as Raw) : null
function resultText(ran: { text?: unknown; result?: unknown }): unknown {
  if (typeof ran.text === 'string' && ran.text.trim() !== '') return ran.text
  const result = ran.result
  if (Array.isArray(result)) {
    return result
      .map(block => (typeof asRecord(block)?.text === 'string' ? (asRecord(block)?.text as string) : ''))
      .join('')
  }
  const content = asRecord(result)?.content
  if (Array.isArray(content)) return resultText({ result: content })
  return result
}

export function parseSessions(raw: unknown): SessionRow[] | null {
  const list = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(list)) return null
  return list.flatMap(entry => {
    const row = asRecord(entry)
    if (!row || typeof row.sessionId !== 'string') return []
    const at = typeof row.lastActivityAt === 'string' ? Date.parse(row.lastActivityAt) : NaN
    return [
      {
        id: row.sessionId,
        title: typeof row.title === 'string' && row.title.trim() !== '' ? row.title : row.sessionId,
        isRunning: row.isRunning === true,
        lastActivityAt: Number.isNaN(at) ? 0 : at,
      },
    ]
  })
}

// Erst still fragen (kein Dialog): würde der Aufruf eine Freigabe verlangen,
// käme die alle 15 s. Dann lieber ohne den Abschnitt.
async function readSessions($: EngineInterface): Promise<SessionRow[] | null> {
  try {
    const verdict = await $.tool.check({ tool: SESSIONS_TOOL, input: {} })
    if (verdict.decision !== 'allow') return null
    const ran = await $.tool.call({ tool: SESSIONS_TOOL })
    if (ran.deny !== undefined || ran.isError) return null
    return parseSessions(resultText(ran as { text?: unknown; result?: unknown }))
  } catch {
    return null
  }
}

async function refreshSessions($: EngineInterface) {
  if (!isSessionsOn) return
  const fresh = await readSessions($)
  // Ein Fehlschlag löscht die letzte gute Liste nicht.
  await update($, sessions, old => fresh ?? old)
}

async function pollSessions($: EngineInterface) {
  const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isOpen) await refreshSessions($)
}

function startSessionsTicker($: EngineInterface) {
  if (sessionsTicker || !isSessionsOn) return
  sessionsTicker = $.clock.every(SESSIONS_MS, () => void pollSessions($).catch(() => undefined))
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: t().title })
  quietly(refreshSessions($))
}

// Balken wie bei FlightDeck: Länge = Laufzeit im Verhältnis zum längsten Agenten.
function barSvg(share: number, color: string) {
  const width = 460
  const clamped = Math.max(0, Math.min(1, share))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 6" width="${width}" height="6">` +
    `<rect x="0" y="0" width="${width}" height="6" rx="3" fill="${EMPTY}"/>` +
    `<rect x="0" y="0" width="${Math.max(4, clamped * width)}" height="6" rx="3" fill="${color}"/></svg>`
  )
}
const textBar = (share: number) => {
  const full = Math.round(Math.max(0, Math.min(1, share)) * 20)
  return '█'.repeat(full) + '░'.repeat(20 - full)
}

async function noteSpawn($: EngineInterface, e: AgentSpawnInput, agentId: string, model: string | null) {
  const at = await $.clock.now()
  await addRun($, {
    id: agentId,
    description: e.description || e.subagentType,
    type: e.subagentType,
    model,
    parentId: e.parentAgentId ?? null,
    startedAt: at,
    endedAt: null,
    status: 'running',
    tools: 0,
    lastTool: null,
    steps: 0,
    tokens: 0,
  })
  await update($, now, () => at)
  startTicker($)
  // Einmal je Sitzung von selbst aufgehen; wer die Leiste zumacht, behält sie zu.
  if (isAutoOpen && !(await read($, autoOpened))) {
    await update($, autoOpened, () => true)
    void openPane($)
  }
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  isAutoOpen = options.autoOpen !== false
  isSessionsOn = options.showSessions !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agenten',
      description: t().commandDescription,
    })
    if ((await read($, runs)).some(run => run.status === 'running')) startTicker($)
    startSessionsTicker($)

    return next(e)
  })

  // Die Leiste schaut nur zu: scheitert ihr Mitschreiben, läuft der Start
  // (und unten der Werkzeugaufruf) trotzdem durch; next ist dabei wiederholsicher.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId === undefined) return result
    quietly(noteSpawn($, e, result.agentId, result.model ?? null))

    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const tool = e.tool
      quietly(patch($, id, run => ({ ...run, tools: run.tools + 1, lastTool: tool })))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const model = e.model
      quietly(patch($, id, run => ({ ...run, steps: run.steps + 1, model: run.model ?? model })))
    }

    return yield* next(e)
  })

  // Eine weitergeführte Agentenrunde (SendMessage) läuft wieder.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const runsNow = await read($, runs)
      if (runsNow.some(run => run.id === id && run.status !== 'running')) {
        await patch($, id, run => ({ ...run, status: 'running', endedAt: null }))
        startTicker($)
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const status: RunStatus = e.isAborted ? 'aborted' : e.reason === 'answer' ? 'done' : 'failed'
      const u = e.usage
      const tokens = u ? u.input_tokens + u.output_tokens + u.cache_creation_input_tokens : 0
      const at = await $.clock.now()
      await patch($, id, run => ({ ...run, status, endedAt: at, tokens: run.tokens + tokens }))
      await update($, now, () => at)
    }

    return next(e)
  })

  // Der Knopf „Agenten“ im Band des Mods werkstatt-band klappt die Leiste auf und zu.
  on('ui.press', { plugin: 'werkstatt-band', element: 'agenten' }, async ($, e) => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
    } else {
      await openPane($)
    }

    return { element: e.element }
  })

  on('command.run', { command: 'agenten' }, async $ => {
    const at = await $.clock.now()
    await update($, now, () => at)
    await openPane($)

    return { text: t().opened }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Das Terminal kennt kein Svg; dort zeichnet ein Textbalken.
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const text = t()
    const list = await read($, runs)
    const open = await read($, expanded)
    const at = Math.max(await read($, now), ...list.map(run => run.endedAt ?? 0))
    const others = await read($, sessions)

    const running = list.filter(run => run.status === 'running').length
    const longest = Math.max(1, ...list.map(run => elapsed(run, at)))

    const header = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text size="footnote" dimColor>
          {text.header(running, list.length)}
        </Text>
        {list.length > running && (
          <Button
            key="clear"
            plain
            dimColor
            onPress={() => void update($, runs, all => all.filter(run => run.status === 'running'))}
          >
            <Text size="footnote">{text.clearDone}</Text>
          </Button>
        )}
      </Box>
    )

    // Die anderen Sitzungen der App: die arbeitenden zuerst, höchstens fünf Zeilen.
    const sessionsSection = (() => {
      if (others === null) return null
      const working = others.filter(row => row.isRunning)
      const shown = [...working, ...others.filter(row => !row.isRunning)].slice(0, SESSIONS_ROWS)
      return (
        <Box key="sessions" flexDirection="column">
          <Text size="footnote" weight="semibold">
            {text.sessions} <Text dimColor>· {text.sessionsHeader(working.length, others.length)}</Text>
          </Text>
          {shown.map(row => (
            <Text key={`s-${row.id}`} size="caption" dimColor={!row.isRunning} wrap="truncate-end">
              <Text color={row.isRunning ? BLUE : GRAY}>{row.isRunning ? '●' : '○'}</Text> {row.title}
            </Text>
          ))}
        </Box>
      )
    })()

    if (list.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          <Text dimColor>{text.empty}</Text>
          <Text size="caption" dimColor>
            {text.emptyHint}
          </Text>
          {sessionsSection}
        </Box>
      )
    }

    const row = (run: Run) => {
      const time = elapsed(run, at)
      const isOpen = open === run.id
      const share = time / longest
      return (
        <Box key={run.id} flexDirection="column">
          {/* Die Uhr behält ihren Platz, gekürzt wird die Beschreibung (Dennis' Foto, 31.10.). */}
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Box flexShrink={1} flexGrow={1}>
              <Button
                key={`row-${run.id}`}
                plain
                onPress={() => void update($, expanded, current => (current === run.id ? null : run.id))}
              >
                <Text size="footnote" wrap="truncate-end">
                  <Text color={COLOR[run.status]}>{MARK[run.status]}</Text> {run.nr}: {run.description}
                </Text>
              </Button>
            </Box>
            <Box flexShrink={0}>
              <Text size="footnote" dimColor tabular>
                {clockText(time)}
              </Text>
            </Box>
          </Box>
          {Svg ? (
            <Svg
              source={barSvg(share, COLOR[run.status])}
              alt={`${run.description}: ${text.word[run.status]}, ${clockText(time)}`}
            />
          ) : (
            <Text size="footnote" color={COLOR[run.status]}>
              {textBar(share)}
            </Text>
          )}
          {!isOpen && run.status === 'running' && run.lastTool !== null && (
            <Text size="caption" dimColor wrap="truncate-end">
              → {run.lastTool}
            </Text>
          )}
          {isOpen && (
            <Box flexDirection="column" marginLeft={2}>
              <Text size="caption" dimColor>
                {run.type}
                {run.model ? ` · ${run.model}` : ''} · {text.word[run.status]}
              </Text>
              <Text size="caption" dimColor>
                {text.tools(run.tools)} · {text.requests(run.steps)}
                {run.tokens > 0 ? ` · ${text.tokens(run.tokens)}` : ''}
              </Text>
              {run.lastTool !== null && (
                <Text size="caption" dimColor wrap="truncate-end">
                  {text.last}
                  {run.lastTool}
                </Text>
              )}
              <Button key={`view-${run.id}`} plain onPress={() => void $.ui.view({ agentId: run.id })}>
                <Text size="caption" color={BLUE}>
                  {text.viewTranscript}
                </Text>
              </Button>
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {list.map(row)}
        {sessionsSection}
        {e.props.view.agentId !== undefined && (
          <Button key="back" plain onPress={() => void $.ui.view({})}>
            <Text size="caption" color={BLUE}>
              {text.backToMain}
            </Text>
          </Button>
        )}
      </Box>
    )
  })
}
