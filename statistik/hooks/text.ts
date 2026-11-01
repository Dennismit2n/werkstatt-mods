// Alle sichtbaren Texte der Leiste in Deutsch und Englisch, dazu die
// Schreibweise der Zahlen. Die Sprache kommt aus der Einstellung „language“
// (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

// 12.345 / 12,345 und 1,5 / 1.5: Tausender und Dezimalzeichen je Sprache.
export const int = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.')
export const decimal = (n: number, digits: number) => {
  const text = n.toFixed(digits)
  return lang === 'en' ? text : text.replace('.', ',')
}
export const comma = (n: number) => decimal(n, 1)
export function compact(n: number) {
  if (lang === 'en') {
    if (n >= 1e9) return `${comma(n / 1e9)}bn`
    if (n >= 1e6) return `${comma(n / 1e6)}M`
    if (n >= 1e3) return `${comma(n / 1e3)}k`
    return int(n)
  }
  if (n >= 1e9) return `${comma(n / 1e9)} Mrd.`
  if (n >= 1e6) return `${comma(n / 1e6)} Mio.`
  if (n >= 1e3) return `${comma(n / 1e3)} Tsd.`
  return int(n)
}
export const pct = (n: number) => {
  const text = String(Math.round(n * 10) / 10)
  return lang === 'en' ? `${text}%` : `${text.replace('.', ',')} %`
}
export const money = (n: number) => decimal(n, 2)

// „1 T 22 h“, „3 h 5 min“, „35 min“; englisch „1 d 22 h“.
export function untilText(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days} ${lang === 'en' ? 'd' : 'T'} ${hours} h`
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`
}
export function duration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

// Die Fenster heißen intern wie in hooks/limits.ts („5 h“, „Woche“, „Woche Fable“);
// nur die Anzeige übersetzt.
export function labelText(label: string) {
  if (lang !== 'en') return label
  if (label === 'Woche') return 'Week'
  return label.startsWith('Woche ') ? `Week ${label.slice(6)}` : label
}

const de = {
  title: 'Statistik',
  commandDescription: 'Zeigt Statistik und Zählwerk in einer Seitenleiste',
  opened: 'Statistik geöffnet.',
  computing: 'Rechne …',
  asOf: (stand: string) => `Stand ${stand}`,
  error: (message: string) => `Fehler: ${message}`,
  noNumbers: 'Noch keine Zahlen.',
  ranges: { all: 'Alle', d30: '30T', d7: '7T' },
  tabs: { overview: 'Übersicht', models: 'Modelle' },
  tiles: {
    sessions: 'Sitzungen',
    messages: 'Nachrichten',
    tokens: 'Token',
    activeDays: 'Aktive Tage',
    peakHour: 'Stoßzeit',
    model: 'Modell',
  },
  hour: (h: number) => `${h} Uhr`,
  calendarAlt: (weeks: number) => `Kalender der letzten ${weeks} Wochen, Nachrichten pro Tag`,
  dayTitle: (yyyy: string, mm: string, dd: string, n: number) => `${dd}.${mm}.${yyyy}: ${int(n)} Nachrichten`,
  lotr: (n: number) => `Du hast ~${int(n)}× mehr Token verwendet, als in „Der Herr der Ringe“ stecken.`,
  tokensPerModel: 'Token je Modell',
  noModels: 'Keine Modelle in diesem Zeitraum.',
  counter: 'Zählwerk',
  blockSince: (at: string) => `Block seit ${at} (geschätzt)`,
  blockAlt: 'Verstrichener Teil des Fünf-Stunden-Blocks',
  endsIn: (left: string) => `endet in ${left}`,
  expired: 'abgelaufen',
  fromCache: (amount: string) => `${amount} aus dem Cache`,
  today: 'Heute',
  replies: (n: number) => `${int(n)} ${n === 1 ? 'Antwort' : 'Antworten'}`,
  blockModelsAlt: 'Token je Modell im laufenden Block',
  limits: 'Limits',
  readingLimits: 'Limits werden gelesen …',
  resetsIn: (when: string) => `frei in ${when}`,
  credit: 'Nutzungsguthaben',
  off: 'aus',
  on: 'an',
  of: 'von',
  context: 'Kontext',
  compactsAt: (percent: number) => `fasst bei ${int(percent)} % zusammen`,
  engineOnly: 'Guthaben und Zusammenfass-Grenze fehlen, die liefert nur das App-Werkzeug.',
}

const en: typeof de = {
  title: 'Statistics',
  commandDescription: 'Shows statistics and the usage counter in a side pane',
  opened: 'Statistics opened.',
  computing: 'Computing …',
  asOf: (stand: string) => `As of ${stand}`,
  error: (message: string) => `Error: ${message}`,
  noNumbers: 'No numbers yet.',
  ranges: { all: 'All', d30: '30d', d7: '7d' },
  tabs: { overview: 'Overview', models: 'Models' },
  tiles: {
    sessions: 'Sessions',
    messages: 'Messages',
    tokens: 'Tokens',
    activeDays: 'Active days',
    peakHour: 'Peak hour',
    model: 'Model',
  },
  hour: (h: number) => `${String(h).padStart(2, '0')}:00`,
  calendarAlt: (weeks: number) => `Calendar of the last ${weeks} weeks, messages per day`,
  dayTitle: (yyyy: string, mm: string, dd: string, n: number) => `${yyyy}-${mm}-${dd}: ${int(n)} messages`,
  lotr: (n: number) => `You have used ~${int(n)}× the tokens of “The Lord of the Rings”.`,
  tokensPerModel: 'Tokens per model',
  noModels: 'No models in this range.',
  counter: 'Counter',
  blockSince: (at: string) => `Block since ${at} (estimated)`,
  blockAlt: 'Elapsed part of the five-hour block',
  endsIn: (left: string) => `ends in ${left}`,
  expired: 'expired',
  fromCache: (amount: string) => `${amount} from cache`,
  today: 'Today',
  replies: (n: number) => `${int(n)} ${n === 1 ? 'reply' : 'replies'}`,
  blockModelsAlt: 'Tokens per model in the current block',
  limits: 'Limits',
  readingLimits: 'Reading limits …',
  resetsIn: (when: string) => `resets in ${when}`,
  credit: 'Extra usage',
  off: 'off',
  on: 'on',
  of: 'of',
  context: 'Context',
  compactsAt: (percent: number) => `compacts at ${int(percent)}%`,
  engineOnly: 'Extra usage and the compaction threshold are missing; only the app tool provides them.',
}

export const t = () => (lang === 'en' ? en : de)
