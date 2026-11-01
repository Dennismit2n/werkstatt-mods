// Alle sichtbaren Texte der Leiste in Deutsch und Englisch. Die Sprache kommt
// aus der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

// Ganze Zahlen mit Tausenderpunkt (de) oder Komma (en): 12.345 / 12,345.
export const int = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.')

const de = {
  title: 'Agenten',
  commandDescription: 'Zeigt die Subagenten dieser Sitzung in einer Seitenleiste',
  opened: 'Agenten-Leiste geöffnet.',
  word: {
    running: 'läuft',
    done: 'fertig',
    failed: 'gescheitert',
    aborted: 'abgebrochen',
    ended: 'beendet',
  },
  header: (running: number, total: number) =>
    `${running} ${running === 1 ? 'läuft' : 'laufen'} · ${total} gesamt`,
  clearDone: 'Fertige leeren',
  empty: 'Noch keine Agenten in dieser Sitzung. Sobald einer startet, erscheint er hier.',
  emptyHint:
    'Gezählt werden Subagenten, die Claude hier mit dem Agent-Werkzeug startet. Andere Sitzungen in der Seitenleiste der App sind keine Agenten dieser Sitzung.',
  tools: (n: number) => `${int(n)} ${n === 1 ? 'Werkzeug' : 'Werkzeuge'}`,
  requests: (n: number) => `${int(n)} ${n === 1 ? 'Anfrage' : 'Anfragen'}`,
  tokens: (n: number) => `${int(n)} Token`,
  last: 'zuletzt: ',
  viewTranscript: 'Verlauf ansehen',
  backToMain: 'Zurück zum Hauptchat',
  sessions: 'Sitzungen',
  sessionsHeader: (working: number, total: number) =>
    `${working} ${working === 1 ? 'arbeitet' : 'arbeiten'} · ${total} offen`,
}

const en: typeof de = {
  title: 'Agents',
  commandDescription: 'Shows the subagents of this session in a side pane',
  opened: 'Agents pane opened.',
  word: {
    running: 'running',
    done: 'done',
    failed: 'failed',
    aborted: 'stopped',
    ended: 'ended',
  },
  header: (running: number, total: number) => `${running} running · ${total} total`,
  clearDone: 'Clear finished',
  empty: 'No agents in this session yet. As soon as one starts, it shows up here.',
  emptyHint:
    'Counted are the subagents Claude starts here with the Agent tool. Other sessions in the sidebar of the app are not agents of this session.',
  tools: (n: number) => `${int(n)} ${n === 1 ? 'tool' : 'tools'}`,
  requests: (n: number) => `${int(n)} ${n === 1 ? 'request' : 'requests'}`,
  tokens: (n: number) => `${int(n)} tokens`,
  last: 'last: ',
  viewTranscript: 'View transcript',
  backToMain: 'Back to main chat',
  sessions: 'Sessions',
  sessionsHeader: (working: number, total: number) => `${working} working · ${total} open`,
}

export const t = () => (lang === 'en' ? en : de)
