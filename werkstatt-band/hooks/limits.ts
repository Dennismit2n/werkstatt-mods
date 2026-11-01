// Liest die Limits so, wie die Nutzungskarte der App sie zeigt: 5 h, Woche,
// Woche je Modell, Nutzungsguthaben und Kontext. Quelle ist das App-Werkzeug
// get_usage (offiziell, nur lesend, kein Cookie). Wo es fehlt, etwa im
// Terminal, bleiben die zwei Fenster, die die Engine selbst kennt.
//
// Dieselbe Datei liegt in den Mods statistik, werkstatt-band und limitpause;
// beim Ändern alle drei Kopien gleich halten.
import type { EngineInterface, SessionRateLimit } from 'claude-code'

import type { Credit, LimitWindow, Limits } from '../types'

const USAGE_TOOL = 'mcp__ccd_session_mgmt__get_usage'

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function time(value: unknown) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? null : parsed
}

export function germanLabel(label: string) {
  if (/^5-hour/i.test(label)) return '5 h'
  const weekly = label.match(/^weekly\s*·\s*(.+)$/i)
  if (weekly) return /all models/i.test(weekly[1] ?? '') ? 'Woche' : `Woche ${weekly[1]}`
  return label
}

type Raw = Record<string, unknown>
const asRecord = (value: unknown): Raw | null =>
  typeof value === 'object' && value !== null ? (value as Raw) : null

export function parseAppUsage(raw: unknown, now: number): Limits | null {
  const data = asRecord(typeof raw === 'string' ? JSON.parse(raw) : raw)
  const plan = asRecord(data?.plan)
  if (!plan || plan.status !== 'ok' || !Array.isArray(plan.windows)) return null

  const windows: LimitWindow[] = plan.windows.flatMap(entry => {
    const w = asRecord(entry)
    if (!w || typeof w.label !== 'string') return []
    return [{ label: germanLabel(w.label), percent: num(w.percentUsed) ?? 0, resetsAt: time(w.resetsAt) }]
  })

  // Die Felder des Guthabens sind nicht beschrieben, solange es aus ist;
  // deshalb mehrere übliche Namen versuchen und sonst nur „an“ zeigen.
  const x = asRecord(plan.extraUsage)
  const credit: Credit | null = x
    ? {
        enabled: x.enabled === true,
        currency: typeof x.currency === 'string' ? x.currency : '',
        percent: num(x.percentUsed ?? x.percent ?? x.utilization),
        used: num(x.used ?? x.usedAmount ?? x.amountUsed ?? x.spent),
        limit: num(x.limit ?? x.limitAmount ?? x.monthlyLimit ?? x.cap),
      }
    : null

  const context = asRecord(data?.context)
  return {
    windows,
    credit,
    context: context?.status === 'ok' ? num(context.percentUsed) : null,
    compactsAt: num(context?.autoCompactsAtPercent),
    source: 'app',
    at: now,
  }
}

export function fromEngine(rateLimits: readonly SessionRateLimit[], context: number | null, now: number): Limits {
  const names: Record<string, string> = { five_hour: '5 h', seven_day: 'Woche' }
  return {
    windows: rateLimits.map(one => ({
      label: names[one.kind] ?? one.kind,
      percent: one.percentUsed,
      resetsAt: time(one.resetsAt),
    })),
    credit: null,
    context,
    compactsAt: null,
    source: 'engine',
    at: now,
  }
}

// Ein MCP-Werkzeug antwortet mit Text oder mit Textblöcken; beides zu einem Text.
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

export async function readLimits($: EngineInterface): Promise<Limits> {
  const now = await $.clock.now()
  try {
    // Erst still fragen (kein Dialog): würde der Aufruf eine Freigabe
    // verlangen, käme die jede Minute. Dann lieber die Engine-Zahlen.
    const verdict = await $.tool.check({ tool: USAGE_TOOL, input: {} })
    if (verdict.decision !== 'allow') throw new Error(`get_usage: ${verdict.decision}`)
    const ran = await $.tool.call({ tool: USAGE_TOOL })
    if (ran.deny === undefined && !ran.isError) {
      const parsed = parseAppUsage(resultText(ran as { text?: unknown; result?: unknown }), now)
      if (parsed) return parsed
    }
  } catch {
    // Kein App-Werkzeug (Terminal, -p): weiter mit den Zahlen der Engine.
  }
  const usage = await $.session.usage()
  return fromEngine(usage.rateLimits, usage.context.percent ?? null, now)
}
