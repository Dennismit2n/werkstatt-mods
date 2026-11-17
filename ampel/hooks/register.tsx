import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { Incident, Job, JobKind } from '../types'
import { clock, setLanguage, t, timeOfDay } from './text'

// Die Ampel beantwortet eine Frage: Läuft in dieser Sitzung gerade etwas?
// Grün: nichts läuft. Gelb: Claude arbeitet, oder etwas läuft im Hintergrund
// (Befehl, Monitor, Agent, Nebensitzung). Rot: Etwas wurde abgebrochen,
// gestoppt oder ist fehlgeschlagen; das bleibt stehen, bis du es quittierst.
// Rot und Gelb leuchten zusammen, wie an einer echten Ampel.

const isWorking = atom({ plugin: 'ampel', key: 'isWorking' } as const, false)
const workingSince = atom({ plugin: 'ampel', key: 'workingSince' } as const, 0)
const tool = atom({ plugin: 'ampel', key: 'tool' } as const, null)
const jobs = atom({ plugin: 'ampel', key: 'jobs' } as const, [])
const incidents = atom({ plugin: 'ampel', key: 'incidents' } as const, [])
const crons = atom({ plugin: 'ampel', key: 'crons' } as const, 0)
const now = atom({ plugin: 'ampel', key: 'now' } as const, 0)

const RED = '#d0503c'
const AMBER = '#d9a03a'
const GREEN = '#5aa846'
const OFF = '#2c2c2c'
const SIZE = 'footnote'
const TICK_MS = 1000
const SESSIONS_MS = 20_000
const SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'
const MAX_JOBS = 4
const MAX_INCIDENTS = 5
const NAME_MAX = 48

let showSessions = true
let toastWhenDone = true
let ticker: { cancel(): void } | null = null
let sessionsTicker: { cancel(): void } | null = null
let incidentSeq = 0
// Laufende Werkzeugaufrufe der Hauptsitzung, damit das Band das jüngste nennt.
const inflight = new Map<string, string>()
// Ein von TaskStop gestoppter Lauf: Die spätere Meldung „killed“ trägt ihn nicht doppelt ein.
const stoppedHere = new Set<string>()
// Lief in diesem Zug der Hauptsitzung ein prüfendes Werkzeug ohne Fehler?
let checkedThisTurn = false

// Werkzeuge, die nur schreiben, planen oder reden: Sie belegen kein „Geprüft“.
const NO_PROOF = new Set([
  'Write',
  'Edit',
  'NotebookEdit',
  'TodoWrite',
  'AskUserQuestion',
  'ToolSearch',
  'Skill',
  'SendUserFile',
  'SendMessage',
  'ScheduleWakeup',
  'EnterPlanMode',
  'ExitPlanMode',
])
const NO_PROOF_PREFIX = ['mcp__ccd_turn__', 'mcp__ccd_session__', 'mcp__ccd_sidebar__', 'mcp__ccd_view__', 'mcp__ccd_window__']

export function isProofTool(name: string): boolean {
  return !NO_PROOF.has(name) && !NO_PROOF_PREFIX.some(prefix => name.startsWith(prefix))
}

// Meldet die Antwort in ihren letzten Zeilen „Geprüft:“ (auch fett oder als
// Listenpunkt)? „Ungeprüft:“ und ein „geprüft:“ mitten im Satz zählen nicht.
export function claimsChecked(answer: string): boolean {
  const tail = answer
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .slice(-3)
  return tail.some(line => /^[>*_\-\s]*(?:geprüft|verified)[*_\s]*:/i.test(line))
}

export function shorten(text: string, max = NAME_MAX): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

// Der Werkzeugname ohne MCP-Vorsatz: mcp__ccd_session__start_session → start_session.
export function toolName(name: string): string {
  const parts = name.split('__')
  return parts[parts.length - 1] || name
}

// Ein kurzer Text für das, was ein Werkzeugaufruf tut.
export function toolLabel(e: { tool: string } & Record<string, unknown>): string {
  const name = toolName(String(e.tool))
  const description = typeof e.description === 'string' ? e.description : ''
  const command = typeof e.command === 'string' ? e.command : ''
  if (name === 'AskUserQuestion') return t().asking
  if (description !== '') return `${name}: ${shorten(description, 40)}`
  if (command !== '') return `${name}: ${shorten(command, 40)}`
  return name
}

// Die Felder einer Hintergrund-Meldung (<task-notification>), wie die Engine
// sie als Eingabe in die Sitzung legt.
export type Notice = { id: string; status: string; summary: string; exitCode: number | null }

