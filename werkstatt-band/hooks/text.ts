// Alle sichtbaren Texte des Bands in Deutsch und Englisch, dazu die
// Schreibweise der Zahlen. Die Sprache kommt aus der Einstellung „language“
// (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

export const decimal = (n: number, digits: number) => {
  const text = n.toFixed(digits)
  return lang === 'en' ? text : text.replace('.', ',')
}
export const pct = (n: number) => {
  const text = String(Math.round(n * 10) / 10)
  return lang === 'en' ? `${text}%` : `${text.replace('.', ',')} %`
}
export const money = (n: number) => decimal(n, 2)

// Kurz, damit das Band in eine Zeile passt (Dennis, 31.10.): „2:50 h“, „1 T 22 h“, „35 min“.
export function untilText(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days} ${lang === 'en' ? 'd' : 'T'} ${hours} h`
  return hours > 0 ? `${hours}:${String(rest).padStart(2, '0')} h` : `${rest} min`
}

// Die Fenster heißen intern wie in hooks/limits.ts („5 h“, „Woche“, „Woche Fable“);
// nur die Anzeige übersetzt.
export function labelText(label: string) {
  if (lang !== 'en') return label
  if (label === 'Woche') return 'Week'
  return label.startsWith('Woche ') ? `Week ${label.slice(6)}` : label
}

const de = {
  commandDescription: 'Klappt das Limits-Band über dem Eingabefeld ein oder aus',
  bandShown: 'Limits-Band ausgeklappt.',
  bandHidden: 'Limits-Band eingeklappt.',
  credit: 'Guthaben',
  off: 'aus',
  on: 'an',
  of: 'von',
  context: 'Kontext',
  noLimitsYet: 'Limits erscheinen nach der ersten Antwort.',
  statistics: 'Statistik',
  agents: 'Agenten',
  limitsOpen: 'Limits ▾',
  limitsClosed: 'Limits ▸',
  newsChanged: (names: string) => `Geändert: ${names}.`,
  newsAsk: (file: string) => `Satz in ${file} nachziehen?`,
  done: 'Erledigt',
  textCheck: (file: string, parts: string) => `Textprüfer, ${file}: ${parts}. Sichtbare Texte prüfen.`,
  apostrophes: (n: number) => `${n} gerade${n === 1 ? 'r Apostroph' : ' Apostrophe'} (’ statt ')`,
  dashes: (n: number) => `${n} Gedankenstrich${n === 1 ? '' : 'e'}`,
  and: ' und ',
  drawFailed: (reason: string) => `Band konnte nicht zeichnen (${reason})`,
  timeout: 'Zeitüberschreitung',
  error: 'Fehler',
}

const en: typeof de = {
  commandDescription: 'Hides or shows the limits band above the prompt',
  bandShown: 'Limits band shown.',
  bandHidden: 'Limits band hidden.',
  credit: 'Extra usage',
  off: 'off',
  on: 'on',
  of: 'of',
  context: 'Context',
  noLimitsYet: 'Limits appear after the first reply.',
  statistics: 'Statistics',
  agents: 'Agents',
  limitsOpen: 'Limits ▾',
  limitsClosed: 'Limits ▸',
  newsChanged: (names: string) => `Changed: ${names}.`,
  newsAsk: (file: string) => `Add a line to ${file}?`,
  done: 'Done',
  textCheck: (file: string, parts: string) => `Text check, ${file}: ${parts}. Check the visible texts.`,
  apostrophes: (n: number) => `${n} straight apostrophe${n === 1 ? '' : 's'} (’ instead of ')`,
  dashes: (n: number) => `${n} dash${n === 1 ? '' : 'es'}`,
  and: ' and ',
  drawFailed: (reason: string) => `Band could not draw (${reason})`,
  timeout: 'timeout',
  error: 'error',
}

export const t = () => (lang === 'en' ? en : de)
