import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'statistik',
  component: 'Pane',
  requestId: 'statistik',
  props: {
    title: 'Statistik',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const range = {
  sessions: 88,
  messages: 154560,
  tokens: 12_145_139_535,
  activeDays: 50,
  peakHour: 1,
  favorite: 'Opus 5.5',
  models: [
    { name: 'Opus 5.5', tokens: 8_000_000_000 },
    { name: 'Sonnet 5.5', tokens: 4_145_139_535 },
  ],
  lotr: 21085,
}

const NOW = Date.now()

const STATS = {
  at: new Date(NOW).toISOString(),
  now: NOW,
  today: '2026-10-31',
  stand: '01:19',
  filesRead: 1,
  filesTotal: 4878,
  ranges: { all: range, d30: { ...range, sessions: 21 }, d7: { ...range, sessions: 15, models: [] } },
  perDay: { '2026-10-30': 900, '2026-10-29': 40, '2026-09-25': 12000 },
  zaehlwerk: {
    block: { echt: 713606, cache: 27_015_777, anzahl: 105 },
    blockVon: NOW - 3600_000,
    blockBis: NOW + 4 * 3600_000,
    blockVonText: '00:41',
    heute: { echt: 814801, cache: 33_547_876, anzahl: 128 },
    modelle: [{ name: 'Opus 5.5', echt: 713606 }],
  },
}

function engine(on: Parameters<TestBody>[1]) {
  on('command.register', () => ({ value: { command: 'statistik' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify(STATS),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('die Seitenleiste zeigt die Zahlen und wechselt Zeitraum und Reiter', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /^88$/ }))?.text).toBe('88')
    expect((await ui.find({ type: 'Text', text: /^154\.560$/ }))?.text).toBe('154.560')
    expect((await ui.find({ type: 'Text', text: /Mrd\./ }))?.text).toBe('12,1 Mrd.')
    expect((await ui.find({ type: 'Text', text: /Herr der Ringe/ }))?.text).toContain('21.085')
    expect((await ui.find({ type: 'Text', text: /Stand/ }))?.text).toBe('Stand 01:19')

    await ui.press({ key: 'range-d7' })
    expect((await ui.find({ type: 'Text', text: /^15$/ }))?.text).toBe('15')

    await ui.press({ key: 'tab-models' })
    expect((await ui.find({ type: 'Text', text: /Keine Modelle/ }))?.text).toBe(
      'Keine Modelle in diesem Zeitraum.',
    )

    await ui.press({ key: 'tab-overview' })
    await ui.press({ key: 'range-all' })
    await ui.unmount()
  }
})

test('das Zählwerk zeigt Block und Heute, beide Teile klappen ein', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Block seit/ }))?.text).toBe('Block seit 00:41 (geschätzt)')
    expect((await ui.find({ type: 'Text', text: /^713\.606$/ }))?.text).toBe('713.606')
    expect((await ui.find({ type: 'Text', text: /^814\.801$/ }))?.text).toBe('814.801')
    expect((await ui.find({ type: 'Text', text: /endet in/ }))?.text).toContain('endet in 4 h')

    await ui.press({ key: 'toggle-stats' })
    expect(await ui.find({ type: 'Text', text: /^Sitzungen$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^814\.801$/ }))?.text).toBe('814.801')

    await ui.press({ key: 'toggle-zaehlwerk' })
    expect(await ui.find({ type: 'Text', text: /Block seit/ })).toBeUndefined()

    await ui.press({ key: 'toggle-stats' })
    await ui.press({ key: 'toggle-zaehlwerk' })
    expect((await ui.find({ type: 'Text', text: /^Sitzungen$/ }))?.text).toBe('Sitzungen')
    await ui.unmount()
  }
})

