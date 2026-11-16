import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_RULES, DOTS, afterDot, findSection, parseRules, plan, stripDot, withDot } from './farben'
import type { Rule, Section } from './farben'
import { setLanguage, t } from './text'

// Farbige Reiter in der Seitenleiste des Code-Tabs (Dennis, 16.11.2026: „wie
// damals in Ordnern bunte Registerkarten“). Die App kennt keine Farbe je
// Abschnitt, also bekommt der Name einen Farbpunkt vorn. Die Seitenleiste
// erreicht die Mod über die App-Werkzeuge mcp__ccd_sidebar__*.
const LIST = 'mcp__ccd_sidebar__list_sections'
const RENAME = 'mcp__ccd_sidebar__rename_section'

// Neue Abschnitte mitten in der Sitzung: höchstens alle zehn Minuten nachsehen.
const RECHECK_MS = 10 * 60_000

let rules: Rule[] = parseRules(DEFAULT_RULES)
let rulesFromSetting = true
let isAuto = true
let lastCheck = 0
// Den Hinweis „noch kein Reiter“ nur einmal je Sitzung und Anzahl zeigen.
let hinted = -1

// Ein App-Werkzeug antwortet mit Text oder mit Textblöcken; beides zu einem Text.
function resultText(ran: { text?: unknown; result?: unknown }): string {
  if (typeof ran.text === 'string' && ran.text.trim() !== '') return ran.text
  const result = ran.result
  if (typeof result === 'string') return result
  const blocks = Array.isArray(result)
    ? result
    : Array.isArray((result as { content?: unknown } | null)?.content)
      ? ((result as { content: unknown[] }).content)
      : []
  return blocks.map(block => (typeof (block as { text?: unknown })?.text === 'string' ? (block as { text: string }).text : '')).join('')
}

export function parseSections(raw: string): Section[] | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return null
    return data.flatMap(one => {
      const row = one as Record<string, unknown>
      return typeof row?.id === 'string' && typeof row.name === 'string' && typeof row.kind === 'string'
        ? [{ id: row.id, kind: row.kind, name: row.name }]
        : []
    })
  } catch {
    return null
  }
}

// Ob ein App-Werkzeug ohne Rückfrage läuft. Still gefragt, ohne Dialog.
async function isAllowed($: EngineInterface, tool: string) {
  try {
    return (await $.tool.check({ tool, input: {} })).decision === 'allow'
  } catch {
    return false
  }
}

// null: Seitenleiste nicht erreichbar; 'denied': Lesen ist nicht freigegeben.
async function listSections($: EngineInterface): Promise<Section[] | null | 'denied'> {
  try {
    const ran = (await $.tool.call({ tool: LIST } as never)) as { text?: unknown; result?: unknown; isError?: boolean; deny?: unknown }
    if (ran.deny !== undefined) return 'denied'
    if (ran.isError) return null
    return parseSections(resultText(ran))
  } catch {
    return null
  }
}

async function rename($: EngineInterface, id: string, name: string, consent?: string) {
  try {
    const ran = (await $.tool.call({
      tool: RENAME,
      section_id: id,
      name,
      ...(consent === undefined ? {} : { consent }),
    } as never)) as { isError?: boolean; deny?: unknown }
    return ran.deny === undefined && !ran.isError
  } catch {
    return false
  }
}

// Von selbst, ohne je einen Dialog aufzumachen: Nur wenn Lesen und Umbenennen
// erlaubt sind, färbt die Mod; sonst zeigt sie einmal einen Hinweis.
export async function autoColor($: EngineInterface) {
  if (!isAuto || !(await isAllowed($, LIST))) return
  const sections = await listSections($)
  if (sections === null || sections === 'denied') return
  const { renames } = plan(sections, rules)
  if (renames.length === 0) return
  if (await isAllowed($, RENAME)) {
    let n = 0
    for (const one of renames) if (await rename($, one.id, one.to)) n += 1
    if (n > 0) $.ui.toast(t().done(n))
    return
  }
  if (hinted !== renames.length) {
    hinted = renames.length
    $.ui.toast(t().hint(renames.length))
  }
}

function legendText(sections: Section[]) {
  const text = t()
  const legend = rules.map(rule => `${rule.dot} ${rule.words.join(', ')}`).join(' · ')
  const { renames, open, colored } = plan(sections, rules)
  const parts = [`${text.legend}: ${legend}.`, text.colored(colored.length)]
  if (renames.length > 0) parts.push(text.toColor(renames.map(one => one.to).join(', ')))
  if (open.length > 0) parts.push(text.open(open.join(', ')))
  if (renames.length === 0 && open.length === 0) parts.push(text.allDone)
  if (!rulesFromSetting) parts.push(text.noRules)
  parts.push(text.howTo)
  return parts.join(' ')
}

async function colorAll($: EngineInterface, args: string) {
  const sections = await listSections($)
  if (sections === null) return t().noSidebar
  if (sections === 'denied') return t().listDenied
  const { renames } = plan(sections, rules)
  if (renames.length === 0) return t().nothing
  const failed: string[] = []
  let n = 0
  for (const one of renames) {
    if (await rename($, one.id, one.to, t().consent(args))) n += 1
    else failed.push(one.from)
  }
  return [n > 0 ? t().done(n) : '', failed.length > 0 ? t().failed(failed.join(', ')) : ''].filter(Boolean).join(' ')
}

async function colorOne($: EngineInterface, args: string, dot: string, part: string) {
  const sections = await listSections($)
  if (sections === null) return t().noSidebar
  if (sections === 'denied') return t().listDenied
  const hits = findSection(sections, part)
  if (hits.length === 0) return t().noMatch(part)
  if (hits.length > 1) return t().ambiguous(hits.map(one => stripDot(one.name)).join(', '))
  const target = hits[0] as Section
  const to = withDot(target.name, dot)
  return (await rename($, target.id, to, t().consent(args))) ? t().renamed(to) : t().failed(target.name)
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  const fromSetting = typeof options.rules === 'string' ? parseRules(options.rules) : []
  rulesFromSetting = typeof options.rules !== 'string' || fromSetting.length > 0
  rules = fromSetting.length > 0 ? fromSetting : parseRules(DEFAULT_RULES)
  isAuto = options.autoColor !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'registerkarten',
      description: t().commandDescription,
      argumentHint: t().argumentHint,
    })
    const result = await next(e)
    lastCheck = await $.clock.now()
    await autoColor($)
    return result
  })

  // Abschnitte, die mitten in der Sitzung entstehen: nach einer Antwort der
  // Hauptsitzung, höchstens alle zehn Minuten.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    if (now - lastCheck >= RECHECK_MS) {
      lastCheck = now
      await autoColor($)
    }
    return result
  })

  on('command.run', { command: 'registerkarten' }, async ($, e) => {
    const args = e.args.trim()
    const word = args.toLowerCase()
    if (word === 'färben' || word === 'faerben' || word === 'color' || word === 'colour') {
      return { text: await colorAll($, args) }
    }
    if (args !== '') {
      const dot = DOTS.find(one => args.startsWith(one))
      if (dot === undefined) return { text: t().badDot(DOTS.join(' ')) }
      return { text: await colorOne($, args, dot, afterDot(args, dot)) }
    }
    const sections = await listSections($)
    if (sections === 'denied') return { text: t().listDenied }
    return { text: sections === null ? t().noSidebar : legendText(sections) }
  })
}
