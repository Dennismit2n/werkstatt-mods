// Alle Meldungen der Limit-Pause in Deutsch und Englisch, dazu die Schreibweise
// der Zahlen. Die Sprache kommt aus der Einstellung „language“ (Manifest,
// userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

// Prozent mit zwei Nachkommastellen: 99,89 % / 99.89%.
export const pct = (n: number) => {
  const text = String(Math.round(n * 100) / 100)
  return lang === 'en' ? `${text}%` : `${text.replace('.', ',')} %`
}

export function untilText(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days} ${lang === 'en' ? 'd' : 'T'} ${hours} h`
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`
}

// Die Fenster heißen intern wie in hooks/limits.ts („5 h“, „Woche“, „Woche Fable“);
// nur die Anzeige übersetzt.
export function labelText(label: string) {
  if (lang !== 'en') return label
  if (label === 'Woche') return 'Week'
  return label.startsWith('Woche ') ? `Week ${label.slice(6)}` : label
}

const de = {
  commandDescription: 'Zeigt die Limit-Pause; „aus“ hebt sie für diese Sitzung auf, „an“ schaltet sie wieder ein',
  argumentHint: '[an|aus]',
  notifyTitle: 'Limit-Pause',
  begin: (label: string, percent: string, when: string) =>
    `Limit-Pause: ${label} steht bei ${percent}. Alles wartet und läuft ${when} von selbst weiter, nichts wird abgebrochen.`,
  whenNoReset: (max: string) => `sobald es wieder Luft hat, spätestens in ${max}`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit-Pause (${label} ${percent})`,
  endedReset: 'Limit zurückgesetzt, es geht weiter.',
  endedOff: 'Limit-Pause von Hand aufgehoben, es geht weiter.',
  endedNoReset: (max: string) =>
    `Limit-Pause aufgehoben: Das Limit nennt keinen Reset-Zeitpunkt, nach ${max} geht es trotzdem weiter.`,
  stateOff: 'Limit-Pause ist für diese Sitzung AUS.',
  stateOn: (limit: string, gap: string, from: string) =>
    `Limit-Pause ist an: Grenze ${limit}, Abstand gerade ${gap}, also Pause ab ${from}.`,
  waitingNow: (n: number, label: string, percent: string) => ` Gerade warten ${n} Anfragen (${label} ${percent}).`,
  stand: (windows: string) =>
    ` Stand: ${windows}. /limitpause aus hält nichts mehr an, /limitpause an schaltet wieder ein.`,
  noNumbers: 'keine Zahlen',
}

const en: typeof de = {
  commandDescription: 'Shows the limit pause; "off" lifts it for this session, "on" turns it back on',
  argumentHint: '[on|off]',
  notifyTitle: 'Limit pause',
  begin: (label: string, percent: string, when: string) =>
    `Limit pause: ${label} is at ${percent}. Everything waits and continues ${when} by itself; nothing is aborted.`,
  whenNoReset: (max: string) => `as soon as there is room again, at the latest in ${max}`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit pause (${label} ${percent})`,
  endedReset: 'Limit reset, continuing.',
  endedOff: 'Limit pause lifted by hand, continuing.',
  endedNoReset: (max: string) =>
    `Limit pause lifted: the limit names no reset time; after ${max} it continues anyway.`,
  stateOff: 'Limit pause is OFF for this session.',
  stateOn: (limit: string, gap: string, from: string) =>
    `Limit pause is on: threshold ${limit}, margin now ${gap}, so pausing from ${from}.`,
  waitingNow: (n: number, label: string, percent: string) => ` ${n} requests are waiting now (${label} ${percent}).`,
  stand: (windows: string) =>
    ` Now: ${windows}. /limitpause off stops holding anything, /limitpause on turns it back on.`,
  noNumbers: 'no numbers',
}

export const t = () => (lang === 'en' ? en : de)
