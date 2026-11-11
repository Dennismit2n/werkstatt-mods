// Alle sichtbaren Texte der Leiste in Deutsch und Englisch. Die Sprache kommt
// aus der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

const de = {
  title: 'In diesem Chat',
  commandDescription: 'Zeigt, was diese Sitzung benutzt hat: Aufgaben, Konnektoren, Skills, Links und Dateien',
  opened: 'Leiste „In diesem Chat“ geöffnet.',
  closed: 'Leiste „In diesem Chat“ geschlossen.',
  empty: 'Noch nichts benutzt. Sobald Claude ein Werkzeug aufruft, steht es hier.',
  todos: 'Aufgaben',
  todoCount: (done: number, total: number) => `${done} von ${total} erledigt`,
  connectors: 'Konnektoren',
  skills: 'Skills',
  links: 'Links',
  read: 'Gelesene Dateien',
  written: 'Geschriebene Dateien',
  more: (n: number) => `und ${n} weitere`,
  clear: 'Leeren',
  browser: 'Browser der App',
  chrome: 'Chrome',
  computer: 'Bildschirm',
  connector: (id: string) => `Konnektor ${id}`,
}

const en: typeof de = {
  title: 'In this chat',
  commandDescription: 'Shows what this session has used: tasks, connectors, skills, links and files',
  opened: 'Pane "In this chat" opened.',
  closed: 'Pane "In this chat" closed.',
  empty: 'Nothing used yet. As soon as Claude calls a tool, it shows up here.',
  todos: 'Tasks',
  todoCount: (done: number, total: number) => `${done} of ${total} done`,
  connectors: 'Connectors',
  skills: 'Skills',
  links: 'Links',
  read: 'Files read',
  written: 'Files written',
  more: (n: number) => `and ${n} more`,
  clear: 'Clear',
  browser: 'App browser',
  chrome: 'Chrome',
  computer: 'Screen',
  connector: (id: string) => `Connector ${id}`,
}

export const t = () => (lang === 'en' ? en : de)
