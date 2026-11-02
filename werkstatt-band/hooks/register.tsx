import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Credit, LimitWindow } from '../types'
import { readLimits } from './limits'
import { labelText, money, pct, setLanguage, t, untilText } from './text'

// Die Limits kommen von der App selbst (dieselben Zahlen wie auf ihrer
// Nutzungskarte), nicht über claude.ai: kein Cookie, kein Abruf von außen.
const POLL_MS = 60 * 1000

const limits = atom({ plugin: 'werkstatt-band', key: 'limits' } as const, null, { shape: 'limits-2' })
const isHidden = atom({ plugin: 'werkstatt-band', key: 'isHidden' } as const, false)
const news = atom({ plugin: 'werkstatt-band', key: 'news' } as const, [])

const EMPTY = '#34363d'
const BLUE = '#2f86c9'
const AMBER = '#c98a3a'
const RED = '#c0504d'

// Voreinstellungen für Dennis' Werkstatt; andere setzen ihre Werte beim
// Installieren oder in /config (Manifest, userConfig).
const DEFAULT_REPOS_ROOT = '\\source\\repos\\'
const DEFAULT_NEWS_FILE = '\\dennismit2n.github.io\\js\\news.js'
const DEFAULT_TOOLS = [
  'besucher-ticker=Besucher-Ticker',
  'bigday=bigday',
  'collective-calc=Collective-Calc',
  'craftionary=Craftionary',
  'dreh-das-rad=Dreh das Rad',
  'fadenkreuz=Fadenkreuz',
  'fontart-demo=fontART',
  'heizwarte=Heizwarte',
  'pocketsum=Pocketsum',
  'prismatical=Prismatical',
  'shrinkling=shrinkling',
  'spectroton=Spectroton',
  'wifi-qr=WLAN-QR',
  'zaehlwerk=Zählwerk',
  'zaehlwerk-ticker=Zählwerk Ticker',
]
// Was kein Besucher merkt: Interna, Tests, Doku, Werkzeuge.
const INVISIBLE =
  /(^|\\)(_intern|tests?|\.github|node_modules|tools|docs)(\\|$)|(^|\\)(readme|changelog|license|status|uebergabe)[^\\]*$|\.(test|spec)\./i
const TEXT_FILE = /\.(html?|m?js|tsx?|json|md|txt)$/i

const norm = (path: string) => path.replace(/\//g, '\\').toLowerCase()
const colorFor = (percent: number) => (percent >= 90 ? RED : percent >= 70 ? AMBER : BLUE)

// Einträge „ordner=Anzeigename“ zu einer Tabelle; ohne „=“ heißt das Repo wie der Ordner.
export function parseTools(entries: readonly unknown[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries) {
    if (typeof entry !== 'string') continue
    const [folder = '', ...rest] = entry.split('=')
    const key = folder.trim().toLowerCase()
    if (key === '') continue
    map[key] = rest.join('=').trim() || folder.trim()
  }
  return map
}

// Einstellungen aus dem Manifest (userConfig), gesetzt in register. Ein leerer
// Repo-Ordner schaltet News-Erinnerung und Textprüfer ab, eine leere News-Datei
// nur die Erinnerung.
let reposRoot = norm(DEFAULT_REPOS_ROOT)
let newsFile = norm(DEFAULT_NEWS_FILE)
let tools = parseTools(DEFAULT_TOOLS)
let isTextCheckOn = true

let polling = false

async function poll($: EngineInterface) {
  if (polling) return
  polling = true
  try {
    const fresh = await readLimits($)
    await update($, limits, () => fresh)
  } finally {
    polling = false
  }
}

// Band klein wie die Fußzeile der App (Dennis, 31.10.): Schrift eine Stufe
// unter dem Fließtext, Balken mit fester Breite, die beim Verbreitern des
// Fensters nicht mitwachsen.
const SIZE = 'footnote'
const BAR_WIDTH = 40
const BAR_HEIGHT = 4

function barSvg(percent: number) {
  const width = BAR_WIDTH
  const h = BAR_HEIGHT
  const share = Math.max(0, Math.min(1, percent / 100))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}">` +
    `<rect x="0" y="0" width="${width}" height="${h}" rx="${h / 2}" fill="${EMPTY}"/>` +
    `<rect x="0" y="0" width="${Math.max(h / 2, share * width)}" height="${h}" rx="${h / 2}" fill="${colorFor(percent)}"/></svg>`
  )
}

