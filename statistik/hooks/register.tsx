import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Credit, LimitWindow, RangeKey, RangeStats, Stats, TabKey, Zaehlwerk } from '../types'
import { readLimits } from './limits'
import { comma, compact, duration, int, labelText, money, pct, setLanguage, t, untilText } from './text'

const PANE = 'statistik'
// Das Zählwerk ist live: jede Minute neu rechnen (mit Zwischenspeicher unter 1 s).
const REFRESH_MS = 60 * 1000
const WEEKS = 26
const BLOCK_MS = 5 * 3600 * 1000

const stats = atom({ plugin: 'statistik', key: 'stats' } as const, null, { shape: 'stats-2' })
const status = atom({ plugin: 'statistik', key: 'status' } as const, '')
const tab = atom({ plugin: 'statistik', key: 'tab' } as const, 'overview')
const range = atom({ plugin: 'statistik', key: 'range' } as const, 'all')
const showStats = atom({ plugin: 'statistik', key: 'showStats' } as const, true)
const showZaehlwerk = atom({ plugin: 'statistik', key: 'showZaehlwerk' } as const, true)
const showLimits = atom({ plugin: 'statistik', key: 'showLimits' } as const, true)
const limits = atom({ plugin: 'statistik', key: 'limits' } as const, null, { shape: 'limits-1' })

const RANGE_KEYS: RangeKey[] = ['all', 'd30', 'd7']
const TAB_KEYS: TabKey[] = ['overview', 'models']

// Gedämpftes Blau wie auf der alten Karte, Leerfelder dunkelgrau.
const EMPTY = '#34363d'
const LEVELS = ['#1d4a73', '#24679f', '#2f86c9', '#59a9e0']
const MODEL_COLORS = ['#2f86c9', '#7a6fd0', '#3aa58a', '#c98a3a', '#b0577f', '#6b7a8f']
// Zählwerk-Farbe der Werkstatt (Oliv-Limette), für das dunkle Thema gedämpft.
const ZAEHLWERK = '#7fae2e'

// Wie im Band: blau, ab 70 % Bernstein, ab 90 % Rot.
const limitColor = (percent: number) => (percent >= 90 ? '#c0504d' : percent >= 70 ? '#c98a3a' : '#2f86c9')
function creditPercent(credit: Credit) {
  if (credit.percent !== null) return credit.percent
  return credit.used !== null && credit.limit ? (credit.used / credit.limit) * 100 : null
}

// Einstellung aus dem Manifest (userConfig), gesetzt in register.
let isAutoOpen = true
let running = false

// Die Limits laufen unabhängig vom Rechenskript: ein Fehler dort stört sie nicht.
async function refreshLimits($: EngineInterface) {
  try {
    const fresh = await readLimits($)
    await update($, limits, () => fresh)
  } catch {
    // Beim nächsten Durchlauf wieder versuchen.
  }
}

async function refresh($: EngineInterface) {
  void refreshLimits($)
  if (running) return
  running = true
  // Alles im try: Scheitert schon das Lesen, bliebe running sonst für immer
  // gesetzt, und kein Durchlauf käme mehr (Durchsicht 31.10.2026).
  try {
    const isFirst = (await read($, stats)) === null
    if (isFirst) await update($, status, () => t().computing)
    const run = await $.process.run(['node', `${$.plugin.root}/scripts/zaehlen.mjs`], {
      timeoutMs: 600_000,
    })
    if (run.exitCode !== 0) throw new Error(run.stderr.trim().split('\n').pop() || `Exit ${run.exitCode}`)
    const fresh = JSON.parse(run.stdout) as Stats
    await update($, stats, () => fresh)
    await update($, status, () => t().asOf(fresh.stand))
  } catch (err) {
    await update($, status, () => t().error(err instanceof Error ? err.message : String(err)))
  } finally {
    running = false
  }
}

