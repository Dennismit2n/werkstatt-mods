// Die reine Rechnung der Registerkarten: welcher Abschnitt welchen Farbpunkt
// bekommt. Kein Zugriff auf die App, damit sich alles ohne Engine prüfen lässt.

// Die Punkte, die als Reiter gelten. Ein Name, der mit einem davon beginnt, hat
// schon seine Farbe und wird nie wieder angefasst.
export const DOTS = ['🔵', '🟢', '🟣', '🟠', '🔴', '🟡', '🟤', '⚫', '⚪'] as const

export type Rule = { dot: string; words: string[] }

// Die Standardregeln, Deutsch und Englisch gemischt. Die Reihenfolge zählt: Die
// erste Regel mit einem Treffer gewinnt, darum stehen die engen Themen vorn
// („Skill/create-masterprompt“ soll lila werden, nicht blau).
export const DEFAULT_RULES = [
  '🟣 claude, mod, skill, prompt, plugin, mcp, agent, editor',
  '🟢 windows, exe, desktop, overlay, monitor, ticker, tray, netzwerk, network',
  '🟠 spiel, game, gaming, flipper, schach, chess, minecraft, puzzle, quiz',
  '🔴 anleitung, doku, docs, wissen, notiz, notes, obsidian, brain, cloud, lernen, guide',
  '🔵 web, seite, site, page, pwa, app, startseite, landing, readme, html, design, cockpit',
].join('; ')

// „🔵 web, seite; 🟢 windows“ → Regeln. Ein Block ohne gültigen Punkt vorn oder
// ohne Wörter fällt weg, damit eine Tippfehler-Regel nichts falsch färbt.
export function parseRules(text: string): Rule[] {
  return text
    .split(';')
    .map(block => block.trim())
    .flatMap(block => {
      const dot = DOTS.find(one => block.startsWith(one))
      if (dot === undefined) return []
      const words = afterDot(block, dot)
        .split(',')
        .map(word => word.trim().toLowerCase())
        .filter(word => word !== '')
      return words.length > 0 ? [{ dot, words }] : []
    })
}

// Der Rest nach dem Punkt. ⚫ und ⚪ stehen oft mit dem Variantenwähler U+FE0F
// („⚫️“); der gehört zum Punkt und darf nicht am Namen kleben bleiben.
export function afterDot(text: string, dot: string): string {
  return text.trimStart().slice(dot.length).replace(/^️/, '').trim()
}

export function leadingDot(name: string): string | null {
  const trimmed = name.trimStart()
  return DOTS.find(one => trimmed.startsWith(one)) ?? null
}

// Ob ein Name schon ein eigenes Zeichen vorn trägt, einen der Punkte oder ein
// anderes Emoji (🟥, 🎮, ⭐): Dann ist er gekennzeichnet und bleibt, wie er ist.
export const isMarked = (name: string) => leadingDot(name) !== null || /^\s*\p{Extended_Pictographic}/u.test(name)

export function stripDot(name: string): string {
  const dot = leadingDot(name)
  return dot === null ? name.trim() : afterDot(name, dot)
}

export const withDot = (name: string, dot: string) => `${dot} ${stripDot(name)}`

// Trifft ein Stichwort am Anfang oder am Ende eines Wortes: „Rennspiel“ und
// „Spieleabend“ sind Spiele, „Beispiele“ nicht; „Wetter/Heiz-App“ ist eine App,
// „Mappe“ nicht. Mitten im Wort zählt es nicht.
function hits(text: string, word: string): boolean {
  const at = (index: number) => index < 0 || index >= text.length || !/[\p{L}\p{N}]/u.test(text[index] ?? '')
  for (let from = text.indexOf(word); from !== -1; from = text.indexOf(word, from + 1)) {
    if (at(from - 1) || at(from + word.length)) return true
  }
  return false
}

// Der Punkt der ersten Regel, deren Wort im Namen vorkommt; sonst null.
export function pick(name: string, rules: readonly Rule[]): string | null {
  const lower = stripDot(name).toLowerCase()
  return rules.find(rule => rule.words.some(word => hits(lower, word)))?.dot ?? null
}

export type Section = { id: string; kind: string; name: string }
export type Rename = { id: string; from: string; to: string }

// Was zu tun ist: eigene Abschnitte ohne Punkt, für die eine Regel greift,
// bekommen ihren Punkt; die ohne Treffer stehen in `open`.
export function plan(sections: readonly Section[], rules: readonly Rule[]) {
  const own = sections.filter(one => one.kind === 'manual' && one.name.trim() !== '')
  const renames: Rename[] = []
  const open: string[] = []
  for (const one of own) {
    if (isMarked(one.name)) continue
    const dot = pick(one.name, rules)
    if (dot === null) open.push(one.name)
    else renames.push({ id: one.id, from: one.name, to: withDot(one.name, dot) })
  }
  return { renames, open, colored: own.filter(one => isMarked(one.name)) }
}

// „/registerkarten 🟠 Strecken“: der eine eigene Abschnitt, dessen Name den Teil
// enthält. Mehrere Treffer: der mit genau diesem Namen, sonst keiner.
export function findSection(sections: readonly Section[], part: string): Section[] {
  const wanted = part.trim().toLowerCase()
  if (wanted === '') return []
  const own = sections.filter(one => one.kind === 'manual')
  const exact = own.filter(one => stripDot(one.name).toLowerCase() === wanted)
  return exact.length > 0 ? exact : own.filter(one => stripDot(one.name).toLowerCase().includes(wanted))
}
