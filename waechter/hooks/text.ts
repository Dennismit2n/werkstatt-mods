// Alle Meldungen des Wächters in Deutsch und Englisch. Die Sprache kommt aus
// der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

export const int = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.')

const de = {
  commandDescription: 'Schaltet die Agenten-Bremse für diese Sitzung aus oder wieder an',
  brakeOn: (heavyMax: number, alive: number) =>
    `Agenten-Bremse wieder an (höchstens ${heavyMax} ${heavyMax === 1 ? 'schwerer Agent' : 'schwere Agenten'} gleichzeitig). Gerade ${alive === 1 ? 'läuft 1' : `laufen ${alive}`}.`,
  brakeOff: 'Agenten-Bremse für diese Sitzung aus. Mit /agentenbremse wieder einschalten.',
  denyWrite: (file: string) =>
    `Wächter: ${file} ist geschützt, alle Sitzungen teilen diese Datei. Nicht überschreiben, sondern den eigenen Eintrag per Edit anhängen.`,
  denyLong: (length: number, max: number) =>
    `Wächter: Der Befehl hat ${int(length)} Zeichen, erlaubt sind ${int(max)}. Windows kappt ab etwa 8.000 still. Den Inhalt erst mit Write als Datei anlegen und dann ausführen.`,
  denyHarm: (file: string) =>
    `Wächter: Dieser Befehl würde ${file} löschen, verschieben oder überschreiben. Die Datei gehört allen Sitzungen; nur per Edit ergänzen.`,
  denyBrake: (alive: number, heavy: number, heavyMax: number) =>
    `Agenten-Bremse: Es ${alive === 1 ? 'läuft schon 1 Agent' : `laufen schon ${alive} Agenten`}, davon ${heavy === 1 ? '1 schwerer' : `${heavy} schwere`}. Auf diesem PC ${heavyMax === 1 ? 'höchstens 1 schwerer' : `höchstens ${heavyMax} schwere`} gleichzeitig. Warte, bis einer fertig ist, oder arbeite nacheinander. Ausschalten für diese Sitzung: /agentenbremse`,
  denyRace:
    'Agenten-Bremse: Zu viele Starts auf einmal, die Prüfung kam nicht hinterher. Agenten nacheinander starten. Ausschalten für diese Sitzung: /agentenbremse',
  checkFailed: 'Wächter: Prüfung fehlgeschlagen, Aufruf läuft ungeprüft.',
}

const en: typeof de = {
  commandDescription: 'Turns the agent brake off or on again for this session',
  brakeOn: (heavyMax: number, alive: number) =>
    `Agent brake on again (at most ${heavyMax} heavy ${heavyMax === 1 ? 'agent' : 'agents'} at once). Running now: ${alive}.`,
  brakeOff: 'Agent brake off for this session. /agentenbremse turns it on again.',
  denyWrite: (file: string) =>
    `Guard: ${file} is protected, all sessions share this file. Do not overwrite it; append your own entry with Edit.`,
  denyLong: (length: number, max: number) =>
    `Guard: The command has ${int(length)} characters, the limit is ${int(max)}. Windows silently cuts at about 8,000. Write the content to a file first, then run it.`,
  denyHarm: (file: string) =>
    `Guard: This command would delete, move or overwrite ${file}. The file belongs to all sessions; only add to it with Edit.`,
  denyBrake: (alive: number, heavy: number, heavyMax: number) =>
    `Agent brake: ${alive === 1 ? '1 agent is' : `${alive} agents are`} already running, ${heavy} of them heavy. On this PC at most ${heavyMax} heavy ${heavyMax === 1 ? 'one' : 'ones'} at once. Wait for one to finish, or work one after another. Turn off for this session: /agentenbremse`,
  denyRace:
    'Agent brake: Too many starts at once, the check could not keep up. Start agents one after another. Turn off for this session: /agentenbremse',
  checkFailed: 'Guard: check failed, the call runs unchecked.',
}

export const t = () => (lang === 'en' ? en : de)
