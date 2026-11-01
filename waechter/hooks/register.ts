import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TrackedAgent } from '../types'
import { setLanguage, t } from './text'

const norm = (path: string) => path.replace(/\//g, '\\').toLowerCase()
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Das Löschwort zählt nur dort, wo ein Befehl anfängt: am Anfang, nach ; & | (
// { oder Zeilenumbruch, hinter xargs, -exec, sudo oder in -c/-Command "…".
// So bleibt grep -ri … <datei> frei, das -ri ist kein Remove-Item.
export function harmPattern(fileName: string) {
  const file = escapeRe(fileName)
  return new RegExp(
    `(?:^|[;&|({\\n]|\\bxargs\\s|-exec\\s|\\bsudo\\s|-c(?:ommand)?\\s+["']?)\\s*(?:rm|del|erase|rd|rmdir|mv|move|ri|remove-item|move-item|rename-item|set-content|out-file|clear-content|truncate)\\b[^;&|\\n]*${file}|>\\s*["']?[^\\s"'<>|;&]*${file}`,
    'i',
  )
}

// Voreinstellungen für Dennis' PC (Windows, 16 GB); andere setzen ihre Werte
// beim Installieren oder in /config (Manifest, userConfig).
// Die gemeinsame Server-Liste aller Sitzungen der Desktop-App: nur ergänzen,
// nie ersetzen (Panne vom 29.10.2026, eine Sitzung hat sie überschrieben).
const DEFAULT_PROTECTED_FILE = '\\.claude\\launch.json'
// Windows kappt eine Befehlszeile bei 8.191 Zeichen still; ab etwa 8.000
// brechen Aufrufe mit "unexpected EOF" ab. Mit Abstand darunter bleiben.
const DEFAULT_MAX_COMMAND = 7500
// 16 GB Arbeitsspeicher: höchstens zwei schwere Agenten gleichzeitig
// (am 30.09.2026 haben acht parallele den Rechner eingefroren).
const DEFAULT_HEAVY_MAX = 2
const DEFAULT_ALL_MAX = 4
const DEFAULT_LIGHT = ['Explore', 'claude-code-guide', 'Plan', 'statusline-setup']
const MAX_AGE_MS = 60 * 60 * 1000

// Einstellungen aus dem Manifest, gesetzt in register. Eine leere Datei
// schaltet den Dateischutz ab, eine Befehlslänge 0 die Längenprüfung.
let protectedFile = norm(DEFAULT_PROTECTED_FILE)
let protectedName = 'launch.json'
let shellHarm: RegExp | null = harmPattern(protectedName)
let maxCommand = DEFAULT_MAX_COMMAND
let heavyMax = DEFAULT_HEAVY_MAX
let allMax = DEFAULT_ALL_MAX
let light = new Set<string>(DEFAULT_LIGHT)

const agents = atom({ plugin: 'waechter', key: 'agents' } as const, [])
const isBrakeOff = atom({ plugin: 'waechter', key: 'isBrakeOff' } as const, false)

// Agentenstarts laufen hier nacheinander durch die Bremse. Was ein Start in
// $.state schreibt, sieht ein gleichzeitiger erst, wenn der erste ganz fertig
// ist; deshalb merkt sich das Modul die eigenen Starts zusätzlich selbst.
let queue: Promise<void> = Promise.resolve()
const startedHere = new Map<string, TrackedAgent>()

async function liveAgents($: EngineInterface): Promise<TrackedAgent[]> {
  const now = await $.clock.now()
  const listed = await $.agent.list()
  const isActive = (status: string) => status === 'running' || status === 'pending'
  const byId = new Map(listed.map(one => [one.id, one]))
  const known = new Map((await read($, agents)).map(one => [one.id, one]))
  for (const one of startedHere.values()) known.set(one.id, one)
  const alive = [...known.values()].filter(one => {
    const seen = byId.get(one.id)
    // Agenten eines Workflows stehen nicht in der Liste: dort zählt das Alter.
    return seen ? isActive(seen.status) : now - one.startedAt < MAX_AGE_MS
  })
  for (const id of startedHere.keys()) {
    if (!alive.some(one => one.id === id)) startedHere.delete(id)
  }
  for (const one of listed) {
    if (isActive(one.status) && !one.teammateId && !alive.some(a => a.id === one.id)) {
      alive.push({ id: one.id, type: one.type, startedAt: now })
    }
  }
  await update($, agents, () => alive)
  return alive
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  const file = typeof options.protectedFile === 'string' ? options.protectedFile.trim() : DEFAULT_PROTECTED_FILE
  protectedFile = norm(file)
  protectedName = protectedFile.split('\\').pop() || protectedFile
  shellHarm = protectedName === '' ? null : harmPattern(protectedName)
  maxCommand = typeof options.maxCommand === 'number' ? options.maxCommand : DEFAULT_MAX_COMMAND
  heavyMax = typeof options.heavyMax === 'number' ? options.heavyMax : DEFAULT_HEAVY_MAX
  allMax = typeof options.allMax === 'number' ? options.allMax : DEFAULT_ALL_MAX
  light = new Set(Array.isArray(options.lightAgents) ? options.lightAgents.map(String) : DEFAULT_LIGHT)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agentenbremse',
      description: t().commandDescription,
    })

    return next(e)
  })

  on('command.run', { command: 'agentenbremse' }, async $ => {
    const wasOff = await read($, isBrakeOff)
    await update($, isBrakeOff, () => !wasOff)
    const alive = await liveAgents($)

    return { text: wasOff ? t().brakeOn(heavyMax, alive.length) : t().brakeOff }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as { file_path?: string; command?: string }

    if (protectedFile !== '' && tool === 'Write' && norm(input.file_path ?? '').endsWith(protectedFile)) {
      const exists = await $.fs.stat(input.file_path ?? '').then(
        stat => stat.kind === 'file',
        () => false,
      )
      if (exists) return { deny: t().denyWrite(protectedName) }
    }

    if ((tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string') {
      if (maxCommand > 0 && input.command.length > maxCommand) {
        return { deny: t().denyLong(input.command.length, maxCommand) }
      }
      if (shellHarm !== null && shellHarm.test(input.command)) {
        return { deny: t().denyHarm(protectedName) }
      }
    }

    return next(e)
  }).catch(($, e, next) => {
    $.ui.toast(t().checkFailed)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (await read($, isBrakeOff)) return next(e)

    // Startet das Modell mehrere Agenten in einer Nachricht, kommen die Hooks
    // gleichzeitig. Ohne Reihe sähe jeder noch null laufende (31.10.2026: fünf
    // auf einmal durch). Ein Start meldet sich, sobald der Agent läuft, die
    // Reihe hält also nur kurz.
    const before = queue
    let done = () => {}
    queue = new Promise<void>(go => (done = go))
    try {
      await before
      const alive = await liveAgents($)
      const heavy = alive.filter(one => !light.has(one.type)).length
      const isLight = light.has(e.subagentType)
      if (alive.length >= allMax || (!isLight && heavy >= heavyMax)) {
        return { deny: t().denyBrake(alive.length, heavy, heavyMax) }
      }

      const now = await $.clock.now()
      const started = await next(e)
      const id = started.agentId
      if (id !== undefined) {
        const entry = { id, type: e.subagentType, startedAt: now }
        startedHere.set(id, entry)
        await update($, agents, list => [...list.filter(one => one.id !== id), entry])
      }

      return started
    } finally {
      done()
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: t().denyRace }))

  on('classic.SubagentStop', async ($, e, next) => {
    startedHere.delete(e.agent_id)
    await update($, agents, list => list.filter(one => one.id !== e.agent_id))

    return next(e)
  }).catch(($, e, next) => next(e))
}
