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

// Prozent mit einer bis zwei Nachkommastellen: 99,0 % / 99,89 % / 99.89%.
export const pct = (n: number) => {
  // Mindestens eine, höchstens zwei Nachkommastellen (Dennis, 16.11.2026):
  // 74 → „74,0 %“, 99,2 → „99,2 %“, 99,261 → „99,26 %“.
  const fixed = n.toFixed(2)
  const text = fixed.endsWith('0') ? fixed.slice(0, -1) : fixed
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
  commandDescription:
    'Zeigt die Limit-Pause; „einmal“ lässt die nächste Runde durch, „aus“ hebt sie für diese Sitzung auf, „an“ schaltet sie wieder ein',
  argumentHint: '[einmal|an|aus]',
  freeArmed:
    'Freifahrt: Die nächste Runde läuft ohne Limit-Pause durch, etwa für /uebergabe oder /stand. Danach ist die Pause wieder scharf.',
  freeUsed: 'Freifahrt: Diese Runde läuft ohne Limit-Pause, danach ist sie wieder scharf.',
  rerouted: (label: string, percent: string, to: string, from: string, when: string) =>
    `Limit-Pause: ${label} steht bei ${percent}. Anfragen laufen bis zum Reset (${when}) mit ${to} statt ${from} weiter, nichts wird gestoppt.`,
  warn: (label: string, percent: string) =>
    `Limit naht: ${label} steht bei ${percent}. Jetzt die Übergabe schreiben (/uebergabe), dann reicht der Rest sicher.`,
  warnStatus: (label: string, percent: string) => `Limit naht (${label} ${percent}): jetzt /uebergabe`,
  extras: (fallback: string | null, points: number, isFreeArmed: boolean) =>
    `${fallback === null ? ' Keine Modell-Ausweiche.' : ` Ist nur ein Modell-Wochenlimit voll, geht es mit ${fallback} weiter.`}${points > 0 ? ` Vorwarnung ${String(points).replace('.', ',')} Punkte vor der Grenze.` : ''}${isFreeArmed ? ' Freifahrt für die nächste Runde ist bereit.' : ''}`,
  notifyTitle: 'Limit-Pause',
  begin: (label: string, percent: string, when: string) =>
    `Limit-Pause: ${label} steht bei ${percent}. Die Anfrage wartet und läuft ${when} von selbst weiter, nichts wird abgebrochen.`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit-Pause (${label} ${percent})`,
  endedReset: 'Limit zurückgesetzt, es geht weiter.',
  endedOff: 'Limit-Pause von Hand aufgehoben, es geht weiter.',
  stopped: (label: string, percent: string, when: string) =>
    `Limit-Pause: ${label} steht bei ${percent}, ${when}. Die Anfrage wurde nicht gesendet, damit nichts stundenlang hängt. Nach dem Reset einfach erneut senden. /limitpause einmal lässt die nächste Runde durch (etwa für /uebergabe), /limitpause aus hebt die Pause ganz auf.`,
  freeIn: (left: string) => `frei in ${left}`,
  noResetKnown: 'Reset-Zeitpunkt unbekannt',
  stateOff: 'Limit-Pause ist für diese Sitzung AUS.',
  stateOn: (limit: string, gap: string, from: string, maxWait: string) =>
    `Limit-Pause ist an: Grenze ${limit}, Abstand gerade ${gap}, also Pause ab ${from}. Gewartet wird höchstens ${maxWait}, sonst wird die Anfrage mit Hinweis gestoppt; Agenten warten nie.`,
  waitingNow: (n: number, label: string, percent: string) => ` Gerade ${n === 1 ? 'wartet 1 Anfrage' : `warten ${n} Anfragen`} (${label} ${percent}).`,
  stand: (windows: string) =>
    ` Stand: ${windows}. /limitpause einmal lässt die nächste Runde durch, /limitpause aus hält nichts mehr an, /limitpause an schaltet wieder ein.`,
  noNumbers: 'keine Zahlen',
  noAppNumbers: ' Ohne die Zahlen der App (get_usage nicht freigegeben?) sieht die Ausweiche kein volles Modell-Wochenlimit.',
}

const en: typeof de = {
  commandDescription:
    'Shows the limit pause; "once" lets the next turn through, "off" lifts it for this session, "on" turns it back on',
  argumentHint: '[once|on|off]',
  freeArmed:
    'Free pass: the next turn runs without the limit pause, for example for /uebergabe or /stand. After that the pause is armed again.',
  freeUsed: 'Free pass: this turn runs without the limit pause, after that it is armed again.',
  rerouted: (label: string, percent: string, to: string, from: string, when: string) =>
    `Limit pause: ${label} is at ${percent}. Requests run on ${to} instead of ${from} until the reset (${when}); nothing is stopped.`,
  warn: (label: string, percent: string) =>
    `Limit ahead: ${label} is at ${percent}. Write the handover now (/uebergabe) while there is room left.`,
  warnStatus: (label: string, percent: string) => `Limit ahead (${label} ${percent}): /uebergabe now`,
  extras: (fallback: string | null, points: number, isFreeArmed: boolean) =>
    `${fallback === null ? ' No model fallback.' : ` If only one model's weekly limit is full, it continues on ${fallback}.`}${points > 0 ? ` Warning ${points} points before the threshold.` : ''}${isFreeArmed ? ' A free pass for the next turn is ready.' : ''}`,
  notifyTitle: 'Limit pause',
  begin: (label: string, percent: string, when: string) =>
    `Limit pause: ${label} is at ${percent}. The request waits and continues ${when} by itself; nothing is aborted.`,
  whenIn: (left: string) => `in ${left}`,
  status: (label: string, percent: string) => `Limit pause (${label} ${percent})`,
  endedReset: 'Limit reset, continuing.',
  endedOff: 'Limit pause lifted by hand, continuing.',
  stopped: (label: string, percent: string, when: string) =>
    `Limit pause: ${label} is at ${percent}, ${when}. The request was not sent, so nothing hangs for hours. Simply send it again after the reset. /limitpause once lets the next turn through (for example for /uebergabe), /limitpause off lifts the pause entirely.`,
  freeIn: (left: string) => `free in ${left}`,
  noResetKnown: 'reset time unknown',
  stateOff: 'Limit pause is OFF for this session.',
  stateOn: (limit: string, gap: string, from: string, maxWait: string) =>
    `Limit pause is on: threshold ${limit}, margin now ${gap}, so pausing from ${from}. It waits at most ${maxWait}, otherwise the request is stopped with a note; agents never wait.`,
  waitingNow: (n: number, label: string, percent: string) => ` ${n === 1 ? '1 request is' : `${n} requests are`} waiting now (${label} ${percent}).`,
  stand: (windows: string) =>
    ` Now: ${windows}. /limitpause once lets the next turn through, /limitpause off stops holding anything, /limitpause on turns it back on.`,
  noNumbers: 'no numbers',
  noAppNumbers: ' Without the app’s numbers (get_usage not allowed?) the fallback cannot see a full model weekly limit.',
}

export const t = () => (lang === 'en' ? en : de)