// Kalender der letzten WEEKS Wochen, Spalten = Wochen, Zeilen = Mo bis So.
function heatmapSvg(data: Stats) {
  const [y = 1970, m = 1, d = 1] = data.today.split('-').map(Number)
  const today = Date.UTC(y, m - 1, d)
  const DAY = 86_400_000
  const weekday = (new Date(today).getUTCDay() + 6) % 7
  const start = today - (weekday + (WEEKS - 1) * 7) * DAY
  const counts = Object.values(data.perDay).filter(n => n > 0).sort((a, b) => a - b)
  const cut = (q: number) => counts[Math.floor(q * (counts.length - 1))] ?? 0
  const bounds = [cut(0.25), cut(0.5), cut(0.75)]
  const cell = 14
  const gap = 4
  const rects: string[] = []
  for (let w = 0; w < WEEKS; w++) {
    for (let r = 0; r < 7; r++) {
      const at = start + (w * 7 + r) * DAY
      if (at > today) continue
      const iso = new Date(at).toISOString().slice(0, 10)
      const n = data.perDay[iso] ?? 0
      const level = n === 0 ? -1 : bounds.filter(b => n > b).length
      const fill = level < 0 ? EMPTY : LEVELS[level]
      const [yy = '', mm = '', dd = ''] = iso.split('-')
      rects.push(
        `<rect x="${w * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${fill}"><title>${t().dayTitle(yy, mm, dd, n)}</title></rect>`,
      )
    }
  }
  const width = WEEKS * (cell + gap) - gap
  const height = 7 * (cell + gap) - gap
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rects.join('')}</svg>`
}

// Waagerechte Balken mit Name links und Wert rechts, wie auf der alten Karte.
function barsSvg(rows: { name: string; value: number; note: string }[], colors: string[]) {
  const max = Math.max(1, ...rows.map(r => r.value))
  const rowH = 30
  const width = 460
  const parts = rows.map((row, i) => {
    const y = i * rowH
    return (
      `<text x="0" y="${y + 12}" fill="#c9cbd2" font-size="13" font-family="system-ui,sans-serif">${row.name}</text>` +
      `<text x="${width}" y="${y + 12}" fill="#8e919a" font-size="12" text-anchor="end" font-family="system-ui,sans-serif">${row.note}</text>` +
      `<rect x="0" y="${y + 17}" width="${width}" height="6" rx="3" fill="${EMPTY}"/>` +
      `<rect x="0" y="${y + 17}" width="${Math.max(3, (row.value / max) * width)}" height="6" rx="3" fill="${colors[i % colors.length]}"/>`
    )
  })
  const height = Math.max(1, rows.length * rowH)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`
}

