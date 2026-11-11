// Alle sichtbaren Texte der Mod in Deutsch und Englisch, dazu der Auftrag an
// Claude. Die Sprache kommt aus der Einstellung „language“ (Manifest,
// userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

// 262.000 / 262,000: Tausender je Sprache.
export const int = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.')

// Die letzte Zeile der Antwort nennt den Pfad; an diesem Wort erkennt die Mod sie.
export const MARKER = { de: 'ÜBERGABE:', en: 'HANDOFF:' } as const

const de = {
  commandDescription: 'Lässt Claude eine ausführliche Übergabe schreiben, mit der eine frische Sitzung weiterarbeitet',
  started: 'Übergabe angefordert. Claude schreibt sie jetzt; danach steht im Band der Knopf für die neue Sitzung.',
  busy: 'Die Übergabe wird schon geschrieben.',
  hint: (tokens: string) => `Kontext bei ${tokens} Token: Zeit für eine Übergabe an eine frische Sitzung?`,
  write: 'Übergabe schreiben',
  later: 'Später',
  writing: 'Übergabe wird geschrieben …',
  ready: (file: string) => `Übergabe liegt bereit: ${file}`,
  startNew: 'Neue Sitzung starten',
  copyPath: 'Pfad kopieren',
  copied: 'Pfad der Übergabe kopiert.',
  notCopied: (file: string) => `Kopieren ging nicht. Pfad: ${file}`,
  dismiss: 'Schließen',
  noMarker: `Die Antwort nannte keinen Pfad in der Zeile „${MARKER.de} …“. /uebergabe versucht es noch einmal.`,
  failed: (why: string) => `Übergabe ließ sich nicht anfordern: ${why}`,
  // Der Auftrag an Claude. where ist der Ablageort als Satzteil.
  instruction: (where: string) =>
    [
      'Schreibe jetzt eine Übergabe für eine frische Sitzung, die ohne diesen Verlauf weiterarbeiten muss. Geh dafür den ganzen Verlauf dieser Sitzung durch, nicht nur das Ende.',
      'Die Übergabe hält fest:',
      '1. Ziel und Anlass: worum es geht und warum, in zwei bis vier Sätzen.',
      '2. Stand: was fertig und geprüft ist, was nur angefangen ist, was noch niemand gesehen hat.',
      '3. Entscheidungen mit ihrer Begründung, auch verworfene Wege.',
      '4. Jede Datei, die gelesen, angelegt oder geändert wurde, mit vollem Pfad und einem Satz dazu.',
      '5. Benutzte Skills, Werkzeuge, Konnektoren und Links.',
      '6. Offene Punkte und die nächsten Schritte in der Reihenfolge, in der sie anstehen.',
      '7. Fallen: was nicht funktioniert hat und woran man es erkennt.',
      '8. Regeln und Vorlieben des Nutzers, die in dieser Sitzung galten.',
      `Schreibe sie als Markdown-Datei ${where}. Verweise auf Dateien, statt ihren Inhalt zu wiederholen, und lass nichts weg, was die neue Sitzung braucht.`,
      `Nenne in der letzten Zeile deiner Antwort nur den Pfad, genau so: ${MARKER.de} <voller Pfad der Datei>`,
    ].join('\n'),
  whereFolder: (folder: string) => `im Ordner ${folder}`,
  whereDefault:
    'dort, wo Übergaben nach den Regeln und Notizen dieses Nutzers liegen; gibt es keine, im Arbeitsordner unter uebergaben',
  startNewPrompt: (file: string) =>
    `Starte eine neue Sitzung, die mit dieser Übergabe weiterarbeitet: ${file}\nGib ihr als Auftrag, zuerst die Übergabe ganz zu lesen und dann beim nächsten offenen Schritt weiterzumachen.`,
}

const en: typeof de = {
  commandDescription: 'Has Claude write a detailed handoff a fresh session continues from',
  started: 'Handoff requested. Claude writes it now; afterwards the band shows the button for the new session.',
  busy: 'The handoff is already being written.',
  hint: (tokens: string) => `Context at ${tokens} tokens: time for a handoff to a fresh session?`,
  write: 'Write handoff',
  later: 'Later',
  writing: 'Writing the handoff …',
  ready: (file: string) => `Handoff is ready: ${file}`,
  startNew: 'Start new session',
  copyPath: 'Copy path',
  copied: 'Handoff path copied.',
  notCopied: (file: string) => `Could not copy. Path: ${file}`,
  dismiss: 'Close',
  noMarker: `The reply named no path in the line "${MARKER.en} …". /uebergabe tries again.`,
  failed: (why: string) => `Could not request the handoff: ${why}`,
  instruction: (where: string) =>
    [
      'Write a handoff now for a fresh session that has to continue without this transcript. Go through the whole of this session for it, not just its end.',
      'The handoff records:',
      '1. Goal and reason: what this is about and why, in two to four sentences.',
      '2. State: what is done and verified, what is only started, what nobody has seen yet.',
      '3. Decisions with their reasons, rejected paths included.',
      '4. Every file read, created or changed, with its full path and one sentence about it.',
      '5. Skills, tools, connectors and links used.',
      '6. Open points and the next steps in the order they are due.',
      '7. Pitfalls: what did not work and how to recognise it.',
      '8. Rules and preferences of the user that applied in this session.',
      `Write it as a Markdown file ${where}. Point to files instead of repeating their content, and leave out nothing the new session needs.`,
      `In the last line of your reply name only the path, exactly like this: ${MARKER.en} <full path of the file>`,
    ].join('\n'),
  whereFolder: (folder: string) => `in the folder ${folder}`,
  whereDefault:
    "where this user's own rules and notes keep handoffs; if there are none, in the working folder under uebergaben",
  startNewPrompt: (file: string) =>
    `Start a new session that continues from this handoff: ${file}\nGive it the task to read the handoff in full first and then continue with the next open step.`,
}

export const t = () => (lang === 'en' ? en : de)