export function parseNotice(text: string): Notice | null {
  if (!text.includes('<task-notification>')) return null
  const field = (tag: string) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? ''
  const id = field('task-id')
  if (id === '') return null
  const summary = field('summary')
  const code = summary.match(/exit code (-?\d+)/i)
  return { id, status: field('status').toLowerCase(), summary, exitCode: code ? Number(code[1]) : null }
}

async function addIncident($: EngineInterface, text: string) {
  const at = await $.clock.now()
  const entry: Incident = { id: `i${++incidentSeq}-${at}`, text, at }
  await update($, incidents, list => [...list, entry].slice(-20))
}

const at = async ($: EngineInterface) => timeOfDay(await $.clock.now())

const kindText = (kind: JobKind) => t().kind[kind]

async function addJob($: EngineInterface, job: Job) {
  await update($, jobs, list => (list.some(j => j.id === job.id) ? list : [...list, job]))
  startTicker($)
}

// Ein Lauf ist zu Ende: aus der Liste nehmen; rot, wenn er fehlschlug oder gestoppt wurde.
async function endJob($: EngineInterface, id: string, status: string, exitCode: number | null, fallbackName?: string) {
  const list = await read($, jobs)
  const job = list.find(j => j.id === id)
  if (job) await update($, jobs, l => l.filter(j => j.id !== id))
  const name = job?.name ?? fallbackName ?? id
  const kind = job?.kind ?? 'shell'
  const text = t()
  const time = await at($)
  if (status === 'failed' || (exitCode !== null && exitCode !== 0)) {
    await addIncident(
      $,
      kind === 'shell' ? text.shellFailed(time, name, exitCode !== null ? text.exitCode(exitCode) : '') : text.failed(time, kindText(kind), name),
    )
  } else if (status === 'killed' || status === 'stopped') {
    if (!stoppedHere.delete(id)) await addIncident($, text.stopped(time, kindText(kind), name))
  }
  await maybeDone($)
}

// Wenn nach einem Lauf alles steht: einmal kurz melden.
let hadWork = false
async function maybeDone($: EngineInterface) {
  const busy = (await read($, isWorking)) || (await read($, jobs)).length > 0
  if (busy) {
    hadWork = true
    return
  }
  if (hadWork && toastWhenDone && (await read($, incidents)).length === 0) $.ui.toast(t().allDone)
  hadWork = false
  stopTicker()
}

function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))
}

function stopTicker() {
  ticker?.cancel()
  ticker = null
}

// Jede Sekunde, solange etwas läuft: Uhr weiterdrehen und die Agenten abgleichen.
async function tick($: EngineInterface) {
  await syncAgents($)
  const working = await read($, isWorking)
  const running = (await read($, jobs)).length
  if (!working && running === 0) {
    stopTicker()
    return
  }
  const time = await $.clock.now()
  await update($, now, () => time)
}

const ACTIVE = new Set(['pending', 'running', 'waiting'])

async function syncAgents($: EngineInterface) {
  let agents: AgentInfo[]
  try {
    agents = await $.agent.list()
  } catch {
    return
  }
  const list = await read($, jobs)
  const known = new Set(list.filter(j => j.kind === 'agent').map(j => j.id))
  for (const agent of agents) {
    const isActive = ACTIVE.has(agent.status)
    if (isActive && !known.has(agent.id)) {
      await addJob($, {
        id: agent.id,
        kind: 'agent',
        name: shorten(agent.description || agent.type),
        startedAt: await $.clock.now(),
      })
    } else if (!isActive && known.has(agent.id)) {
      await endJob($, agent.id, agent.status, null)
    }
  }
  // Ein Agent, den die Engine gar nicht mehr führt, ist zu Ende.
  const listed = new Set(agents.map(a => a.id))
  for (const id of known) if (!listed.has(id)) await endJob($, id, 'completed', null)
}

// Antwort von list_sessions, nur die laufenden mit Titel.
export function parseSessions(raw: unknown): { id: string; title: string }[] | null {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(list)) return null
  return list.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    if (typeof row.sessionId !== 'string' || row.isRunning !== true) return []
    const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title : row.sessionId
    return [{ id: row.sessionId, title }]
  })
}

function resultText(ran: { result?: unknown }): unknown {
  const result = ran.result
  if (Array.isArray(result)) {
    const first = result.find(part => typeof part === 'object' && part !== null && 'text' in part) as { text?: unknown } | undefined
    return first?.text
  }
  if (typeof result === 'object' && result !== null && 'text' in result) return (result as { text?: unknown }).text
  return result
}

