import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { setLanguage, t } from './text'

// Sichtschutz fürs Bildschirmteilen: Solange er an ist, zeichnet die Mod die
// Zeilen des Verlaufs mit geschwärzten Stellen. Sie ändert nur die Zeichnung;
// gespeichert und ans Modell gesendet wird weiter das Original. Kein
// Modellaufruf, nur Muster: Was kein Muster trifft (ein Name im Fließtext),
// bleibt lesbar, bis es in der Einstellung „Eigene Wörter“ steht.
const isOnState = atom({ plugin: 'sichtschutz', key: 'isOn' } as const, null)

const AMBER = '#c98a3a'
const SIZE = 'footnote'
const BAR = '█'

// Einstellungen aus dem Manifest (userConfig), gesetzt in register.
let words: string[] = []
let isMoneyMasked = true
let isOnAtStart = false

const bar = (found: string) => BAR.repeat(Math.min(12, Math.max(4, found.length)))
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// IBAN: zwei Buchstaben, zwei Prüfziffern, dann Vierergruppen mit oder ohne Leerzeichen.
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[\dA-Z]{4}){3,7}(?:\s?[\dA-Z]{1,3})?\b/g
// Telefon: beginnt mit +49, 0049 oder einer Vorwahl mit 0, dann Zifferngruppen
// mit Leerzeichen, Schrägstrich oder Bindestrich. Daten (2026-11-11) und
// Zahlen mit Punkt oder Komma (12.345.678) fallen nicht darunter.
const PHONE = /(?<![\w.,:])(?:\+\d{1,3}|00\d{1,3}|0\d{2,4})(?:[\s/-]?\(?\d\)?){6,12}(?!\w|[.,]\d)/g
// Beträge: Währungszeichen vor oder hinter der Zahl, oder das Kürzel dahinter.
const MONEY = /[€$£]\s?\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s?(?:[€$£]|(?:EUR|USD|GBP|CHF|Euro|Dollar)\b)/g
// Der Name des Nutzerordners: Der Anfang des Pfads bleibt, der Name wird geschwärzt.
const USER_DIR = /([A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)([^\\/\s"'`<>|:*?]+)/g

// Ein Text mit geschwärzten Stellen. extra sind die eigenen Wörter des Nutzers.
export function mask(text: string, extra: readonly string[] = words, money = isMoneyMasked): string {
  let out = text.replace(EMAIL, bar).replace(USER_DIR, (_, lead: string, name: string) => lead + bar(name))
  out = out.replace(IBAN, bar).replace(PHONE, bar)
  if (money) out = out.replace(MONEY, bar)
  for (const word of extra) {
    const clean = word.trim()
    if (clean.length < 2) continue
    out = out.replace(new RegExp(escapeRe(clean), 'gi'), bar)
  }
  return out
}

// Eingaben und Ergebnisse von Werkzeugen sind beliebige Daten: jede
// Zeichenkette darin schwärzen, die Form bleibt. Ab einer Tiefe von 6 bleibt
// der Rest, wie er ist.
export function maskDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return mask(value)
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(one => maskDeep(one, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, one] of Object.entries(value)) out[key] = maskDeep(one, depth + 1)
  return out
}

async function isOn($: EngineInterface) {
  const value = await read($, isOnState)
  return value === null ? isOnAtStart : value
}

async function setOn($: EngineInterface, value: boolean) {
  await update($, isOnState, () => value)
  $.ui.status(value ? t().status : undefined)
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  words = Array.isArray(options.words) ? options.words.map(String) : []
  isMoneyMasked = options.maskMoney !== false
  isOnAtStart = options.startOn === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sichtschutz',
      description: t().commandDescription,
      argumentHint: t().argumentHint,
      immediate: true,
    })
    if (await isOn($)) $.ui.status(t().status)

    return next(e)
  })

  // Ohne Wort schaltet der Befehl um; „an“/„on“ und „aus“/„off“ gelten in beiden Sprachen.
  on('command.run', { command: 'sichtschutz' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    const wanted = word === 'an' || word === 'on' ? true : word === 'aus' || word === 'off' ? false : !(await isOn($))
    await setOn($, wanted)

    return { text: wanted ? t().turnedOn : t().turnedOff }
  })

  // Die Zeilen des Verlaufs: nur die Zeichnung ändert sich. Eine Umschreibung,
  // die die Zeile nicht annimmt, zeichnet die Engine als Original; deshalb
  // fängt .catch jeden Fehler ab und zeichnet lieber gar nichts Eigenes.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    return next({ ...e, props: { ...e.props, text: mask(e.props.text) } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    return next({ ...e, props: { ...e.props, text: mask(e.props.text) } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    return next({ ...e, props: { ...e.props, args: mask(e.props.args), text: mask(e.props.text) } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    const props = { ...e.props, input: maskDeep(e.props.input) }
    return next({ ...e, props: e.props.output === undefined ? props : { ...props, output: maskDeep(e.props.output) } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    return next({ ...e, props: { ...e.props, output: maskDeep(e.props.output) } })
  }).catch(($, e, next) => next(e))

  // Ein Hinweis im Band, solange der Sichtschutz an ist, mit dem Knopf zum Ausschalten.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey || !(await isOn($))) return rest
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()
    return (
      <Box flexDirection="column">
        <Box key="sichtschutz" flexDirection="row" gap={2} alignItems="center">
          <Text size={SIZE} color={AMBER}>
            {text.band}
          </Text>
          <Button key="sichtschutz-off" plain dimColor onPress={() => void setOn($, false)}>
            <Text size={SIZE}>{text.off}</Text>
          </Button>
        </Box>
        {rest}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