test('Limits aus der App: alle fünf Anzeigen, der Teil klappt ein', async ($, on) => {
  engine(on)
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', (_, e) =>
    String(e.tool) === 'mcp__ccd_session_mgmt__get_usage'
      ? {
          result: [
            {
              type: 'text',
              text: JSON.stringify({
                plan: {
                  status: 'ok',
                  windows: [
                    { label: '5-hour limit', percentUsed: 12, resetsAt: new Date(NOW + 3 * 3600_000).toISOString() },
                    { label: 'Weekly · all models', percentUsed: 15, resetsAt: new Date(NOW + 46 * 3600_000).toISOString() },
                    { label: 'Weekly · Fable', percentUsed: 0, resetsAt: new Date(NOW + 46 * 3600_000).toISOString() },
                  ],
                  extraUsage: { enabled: false, currency: 'USD' },
                },
                context: { status: 'ok', percentUsed: 50, autoCompactsAtPercent: 97 },
              }),
            },
          ],
        }
      : { result: {} },
  )
  on('clock.now', () => ({ value: NOW }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /^Woche Fable$/ }))?.text).toBe('Woche Fable')
    expect((await ui.find({ type: 'Text', text: /^Nutzungsguthaben$/ }))?.text).toBe('Nutzungsguthaben')
    expect((await ui.find({ type: 'Text', text: /^aus$/ }))?.text).toBe('aus')
    expect((await ui.find({ type: 'Text', text: /^12 %$/ }))?.text).toBe('12 %')
    expect((await ui.find({ type: 'Text', text: /^50 %$/ }))?.text).toBe('50 %')
    expect((await ui.find({ type: 'Text', text: /fasst bei 97 %/ }))?.text).toBe('fasst bei 97 % zusammen')

    await ui.press({ key: 'toggle-limits' })
    expect(await ui.find({ type: 'Text', text: /^Woche Fable$/ })).toBeUndefined()
    await ui.press({ key: 'toggle-limits' })
    await ui.unmount()
  }
})

test('ohne Zahlen steht ein Hinweis da', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /Noch keine Zahlen/ }))?.text).toBe('Noch keine Zahlen.')
  await ui.unmount()
})

test('auf Englisch: Kacheln, Zahlen, Limits und Zählwerk', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', (_, e) =>
    String(e.tool) === 'mcp__ccd_session_mgmt__get_usage'
      ? {
          result: [
            {
              type: 'text',
              text: JSON.stringify({
                plan: {
                  status: 'ok',
                  windows: [
                    { label: '5-hour limit', percentUsed: 12.5, resetsAt: new Date(NOW + 3 * 3600_000).toISOString() },
                    { label: 'Weekly · all models', percentUsed: 15, resetsAt: new Date(NOW + 46 * 3600_000).toISOString() },
                    { label: 'Weekly · Fable', percentUsed: 0, resetsAt: new Date(NOW + 46 * 3600_000).toISOString() },
                  ],
                  extraUsage: { enabled: false, currency: 'USD' },
                },
                context: { status: 'ok', percentUsed: 50, autoCompactsAtPercent: 97 },
              }),
            },
          ],
        }
      : { result: {} },
  )
  on('clock.now', () => ({ value: NOW }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Sessions$/ }))?.text).toBe('Sessions')
  expect((await ui.find({ type: 'Text', text: /^154,560$/ }))?.text).toBe('154,560')
  expect((await ui.find({ type: 'Text', text: /bn$/ }))?.text).toBe('12.1bn')
  expect((await ui.find({ type: 'Text', text: /Lord of the Rings/ }))?.text).toContain('21,085')
  expect((await ui.find({ type: 'Text', text: /As of/ }))?.text).toBe('As of 01:19')
  expect((await ui.find({ type: 'Text', text: /^Week Fable$/ }))?.text).toBe('Week Fable')
  expect((await ui.find({ type: 'Text', text: /^Extra usage$/ }))?.text).toBe('Extra usage')
  expect((await ui.find({ type: 'Text', text: /^12\.5%$/ }))?.text).toBe('12.5%')
  expect((await ui.find({ type: 'Text', text: /compacts at/ }))?.text).toBe('compacts at 97%')
  expect((await ui.find({ type: 'Text', text: /Block since/ }))?.text).toBe('Block since 00:41 (estimated)')
  expect((await ui.find({ type: 'Text', text: /ends in/ }))?.text).toContain('ends in 4 h')
  expect((await ui.find({ type: 'Text', text: /Counter/ }))?.text).toContain('Counter')
  await ui.unmount()
})
