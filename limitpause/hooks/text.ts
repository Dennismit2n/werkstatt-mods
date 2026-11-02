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
    `Limit-Pause: ${label} steht bei ${percent}. Die Anfrage wartet und läuft ${when} von selbst weiter, nichts wird abgebrochen.`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit-Pause (${label} ${percent})`,
  endedReset: 'Limit zurückgesetzt, es geht weiter.',
  endedOff: 'Limit-Pause von Hand aufgehoben, es geht weiter.',
  stopped: (label: string, percent: string, when: string) =>
    `Limit-Pause: ${label} steht bei ${percent}, ${when}. Die Anfrage wurde nicht gesendet, damit nichts stundenlang hängt. Nach dem Reset einfach erneut senden; /limitpause aus und erneut senden schickt sie sofort.`,
  freeIn: (left: string) => `frei in ${left}`,
  noResetKnown: 'Reset-Zeitpunkt unbekannt',
  stateOff: 'Limit-Pause ist für diese Sitzung AUS.',
  stateOn: (limit: string, gap: string, from: string, maxWait: string) =>
    `Limit-Pause ist an: Grenze ${limit}, Abstand gerade ${gap}, also Pause ab ${from}. Gewartet wird höchstens ${maxWait}, sonst wird die Anfrage mit Hinweis gestoppt; Agenten warten nie.`,
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
    `Limit pause: ${label} is at ${percent}. The request waits and continues ${when} by itself; nothing is aborted.`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit pause (${label} ${percent})`,
  endedReset: 'Limit reset, continuing.',
  endedOff: 'Limit pause lifted by hand, continuing.',
  stopped: (label: string, percent: string, when: string) =>
    `Limit pause: ${label} is at ${percent}, ${when}. The request was not sent, so nothing hangs for hours. Simply send it again after the reset; /limitpause off and sending again sends it right away.`,
  freeIn: (left: string) => `free in ${left}`,
  noResetKnown: 'reset time unknown',
  stateOff: 'Limit pause is OFF for this session.',
  stateOn: (limit: string, gap: string, from: string, maxWait: string) =>
    `Limit pause is on: threshold ${limit}, margin now ${gap}, so pausing from ${from}. It waits at most ${maxWait}, otherwise the request is stopped with a note; agents never wait.`,
  waitingNow: (n: number, label: string, percent: string) => ` ${n} requests are waiting now (${label} ${percent}).`,
  stand: (windows: string) =>
    ` Now: ${windows}. /limitpause off stops holding anything, /limitpause on turns it back on.`,
  noNumbers: 'no numbers',
}

export const t = () => (lang === 'en' ? en : de)