const textBar = (percent: number) => {
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// Prozent des Guthabens: angegeben, sonst aus Verbrauch und Grenze gerechnet.
function creditPercent(credit: Credit) {
  if (credit.percent !== null) return credit.percent
  return credit.used !== null && credit.limit ? (credit.used / credit.limit) * 100 : null
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  reposRoot = norm(typeof options.reposRoot === 'string' ? options.reposRoot.trim() : DEFAULT_REPOS_ROOT)
  newsFile = norm(typeof options.newsFile === 'string' ? options.newsFile.trim() : DEFAULT_NEWS_FILE)
  tools = parseTools(Array.isArray(options.toolRepos) ? options.toolRepos : DEFAULT_TOOLS)
  isTextCheckOn = options.textCheck !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'limits',
      description: t().commandDescription,
    })
    void poll($)
    $.clock.every(POLL_MS, () => void poll($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    void poll($)

    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    const wasHidden = await read($, isHidden)
    await update($, isHidden, () => !wasHidden)

    return { text: wasHidden ? t().bandShown : t().bandHidden }
  })

  // Textprüfer und News-Erinnerung: nach jedem erfolgreichen Schreiben in die Repos.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    if (ran.deny !== undefined || ran.isError || (tool !== 'Write' && tool !== 'Edit')) return ran
    if (reposRoot === '') return ran

    const input = e as unknown as { file_path?: string; content?: string; new_string?: string }
    const path = norm(input.file_path ?? '')
    // Die News-Datei darf auch außerhalb des Repo-Ordners liegen: erst sie prüfen.
    if (newsFile !== '' && path.endsWith(newsFile)) {
      await update($, news, () => [])
    }
    const at = path.indexOf(reposRoot)
    if (at < 0) return ran

    const rel = path.slice(at + reposRoot.length)
    const [repo = '', ...rest] = rel.split('\\')
    const inside = rest.join('\\')
    const name = tools[repo]
    if (newsFile !== '' && name && !INVISIBLE.test(inside)) {
      await update($, news, list => (list.includes(name) ? list : [...list, name]))
    }

    if (isTextCheckOn && TEXT_FILE.test(path) && !path.includes('\\node_modules\\')) {
      const text = tool === 'Write' ? (input.content ?? '') : (input.new_string ?? '')
      const quotes = (text.match(/\p{L}'\p{L}/gu) ?? []).length
      const dashes = (text.match(/[—–]/g) ?? []).length
      if (quotes + dashes > 0) {
        const parts = [quotes > 0 ? t().apostrophes(quotes) : '', dashes > 0 ? t().dashes(dashes) : ''].filter(Boolean)
        $.ui.toast(t().textCheck(rest.at(-1) ?? repo, parts.join(t().and)))
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Erst die Mods hinter diesem in der Kette und die Engine zeichnen lassen;
    // ihre Zeilen stehen unter dem Band, direkt über dem Eingabefeld. Ohne
    // dieses next blieben sie unsichtbar (02.11.2026: Cache-Meter, Next Steps).
    const rest = await next(e)
    if (e.props.hasSurvey) return rest
    const hidden = await read($, isHidden)
    const pending = await read($, news)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const text = t()
    const data = await read($, limits)
    const now = await $.clock.now()

    const bar = (label: string, percent: number) =>
      Svg ? (
        <Svg source={barSvg(percent)} width={BAR_WIDTH} height={BAR_HEIGHT} alt={`${label}: ${pct(percent)}`} />
      ) : (
        <Text size={SIZE} color={colorFor(percent)}>{textBar(percent)}</Text>
      )

    // Eine Zeile: die Freigabezeit steht nur einmal, wenn mehrere Fenster
    // zur selben Minute frei werden (Woche und Woche Fable).
    const shownResets = new Set<number>()
    const windowView = (w: LimitWindow) => {
      const minute = w.resetsAt === null ? null : Math.round(w.resetsAt / 60000)
      const showReset = minute !== null && !shownResets.has(minute)
      if (minute !== null) shownResets.add(minute)
      const label = labelText(w.label)
      return (
        <Box key={`w-${w.label}`} flexDirection="row" gap={1} alignItems="center" flexShrink={0}>
          <Text size={SIZE} dimColor wrap="truncate-end">{label}</Text>
          {bar(label, w.percent)}
          <Text size={SIZE} tabular weight="semibold" wrap="truncate-end">
            {pct(w.percent)}
          </Text>
          {showReset && w.resetsAt !== null && (
            <Text size={SIZE} dimColor wrap="truncate-end">({untilText(w.resetsAt - now)})</Text>
          )}
        </Box>
      )
    }

    // Ausgeschaltetes Guthaben braucht keinen Platz in der Zeile.
    const credit = data?.credit?.enabled ? data.credit : null
    const creditShare = credit ? creditPercent(credit) : null
    const creditView =
      credit === null ? null : (
        <Box key="credit" flexDirection="row" gap={1} alignItems="center" flexShrink={0}>
          <Text size={SIZE} dimColor>{text.credit}</Text>
          {creditShare !== null && bar(text.credit, creditShare)}
          {creditShare !== null && (
            <Text size={SIZE} tabular weight="semibold">
              {pct(creditShare)}
            </Text>
          )}
          {credit.used !== null && (
            <Text size={SIZE} dimColor>
              · {money(credit.used)}
              {credit.limit !== null ? ` ${text.of} ${money(credit.limit)}` : ''} {credit.currency}
            </Text>
          )}
          {creditShare === null && credit.used === null && <Text size={SIZE}>{text.on}</Text>}
        </Box>
      )

    const hasLimits = data !== null && data.windows.length > 0
    const limitsView = hidden ? null : (
      <Box key="limits" flexDirection="row" flexWrap="nowrap" columnGap={2} alignItems="center" flexShrink={1} overflow="hidden">
        {hasLimits ? data.windows.map(windowView) : <Text size={SIZE} dimColor>{text.noLimitsYet}</Text>}
        {creditView}
        {data?.context != null && (
          <Box key="context" flexDirection="row" gap={1} flexShrink={0}>
            <Text size={SIZE} dimColor>{text.context}</Text>
            <Text size={SIZE} tabular>{pct(data.context)}</Text>
          </Box>
        )}
      </Box>
    )

    // Die drei Knöpfe bleiben auch eingeklappt stehen. „Statistik“ und
    // „Agenten“ schalten die Seitenleisten der Mods statistik und flugdeck:
    // die fangen den Druck über ui.press ab, hier passiert nichts.
    const controls = (
      <Box key="controls" flexDirection="row" gap={2} marginLeft={2} flexShrink={0}>
        <Button key="statistik" plain dimColor onPress={() => undefined}>
          <Text size={SIZE}>{text.statistics}</Text>
        </Button>
        <Button key="agenten" plain dimColor onPress={() => undefined}>
          <Text size={SIZE}>{text.agents}</Text>
        </Button>
        <Button key="toggle-band" plain dimColor onPress={() => void update($, isHidden, value => !value)}>
          <Text size={SIZE}>{hidden ? text.limitsClosed : text.limitsOpen}</Text>
        </Button>
      </Box>
    )

    const limitsRow = (
      <Box key="top" flexDirection="row" justifyContent={hidden ? 'flex-end' : 'space-between'} alignItems="center">
        {limitsView}
        {controls}
      </Box>
    )

    const newsName = newsFile.split('\\').pop() || newsFile
    const newsRow =
      pending.length === 0 ? null : (
        <Box key="news" flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          <Text size={SIZE} color={AMBER}>{text.newsChanged(pending.join(', '))}</Text>
          <Text size={SIZE} dimColor>{text.newsAsk(newsName)}</Text>
          <Button key="news-done" onPress={() => void update($, news, () => [])}>
            <Text size={SIZE}>{text.done}</Text>
          </Button>
        </Box>
      )

    return (
      <Box flexDirection="column">
        {limitsRow}
        {newsRow}
        {rest}
      </Box>
    )
  }).catch(async ($, e, next) => {
    // Scheitert das Zeichnen, bleibt das Band trotzdem stehen und nennt den
    // Grund (Dennis, 31.10.: Band verschwand nach der ersten Antwort, ohne
    // Protokoll). Nur Box, Text und Knöpfe, damit dieser Zweig sicher zeichnet.
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()
    const reason = `${next.error.kind === 'timeout' ? text.timeout : text.error}${next.error.message ? `: ${next.error.message}` : ''}`
    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text size={SIZE} color={AMBER} wrap="truncate-end">
          {text.drawFailed(reason)}
        </Text>
        <Box flexDirection="row" gap={2} marginLeft={2}>
          <Button key="statistik" plain dimColor onPress={() => undefined}>
            <Text size={SIZE}>{text.statistics}</Text>
          </Button>
          <Button key="agenten" plain dimColor onPress={() => undefined}>
            <Text size={SIZE}>{text.agents}</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
