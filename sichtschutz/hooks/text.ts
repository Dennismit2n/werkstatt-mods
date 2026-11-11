// Alle sichtbaren Texte der Mod in Deutsch und Englisch. Die Sprache kommt aus
// der Einstellung „language“ (Manifest, userConfig); register setzt sie.
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export function setLanguage(value: unknown): Lang {
  lang = value === 'en' ? 'en' : 'de'
  return lang
}

export const language = () => lang

const de = {
  commandDescription: 'Schaltet den Sichtschutz fürs Bildschirmteilen an oder aus: Mailadressen, Nummern, Beträge und eigene Wörter werden geschwärzt',
  argumentHint: '[an|aus]',
  turnedOn:
    'Sichtschutz an. Im Verlauf sind Mailadressen, Telefonnummern, Beträge, IBANs, der Name des Nutzerordners und deine eigenen Wörter geschwärzt. Gespeichert und ans Modell gesendet wird weiter das Original. Namen erkennt die Mod nicht von selbst: Trag sie in der Einstellung „Eigene Wörter“ ein.',
  turnedOff: 'Sichtschutz aus. Der Verlauf zeigt wieder alles.',
  status: 'Sichtschutz an',
  band: 'Sichtschutz an: Der Verlauf ist geschwärzt.',
  off: 'Ausschalten',
}

const en: typeof de = {
  commandDescription: 'Turns the screen guard for screen sharing on or off: mail addresses, numbers, amounts and your own words are masked',
  argumentHint: '[on|off]',
  turnedOn:
    'Screen guard on. In the transcript mail addresses, phone numbers, amounts, IBANs, the name of the user folder and your own words are masked. What is stored and sent to the model stays the original. The mod does not recognise names by itself: add them in the setting "Own words".',
  turnedOff: 'Screen guard off. The transcript shows everything again.',
  status: 'Screen guard on',
  band: 'Screen guard on: the transcript is masked.',
  off: 'Turn off',
}

export const t = () => (lang === 'en' ? en : de)
