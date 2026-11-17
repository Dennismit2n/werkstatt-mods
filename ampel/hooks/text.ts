// Alle sichtbaren Texte der Ampel in Deutsch und Englisch. Die Sprache kommt
// aus der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

// 0:42, 3:10, 1:02:05
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// 14:02, aus Millisekunden der Engine-Uhr, in der Ortszeit.
export function timeOfDay(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const de = {
  label: 'Ampel',
  commandDescription: 'Zeigt, ob in dieser Sitzung gerade etwas läuft, im Hintergrund arbeitet oder abgebrochen wurde',
  lightRed: 'rot',
  lightAmber: 'gelb',
  lightGreen: 'grün',
  idle: 'Alles steht, nichts läuft.',
  working: (since: string) => `Claude arbeitet ${since}`,
  answering: 'Antwort',
  asking: 'wartet auf deine Antwort',
  background: (n: number) => (n === 1 ? '1 läuft im Hintergrund' : `${n} laufen im Hintergrund`),
  onlyBackground: 'Claude ist fertig, im Hintergrund läuft noch',
  kind: { shell: 'Befehl', monitor: 'Monitor', agent: 'Agent', session: 'Sitzung' },
  crons: (n: number) => (n === 1 ? '1 Weckruf geplant' : `${n} Weckrufe geplant`),
  more: (n: number) => `+${n} weitere`,
  seen: 'Gesehen',
  turnAborted: (at: string) => `${at} Zug abgebrochen (Esc oder Stopp)`,
  turnError: (at: string) => `${at} Zug mit Fehler beendet`,
  turnRefused: (at: string) => `${at} Zug abgelehnt`,
  shellFailed: (at: string, name: string, code: string) => `${at} Befehl „${name}“ fehlgeschlagen${code}`,
  exitCode: (code: number) => ` (Exit ${code})`,
  stopped: (at: string, kind: string, name: string) => `${at} ${kind} „${name}“ gestoppt`,
  failed: (at: string, kind: string, name: string) => `${at} ${kind} „${name}“ fehlgeschlagen`,
  interrupted: (at: string, name: string) => `${at} Befehl „${name}“ unterbrochen`,
  uncheckedClaim: (at: string) => `${at} „Geprüft“ gemeldet, aber in diesem Zug lief nichts, was es belegt`,
  allDone: 'Ampel grün: Alles ist fertig.',
  drawFailed: (why: string) => `Ampel konnte nicht zeichnen (${why})`,
}

const en: typeof de = {
  label: 'Light',
  commandDescription: 'Shows whether anything in this session is running, working in the background or was stopped',
  lightRed: 'red',
  lightAmber: 'amber',
  lightGreen: 'green',
  idle: 'All quiet, nothing running.',
  working: (since: string) => `Claude is working ${since}`,
  answering: 'answer',
  asking: 'waiting for your answer',
  background: (n: number) => (n === 1 ? '1 running in the background' : `${n} running in the background`),
  onlyBackground: 'Claude is done, still running in the background',
  kind: { shell: 'Command', monitor: 'Monitor', agent: 'Agent', session: 'Session' },
  crons: (n: number) => (n === 1 ? '1 wake-up scheduled' : `${n} wake-ups scheduled`),
  more: (n: number) => `+${n} more`,
  seen: 'Seen',
  turnAborted: (at: string) => `${at} turn interrupted (Esc or stop)`,
  turnError: (at: string) => `${at} turn ended with an error`,
  turnRefused: (at: string) => `${at} turn refused`,
  shellFailed: (at: string, name: string, code: string) => `${at} command "${name}" failed${code}`,
  exitCode: (code: number) => ` (exit ${code})`,
  stopped: (at: string, kind: string, name: string) => `${at} ${kind} "${name}" stopped`,
  failed: (at: string, kind: string, name: string) => `${at} ${kind} "${name}" failed`,
  interrupted: (at: string, name: string) => `${at} command "${name}" interrupted`,
  uncheckedClaim: (at: string) => `${at} "Verified" claimed, but nothing ran this turn to back it`,
  allDone: 'Light green: everything has finished.',
  drawFailed: (why: string) => `Light could not draw (${why})`,
}

export const t = () => (lang === 'en' ? en : de)