function progressSvg(share: number, color: string) {
  const width = 460
  const clamped = Math.max(0, Math.min(1, share))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 8" width="${width}" height="8">` +
    `<rect x="0" y="0" width="${width}" height="8" rx="4" fill="${EMPTY}"/>` +
    `<rect x="0" y="0" width="${Math.max(4, clamped * width)}" height="8" rx="4" fill="${color}"/></svg>`
  )
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  isAutoOpen = options.autoOpen !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'statistik',
      description: t().commandDescription,
    })
    if (isAutoOpen) void $.ui.open({ id: PANE, title: t().title })
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))

    return next(e)
  })

  // Der Knopf „Statistik“ im Band des Mods werkstatt-band klappt die Leiste
  // auf und zu; das Band selbst kennt diese Leiste nicht.
  on('ui.press', { plugin: 'werkstatt-band', element: 'statistik' }, async ($, e) => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
    } else {
      await $.ui.open({ id: PANE, title: t().title })
      void refresh($)
    }

    return { element: e.element }
  })

  on('command.run', { command: 'statistik' }, async $ => {
    await $.ui.open({ id: PANE, title: t().title })
    void refresh($)

    return { text: t().opened }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Das Terminal kennt kein Svg; dort bleibt es bei Text.
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const text = t()
    const data = await read($, stats)
    const line = await read($, status)
    const currentTab = await read($, tab)
    const currentRange = await read($, range)
    const isStatsOpen = await read($, showStats)
    const isZaehlwerkOpen = await read($, showZaehlwerk)

    const sectionButton = (key: string, label: string, isOpen: boolean, toggle: () => void) => (
      <Button key={key} plain onPress={toggle}>
        <Text weight="semibold">
          {isOpen ? '▾' : '▸'} {label}
        </Text>
      </Button>
    )

    const footer = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor size="caption">
          {line || text.noNumbers}
        </Text>
        <Button key="refresh" label="↻" onPress={() => void refresh($)} />
      </Box>
    )

    if (!data) {
      return (
        <Box flexDirection="column" gap={1}>
          {footer}
        </Box>
      )
    }

    const r: RangeStats = data.ranges[currentRange]
    // Kacheln klein (Dennis, 31.10.): Name in Bildunterschrift-Größe, Wert in
    // Fußnoten-Größe, ohne Rahmen; drei pro Reihe statt zwei.
    const tile = (label: string, value: string) => (
      <Box flexDirection="column" width="31%">
        <Text dimColor size="caption">
          {label}
        </Text>
        <Text weight="semibold" size="footnote" tabular>
          {value}
        </Text>
      </Box>
    )

    const controls = (
      <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box flexDirection="row" gap={1}>
          {TAB_KEYS.map(key => (
            <Button
              key={`tab-${key}`}
              label={text.tabs[key]}
              variant={key === currentTab ? 'primary' : 'secondary'}
              onPress={() => void update($, tab, () => key)}
            />
          ))}
        </Box>
        <Box flexDirection="row" gap={1}>
          {RANGE_KEYS.map(key => (
            <Button
              key={`range-${key}`}
              label={text.ranges[key]}
              variant={key === currentRange ? 'primary' : 'secondary'}
              onPress={() => void update($, range, () => key)}
            />
          ))}
        </Box>
      </Box>
    )

    const overview = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {tile(text.tiles.sessions, int(r.sessions))}
          {tile(text.tiles.messages, int(r.messages))}
          {tile(text.tiles.tokens, compact(r.tokens))}
          {tile(text.tiles.activeDays, int(r.activeDays))}
          {tile(text.tiles.peakHour, r.peakHour === null ? '–' : text.hour(r.peakHour))}
          {tile(text.tiles.model, r.favorite ?? '–')}
        </Box>
        {Svg ? <Svg source={heatmapSvg(data)} alt={text.calendarAlt(WEEKS)} isInteractive /> : null}
        {r.lotr > 0 && <Text dimColor>{text.lotr(r.lotr)}</Text>}
      </Box>
    )

    const models = (
      <Box flexDirection="column" gap={1}>
        {Svg && r.models.length > 0 ? (
          <Svg
            source={barsSvg(
              r.models.map(model => ({
                name: model.name,
                value: model.tokens,
                note: `${compact(model.tokens)} · ${pct((model.tokens / (r.tokens || 1)) * 100)}`,
              })),
              MODEL_COLORS,
            )}
            alt={text.tokensPerModel}
          />
        ) : (
          r.models.map(model => (
            <Text key={`model-${model.name}`}>
              {model.name} <Text dimColor>{compact(model.tokens)}</Text>
            </Text>
          ))
        )}
        {r.models.length === 0 && <Text dimColor>{text.noModels}</Text>}
      </Box>
    )

    const z: Zaehlwerk = data.zaehlwerk
    const left = z.blockBis === null ? 0 : z.blockBis - Date.now()
    const isRunning = left > 0
    const zaehlwerk = (
      <Box flexDirection="column" gap={1}>
        {z.blockVonText !== null && (
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor={!isRunning}>{text.blockSince(z.blockVonText)}</Text>
              <Text weight="semibold" tabular>
                {int(z.block.echt)}
              </Text>
            </Box>
            {Svg ? (
              <Svg
                source={progressSvg(isRunning ? 1 - left / BLOCK_MS : 1, isRunning ? ZAEHLWERK : EMPTY)}
                alt={text.blockAlt}
              />
            ) : null}
            <Text dimColor size="footnote">
              {isRunning ? text.endsIn(duration(left)) : text.expired} · {text.fromCache(compact(z.block.cache))}
            </Text>
          </Box>
        )}
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>{text.today}</Text>
            <Text weight="semibold" tabular>
              {int(z.heute.echt)}
            </Text>
          </Box>
          <Text dimColor size="footnote">
            {text.replies(z.heute.anzahl)} · {text.fromCache(compact(z.heute.cache))}
          </Text>
        </Box>
        {Svg && z.modelle.length > 0 ? (
          <Svg
            source={barsSvg(
              z.modelle.slice(0, 3).map(model => ({ name: model.name, value: model.echt, note: int(model.echt) })),
              [ZAEHLWERK],
            )}
            alt={text.blockModelsAlt}
          />
        ) : (
          z.modelle.slice(0, 3).map(model => (
            <Text key={`block-${model.name}`}>
              {model.name} <Text dimColor>{int(model.echt)}</Text>
            </Text>
          ))
        )}
      </Box>
    )

    const lim = await read($, limits)
    const isLimitsOpen = await read($, showLimits)
    const limitRow = (key: string, label: string, percent: number | null, value: string, note: string | null) => (
      <Box key={key} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text>{label}</Text>
          <Text weight="semibold" tabular>
            {value}
          </Text>
        </Box>
        {Svg && percent !== null ? (
          <Svg source={progressSvg(percent / 100, limitColor(percent))} alt={`${label}: ${value}`} />
        ) : null}
        {note !== null && (
          <Text dimColor size="footnote">
            {note}
          </Text>
        )}
      </Box>
    )
    const credit: Credit | null = lim?.credit ?? null
    const creditShare = credit === null ? null : creditPercent(credit)
    const limitsSection =
      lim === null ? (
        <Text dimColor>{text.readingLimits}</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          {lim.windows.map((w: LimitWindow) =>
            limitRow(
              `limit-${w.label}`,
              labelText(w.label),
              w.percent,
              pct(w.percent),
              w.resetsAt === null ? null : text.resetsIn(untilText(w.resetsAt - Date.now())),
            ),
          )}
          {credit !== null &&
            limitRow(
              'limit-credit',
              text.credit,
              credit.enabled ? creditShare : null,
              !credit.enabled ? text.off : creditShare !== null ? pct(creditShare) : text.on,
              credit.enabled && credit.used !== null
                ? `${money(credit.used)}${credit.limit !== null ? ` ${text.of} ${money(credit.limit)}` : ''} ${credit.currency}`
                : null,
            )}
          {lim.context !== null &&
            limitRow(
              'limit-context',
              text.context,
              lim.context,
              pct(lim.context),
              lim.compactsAt !== null ? text.compactsAt(lim.compactsAt) : null,
            )}
          {lim.source === 'engine' && (
            <Text dimColor size="footnote">
              {text.engineOnly}
            </Text>
          )}
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1}>
        {sectionButton('toggle-stats', text.title, isStatsOpen, () => void update($, showStats, v => !v))}
        {isStatsOpen && controls}
        {isStatsOpen && (currentTab === 'overview' ? overview : models)}
        {sectionButton('toggle-limits', text.limits, isLimitsOpen, () => void update($, showLimits, v => !v))}
        {isLimitsOpen && limitsSection}
        {sectionButton('toggle-zaehlwerk', text.counter, isZaehlwerkOpen, () =>
          void update($, showZaehlwerk, v => !v),
        )}
        {isZaehlwerkOpen && zaehlwerk}
        {footer}
      </Box>
    )
  })
}
