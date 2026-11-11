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
  title: 'Mods',
  commandDescription: 'Zeigt alle Mods mit Version und Befehlen und schaltet sie für die nächste Sitzung aus oder ein',
  opened: 'Schalttafel geöffnet.',
  closed: 'Schalttafel geschlossen.',
  reading: 'Mods werden gelesen …',
  summary: (running: number, total: number) => `${running} von ${total} laufen in dieser Sitzung`,
  others: 'Weitere Plugins',
  active: 'aktiv',
  activeThenOff: 'aktiv, ab der nächsten Sitzung aus',
  off: 'aus',
  offThenOn: 'aus, ab der nächsten Sitzung an',
  turnOff: 'Ausschalten',
  turnOn: 'Einschalten',
  self: 'diese Leiste',
  commands: (list: string) => `Befehle: ${list}`,
  hint: 'Ein Schalter gilt ab der nächsten Sitzung; laufende Sitzungen behalten ihre Mods.',
  refresh: 'Neu lesen',
  nowOff: (name: string) => `${name} ist ab der nächsten Sitzung aus.`,
  nowOn: (name: string) => `${name} ist ab der nächsten Sitzung wieder an.`,
  noSettings: 'Die Einstellungsdatei von Claude Code wurde nicht gefunden.',
  writeFailed: (why: string) => `Schalten ging nicht, die Einstellungen bleiben unverändert: ${why}`,
  unreadable: 'Die Einstellungsdatei ließ sich nicht sicher ändern (kein gültiges JSON oder unerwarteter Aufbau).',
  noMods: 'Keine Mods aus Ordnern gefunden (CLAUDE_CODE_PLUGIN_DIRS ist leer).',
}

const en: typeof de = {
  title: 'Mods',
  commandDescription: 'Shows every mod with version and commands and turns it off or on for the next session',
  opened: 'Switchboard opened.',
  closed: 'Switchboard closed.',
  reading: 'Reading mods …',
  summary: (running: number, total: number) => `${running} of ${total} run in this session`,
  others: 'Other plugins',
  active: 'active',
  activeThenOff: 'active, off from the next session',
  off: 'off',
  offThenOn: 'off, on from the next session',
  turnOff: 'Turn off',
  turnOn: 'Turn on',
  self: 'this pane',
  commands: (list: string) => `Commands: ${list}`,
  hint: 'A switch applies from the next session; running sessions keep their mods.',
  refresh: 'Read again',
  nowOff: (name: string) => `${name} is off from the next session.`,
  nowOn: (name: string) => `${name} is on again from the next session.`,
  noSettings: 'The Claude Code settings file was not found.',
  writeFailed: (why: string) => `Switching failed, the settings stay unchanged: ${why}`,
  unreadable: 'The settings file could not be changed safely (not valid JSON or an unexpected layout).',
  noMods: 'No mods from folders found (CLAUDE_CODE_PLUGIN_DIRS is empty).',
}

export const t = () => (lang === 'en' ? en : de)