// Erst still fragen (kein Dialog): würde der Aufruf eine Freigabe verlangen,
// käme die alle 20 s. Dann lieber ohne Nebensitzungen.
async function pollSessions($: EngineInterface) {
  if (!showSessions) return
  let running: { id: string; title: string }[] | null = null
  try {
    const verdict = await $.tool.check({ tool: SESSIONS_TOOL, input: { linked: true } })
    if (verdict.decision !== 'allow') return
    const ran = await $.tool.call({ tool: SESSIONS_TOOL, linked: true } as never)
    if (ran.deny !== undefined || ran.isError) return
    running = parseSessions(resultText(ran as { result?: unknown }))
  } catch {
    return
  }
  if (running === null) return
  const fresh = running
  const list = await read($, jobs)
  const ids = new Set(fresh.map(s => s.id))
  for (const job of list) if (job.kind === 'session' && !ids.has(job.id)) await endJob($, job.id, 'completed', null)
  for (const s of fresh) {
    if (!list.some(j => j.id === s.id)) {
      await addJob($, { id: s.id, kind: 'session', name: shorten(s.title), startedAt: await $.clock.now() })
    }
  }
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  showSessions = options.showSessions !== false
  toastWhenDone = options.toastWhenDone !== false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'ampel', description: t().commandDescription, immediate: true })
    // Nach einem Nachladen: Was die Hauptsitzung angeblich tat, ist vorbei.
    await update($, isWorking, () => false)
    await update($, tool, () => null)
    inflight.clear()
    if (showSessions && !sessionsTicker) {
      sessionsTicker = $.clock.every(SESSIONS_MS, () => void pollSessions($).catch(() => undefined))
      void pollSessions($).catch(() => undefined)
    }
    if ((await read($, jobs)).length > 0) startTicker($)
    return result
  })

  // /ampel: derselbe Stand als Text, für das Terminal, das Handy oder zum Kopieren.
  on('command.run', { command: 'ampel' }, async $ => ({ text: await report($) }))

  // Ein Zug der Hauptsitzung beginnt: gelb.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const time = await $.clock.now()
      await update($, isWorking, () => true)
      await update($, workingSince, () => time)
      await update($, now, () => time)
      await update($, tool, () => null)
      checkedThisTurn = false
      hadWork = true
      startTicker($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Ein Zug der Hauptsitzung endet: gelb aus; abgebrochen oder Fehler wird rot.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isWorking, () => false)
      await update($, workingSince, () => 0)
      await update($, tool, () => null)
      inflight.clear()
      const text = t()
      if (e.reason === 'aborted') await addIncident($, text.turnAborted(await at($)))
      else if (e.reason === 'error') await addIncident($, text.turnError(await at($)))
      else if (e.reason === 'refusal') await addIncident($, text.turnRefused(await at($)))
      // Grün nur mit Nachweis: „Geprüft:“ ohne einen einzigen Prüflauf im Zug wird rot.
      if (e.reason === 'answer' && !checkedThisTurn && claimsChecked(e.answer)) await addIncident($, text.uncheckedClaim(await at($)))
      checkedThisTurn = false
      await syncAgents($)
      await maybeDone($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Werkzeuge: das laufende nennen, Hintergrundläufe eintragen, Stopps merken.
  on('tool.call', async ($, e, next) => {
    // Der eigene stille Abruf der Nebensitzungen gehört nicht ins Band.
    if (String(e.tool) === SESSIONS_TOOL) return next(e)
    // Nur Aufrufe aus einem laufenden Zug der Hauptsitzung nennen; die stillen
    // Abrufe anderer Mods im Leerlauf (etwa get_usage) blitzen sonst auf.
    const isMain = e.agentId === undefined && (await read($, isWorking))
    const key = e.tool_use_id ?? `${String(e.tool)}-${Math.random()}`
    const label = toolLabel(e as unknown as { tool: string } & Record<string, unknown>)
    if (isMain) {
      inflight.set(key, label)
      await update($, tool, () => label)
    }
    let result
    try {
      result = await next(e)
    } finally {
      if (isMain) {
        inflight.delete(key)
        const last = [...inflight.values()].pop() ?? null
        await update($, tool, () => last).catch(() => undefined)
      }
    }
    try {
      // Nur ein Aufruf des Modells selbst zählt als Prüflauf, keine stillen Abrufe anderer Mods.
      if (
        e.agentId === undefined &&
        next.origin?.plugin === 'engine' &&
        result.deny === undefined &&
        !result.isError &&
        isProofTool(String(e.tool))
      )
        checkedThisTurn = true
      if (result.deny === undefined && !result.isError) {
        const name = String(e.tool)
        const out = result.result as Record<string, unknown> | undefined
        const args = e as unknown as Record<string, unknown>
        const describe = () =>
          shorten(
            typeof args.description === 'string' && args.description !== ''
              ? args.description
              : typeof args.command === 'string'
                ? args.command
                : name,
          )
        if ((name === 'Bash' || name === 'PowerShell') && out) {
          if (typeof out.backgroundTaskId === 'string') {
            await addJob($, { id: out.backgroundTaskId, kind: 'shell', name: describe(), startedAt: await $.clock.now() })
          } else if (out.interrupted === true) {
            await addIncident($, t().interrupted(await at($), describe()))
          }
        } else if (name === 'Monitor' && out && typeof out.taskId === 'string') {
          await addJob($, { id: out.taskId, kind: 'monitor', name: describe(), startedAt: await $.clock.now() })
        } else if (name === 'TaskStop' && out && typeof out.task_id === 'string') {
          const id = out.task_id
          const list = await read($, jobs)
          const job = list.find(j => j.id === id)
          const jobName = job?.name ?? (typeof out.command === 'string' ? shorten(out.command) : id)
          await update($, jobs, l => l.filter(j => j.id !== id))
          stoppedHere.add(id)
          await addIncident($, t().stopped(await at($), kindText(job?.kind ?? 'shell'), jobName))
          await maybeDone($)
        } else if (name === 'Agent') {
          await syncAgents($)
          startTicker($)
        }
      }
    } catch {
      // Die Ampel darf nie einen Werkzeugaufruf stören.
    }
    return result
  }).catch(($, e, next) => next(e))

  // Meldungen über fertige Hintergrundläufe kommen als Eingabe in die Sitzung.
  on('prompt.submit', async ($, e, next) => {
    try {
      const notice = e.origin?.kind === 'task-notification' || e.text.includes('<task-notification>') ? parseNotice(e.text) : null
      if (notice && ['completed', 'failed', 'killed', 'stopped'].includes(notice.status)) {
        await endJob($, notice.id, notice.status, notice.exitCode)
      }
    } catch {
      // nie die Eingabe aufhalten
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Am Ende jedes Zugs nennt die Engine selbst, was noch im Hintergrund läuft:
  // die Liste der Mod daran abgleichen.
  on('classic.Stop', async ($, e, next) => {
    try {
      const tasks = e.background_tasks
      if (Array.isArray(tasks)) {
        const live = new Set(tasks.map(task => task.id))
        const list = await read($, jobs)
        for (const job of list) {
          if ((job.kind === 'shell' || job.kind === 'monitor') && !live.has(job.id)) await endJob($, job.id, 'completed', null)
        }
        for (const task of tasks) {
          const kind: JobKind | null = task.type === 'shell' ? 'shell' : task.type === 'monitor' ? 'monitor' : null
          if (kind && !list.some(j => j.id === task.id)) {
            await addJob($, { id: task.id, kind, name: shorten(task.description || task.command || task.id), startedAt: await $.clock.now() })
          }
        }
      }
      if (Array.isArray(e.session_crons)) {
        const count = e.session_crons.length
        await update($, crons, () => count)
      }
    } catch {
      // nur Abgleich
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const text = t()

    try {
      const working = await read($, isWorking)
      const since = await read($, workingSince)
      const current = await read($, tool)
      const running = await read($, jobs)
      const open = await read($, incidents)
      const planned = await read($, crons)
      const time = Math.max(await read($, now), since)

      const isRed = open.length > 0
      const isAmber = working || running.length > 0
      const isGreen = !isAmber

      const lamp = Svg ? (
        <Svg
          source={lampSvg(isRed, isAmber, isGreen)}
          width={46}
          height={14}
          alt={isRed ? 'rot' : isAmber ? 'gelb' : 'grün'}
        />
      ) : (
        <Text size={SIZE}>
          <Text size={SIZE} color={isRed ? RED : OFF}>●</Text>
          <Text size={SIZE} color={isAmber ? AMBER : OFF}>●</Text>
          <Text size={SIZE} color={isGreen ? GREEN : OFF}>●</Text>
        </Text>
      )

      const status = working
        ? `${text.working(clock(time - since))} · ${current ?? text.answering}`
        : running.length > 0
          ? text.onlyBackground
          : text.idle

      const shown = running.slice(0, MAX_JOBS)
      const jobLine =
        running.length === 0 ? null : (
          <Box key="ampel-jobs" flexDirection="row" gap={2} flexWrap="wrap">
            {shown.map(job => (
              <Text key={job.id} size={SIZE} color={AMBER} wrap="truncate-end">
                {`▸ ${kindText(job.kind)}: ${job.name} ${clock(time - job.startedAt)}`}
              </Text>
            ))}
            {running.length > MAX_JOBS ? (
              <Text key="ampel-more" size={SIZE} dimColor>
                {text.more(running.length - MAX_JOBS)}
              </Text>
            ) : null}
          </Box>
        )

      const recent = open.slice(-MAX_INCIDENTS)
      const incidentLine = !isRed ? null : (
        <Box key="ampel-incidents" flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
          {recent.map(i => (
            <Text key={i.id} size={SIZE} color={RED} wrap="truncate-end">
              {`✗ ${i.text}`}
            </Text>
          ))}
          {open.length > MAX_INCIDENTS ? (
            <Text key="ampel-older" size={SIZE} dimColor>
              {text.more(open.length - MAX_INCIDENTS)}
            </Text>
          ) : null}
          <Button key="ampel-seen" plain dimColor onPress={() => void update($, incidents, () => [])}>
            <Text size={SIZE}>{text.seen}</Text>
          </Button>
        </Box>
      )

      return (
        <Box flexDirection="column">
          <Box key="ampel" flexDirection="row" gap={1} alignItems="center">
            {lamp}
            <Text size={SIZE} color={isAmber ? AMBER : GREEN} wrap="truncate-end">
              {status}
            </Text>
            {running.length > 0 ? (
              <Text key="ampel-count" size={SIZE} dimColor wrap="truncate-end">
                {`· ${text.background(running.length)}`}
              </Text>
            ) : null}
            {planned > 0 ? (
              <Text key="ampel-crons" size={SIZE} dimColor wrap="truncate-end">
                {`· ${text.crons(planned)}`}
              </Text>
            ) : null}
          </Box>
          {jobLine}
          {incidentLine}
          {rest}
        </Box>
      )
    } catch (err) {
      return (
        <Box flexDirection="column">
          <Text size={SIZE} dimColor>
            {text.drawFailed(err instanceof Error ? err.message : String(err))}
          </Text>
          {rest}
        </Box>
      )
    }
  })
}

// Der Stand als mehrzeiliger Text für /ampel.
export async function report($: EngineInterface): Promise<string> {
  const text = t()
  const working = await read($, isWorking)
  const since = await read($, workingSince)
  const current = await read($, tool)
  const running = await read($, jobs)
  const open = await read($, incidents)
  const planned = await read($, crons)
  const time = await $.clock.now()
  const isAmber = working || running.length > 0
  const lights = [open.length > 0 ? text.lightRed : null, isAmber ? text.lightAmber : text.lightGreen].filter(Boolean).join(' + ')
  const lines = [`${text.label}: ${lights}`]
  lines.push(working ? `${text.working(clock(time - since))} · ${current ?? text.answering}` : running.length > 0 ? text.onlyBackground : text.idle)
  for (const job of running) lines.push(`▸ ${kindText(job.kind)}: ${job.name} ${clock(time - job.startedAt)}`)
  if (planned > 0) lines.push(text.crons(planned))
  for (const i of open) lines.push(`✗ ${i.text}`)
  return lines.join('\n')
}

// Das Ampelgehäuse quer, eckig wie die Werkstatt-Kacheln, links und rechts je
// eine Schraube in Weißgold; nicht leuchtende Lampen bleiben dunkel.
export function lampSvg(isRed: boolean, isAmber: boolean, isGreen: boolean): string {
  const lampOf = (x: number, color: string, isOn: boolean) =>
    `<circle cx="${x}" cy="7" r="3.6" fill="${isOn ? color : OFF}"${isOn ? '' : ' stroke="#3a3a3a" stroke-width="0.6"'}/>`
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="14" viewBox="0 0 46 14">',
    '<rect x="0.5" y="0.5" width="45" height="13" fill="#161616" stroke="#4a4438" stroke-width="1"/>',
    '<circle cx="4" cy="7" r="1.5" fill="#e6dcc3" stroke="#8a7f66" stroke-width="0.5"/>',
    '<circle cx="42" cy="7" r="1.5" fill="#e6dcc3" stroke="#8a7f66" stroke-width="0.5"/>',
    lampOf(13, RED, isRed),
    lampOf(23, AMBER, isAmber),
    lampOf(33, GREEN, isGreen),
    '</svg>',
  ].join('')
}
