// Alle sichtbaren Texte der Registerkarten in Deutsch und Englisch. Die Sprache
// kommt aus der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

const de = {
  commandDescription:
    'Farbige Reiter in der Seitenleiste: zeigt die Legende; „färben“ setzt allen neuen Abschnitten ihren Punkt, „🟠 Name“ färbt einen von Hand',
  argumentHint: '[färben | 🔵 Abschnitt]',
  legend: 'Legende',
  colored: (n: number) => `${n} ${n === 1 ? 'Abschnitt hat' : 'Abschnitte haben'} schon einen Reiter.`,
  toColor: (list: string) => `Bekommen beim Färben ihren Punkt: ${list}.`,
  open: (list: string) => `Ohne passende Regel, bitte von Hand färben: ${list}.`,
  allDone: 'Alle eigenen Abschnitte haben einen Reiter.',
  howTo: 'Von Hand: /registerkarten 🟠 Teil des Namens. Regeln ändern: Einstellung „rules“.',
  done: (n: number) => (n === 1 ? '1 Abschnitt eingefärbt.' : `${n} Abschnitte eingefärbt.`),
  failed: (names: string) =>
    `Nicht umbenannt: ${names}. Ohne Rückfrage darf eine Mod nur umbenennen, wenn mcp__ccd_sidebar__rename_section in ~/.claude/settings.json unter permissions.allow steht.`,
  listDenied:
    'Die Seitenleiste darf nicht gelesen werden: mcp__ccd_sidebar__list_sections in ~/.claude/settings.json unter permissions.allow eintragen.',
  nothing: 'Nichts zu färben: Jeder eigene Abschnitt hat schon einen Reiter oder keine passende Regel.',
  hint: (n: number) =>
    `${n === 1 ? '1 neuer Abschnitt hat' : `${n} neue Abschnitte haben`} noch keinen Reiter. Zum Färben braucht die Mod die Freigabe für mcp__ccd_sidebar__rename_section (README).`,
  noSidebar: 'Die Seitenleiste ist hier nicht erreichbar (nur in der Desktop-App, Code-Tab, mit offenem Fenster).',
  noMatch: (part: string) => `Kein eigener Abschnitt enthält „${part}“.`,
  ambiguous: (list: string) => `Mehrere Abschnitte passen: ${list}. Bitte genauer.`,
  renamed: (to: string) => `Umbenannt in „${to}“.`,
  badDot: (dots: string) => `Bitte einen dieser Punkte vorn: ${dots}.`,
  noRules: 'Keine gültige Regel in der Einstellung „rules“, es gelten die Standardregeln.',
  consent: (args: string) => `Ich habe /registerkarten ${args} eingegeben, um Abschnitte der Seitenleiste umzubenennen.`,
}

const en: typeof de = {
  commandDescription:
    'Colored tabs in the sidebar: shows the legend; "color" gives every new section its dot, "🟠 name" colors one by hand',
  argumentHint: '[color | 🔵 section]',
  legend: 'Legend',
  colored: (n: number) => `${n} ${n === 1 ? 'section already has' : 'sections already have'} a tab.`,
  toColor: (list: string) => `Get their dot when coloring: ${list}.`,
  open: (list: string) => `No matching rule, please color by hand: ${list}.`,
  allDone: 'Every section of your own has a tab.',
  howTo: 'By hand: /registerkarten 🟠 part of the name. Change the rules: setting "rules".',
  done: (n: number) => (n === 1 ? '1 section colored.' : `${n} sections colored.`),
  failed: (names: string) =>
    `Not renamed: ${names}. A mod may only rename without asking when mcp__ccd_sidebar__rename_section is under permissions.allow in ~/.claude/settings.json.`,
  listDenied:
    'The sidebar may not be read: add mcp__ccd_sidebar__list_sections under permissions.allow in ~/.claude/settings.json.',
  nothing: 'Nothing to color: every section of your own already has a tab or no matching rule.',
  hint: (n: number) =>
    `${n === 1 ? '1 new section has' : `${n} new sections have`} no tab yet. To color them the mod needs mcp__ccd_sidebar__rename_section allowed (README).`,
  noSidebar: 'The sidebar cannot be reached here (desktop app only, Code tab, with a window open).',
  noMatch: (part: string) => `No section of your own contains "${part}".`,
  ambiguous: (list: string) => `Several sections match: ${list}. Please be more precise.`,
  renamed: (to: string) => `Renamed to "${to}".`,
  badDot: (dots: string) => `Please start with one of these dots: ${dots}.`,
  noRules: 'No valid rule in the setting "rules", the default rules apply.',
  consent: (args: string) => `I typed /registerkarten ${args} to rename sections of the sidebar.`,
}

export const t = () => (lang === 'en' ? en : de)
