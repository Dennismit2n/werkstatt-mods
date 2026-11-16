import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DEFAULT_RULES, findSection, isMarked, leadingDot, parseRules, pick, plan, stripDot, withDot } from '../hooks/farben'
import { parseSections } from '../hooks/register'

const RULES = parseRules(DEFAULT_RULES)

const SECTIONS = [
  { id: 'pinned', kind: 'pinned', name: '' },
  { id: 'a', kind: 'manual', name: '🔵 Startseite-LandingPage' },
  { id: 'b', kind: 'manual', name: 'Streckenblitz Rennspiel' },
  { id: 'c', kind: 'manual', name: 'MOD-Ideen' },
  { id: 'd', kind: 'manual', name: '3D Sonnensystem' },
  { id: 'sessions', kind: 'sessions', name: '' },
]

// Unter der Mod steht hier die App: die Seitenleiste als Liste und die Freigaben.
function engine(on: On, allowed: { list: boolean; rename: boolean; listDenied?: boolean }, sections = SECTIONS) {
  const seen = { renames: [] as { id: string; name: string; consent?: string }[], toasts: [] as string[], registered: false }
  const rows = sections.map(one => ({ ...one }))
  on('tool.check', (_, e) => {
    const tool = (e as { tool: string }).tool
    const ok = tool.endsWith('list_sections') ? allowed.list : allowed.rename
    return { decision: ok ? 'allow' : 'ask' } as never
  })
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; section_id?: string; name?: string; consent?: string }
    if (call.tool.endsWith('list_sections') && allowed.listDenied) return { deny: { reason: 'nicht freigegeben' } } as never
    if (call.tool.endsWith('list_sections')) return { result: [{ type: 'text', text: JSON.stringify(rows) }] } as never
    seen.renames.push({ id: call.section_id ?? '', name: call.name ?? '', consent: call.consent })
    const row = rows.find(one => one.id === call.section_id)
    if (row) row.name = call.name ?? row.name
    return { result: [{ type: 'text', text: 'ok' }] } as never
  })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined } as never
  })
  on('command.register', () => {
    seen.registered = true
    return { value: { command: 'registerkarten' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return seen
}

type Engine = Parameters<TestBody>[0]

const run = async ($: Engine, args: string) =>
  ((await $.command.run({ command: 'registerkarten', args } as never)) as { text: string }).text

test('Regeln, Punkte und Namen: reine Rechnung', () => {
  expect(RULES.map(rule => rule.dot)).toEqual(['🟣', '🟢', '🟠', '🔴', '🔵'])
  expect(parseRules('🟠 spiel, game; ohne Punkt; 🔵 ')).toEqual([{ dot: '🟠', words: ['spiel', 'game'] }])

  expect(leadingDot('🔵 Startseite')).toBe('🔵')
  expect(leadingDot('Startseite')).toBe(null)
  expect(stripDot('🔵 Startseite')).toBe('Startseite')
  expect(withDot('🔵 Startseite', '🟠')).toBe('🟠 Startseite')

  // Die erste passende Regel gewinnt: „Skill/create-masterprompt“ ist lila, nicht blau.
  expect(pick('SKILL/create-masterprompt', RULES)).toBe('🟣')
  expect(pick('Schach', RULES)).toBe('🟠')
  expect(pick('Wetter/Heiz-App', RULES)).toBe('🔵')
  expect(pick('Fadenkreuz', RULES)).toBe(null)

  const { renames, open, colored } = plan(SECTIONS, RULES)
  expect(renames).toEqual([
    { id: 'b', from: 'Streckenblitz Rennspiel', to: '🟠 Streckenblitz Rennspiel' },
    { id: 'c', from: 'MOD-Ideen', to: '🟣 MOD-Ideen' },
  ])
  expect(open).toEqual(['3D Sonnensystem'])
  expect(colored.length).toBe(1)

  // Stichwort nur am Wortanfang oder -ende: kein Spiel in „Beispiele“, keine App in „Mappe“.
  expect(pick('Beispiele sammeln', RULES)).toBe(null)
  expect(pick('Mappe', RULES)).toBe(null)
  expect(pick('Spieleabend', RULES)).toBe('🟠')
  // Variantenwähler nach ⚫ bleibt nicht am Namen kleben.
  expect(stripDot('⚫️ Foo')).toBe('Foo')
  expect(parseRules('⚪️ foo, bar')).toEqual([{ dot: '⚪', words: ['foo', 'bar'] }])
  // Ein eigenes Emoji vorn gilt als gekennzeichnet und wird nicht doppelt gefärbt.
  expect(isMarked('🎮 Spiele')).toBe(true)
  expect(plan([{ id: 'x', kind: 'manual', name: '🎮 Spiele' }], RULES).renames).toEqual([])

  expect(findSection(SECTIONS, 'sonnen').map(one => one.id)).toEqual(['d'])
  expect(findSection(SECTIONS, '').length).toBe(0)
})

test('die Liste der App wird gelesen, kaputte Antworten ergeben null', () => {
  expect(parseSections(JSON.stringify(SECTIONS))?.length).toBe(6)
  expect(parseSections('kein json')).toBe(null)
  expect(parseSections('{"a":1}')).toBe(null)
})

test('beim Start färbt die Mod neue Abschnitte von selbst, wenn sie darf', async ($, on) => {
  const seen = engine(on, { list: true, rename: true })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(seen.registered).toBe(true)
  expect(seen.renames.map(one => one.name)).toEqual(['🟠 Streckenblitz Rennspiel', '🟣 MOD-Ideen'])
  // Von selbst ohne Zustimmungstext: Das ist kein Befehl des Menschen.
  expect(seen.renames.every(one => one.consent === undefined)).toBe(true)
  expect(seen.toasts).toEqual(['2 Abschnitte eingefärbt.'])
})

test('ohne Freigabe zum Umbenennen nur ein Hinweis, kein Dialog', async ($, on) => {
  const seen = engine(on, { list: true, rename: false })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(seen.renames.length).toBe(0)
  expect(seen.toasts).toEqual(['2 neue Abschnitte haben noch keinen Reiter. Zum Färben braucht die Mod die Freigabe für mcp__ccd_sidebar__rename_section (README).'])
})

test('/registerkarten färben benennt um und sagt, was geschah', async ($, on) => {
  // Freigegeben: Eine Mod öffnet nie einen Dialog, ohne Freigabe käme { deny } zurück.
  const seen = engine(on, { list: true, rename: true })

  const text = await run($, 'färben')

  expect(text).toBe('2 Abschnitte eingefärbt.')
  expect(seen.renames.length).toBe(2)
  expect(seen.renames[0]?.consent).toContain('/registerkarten färben')
})

test('/registerkarten zeigt Legende, offene und fertige Abschnitte', async ($, on) => {
  engine(on, { list: true, rename: true })

  const text = await run($, '')

  expect(text).toContain('Legende: 🟣 claude')
  expect(text).toContain('1 Abschnitt hat schon einen Reiter.')
  expect(text).toContain('Bekommen beim Färben ihren Punkt: 🟠 Streckenblitz Rennspiel, 🟣 MOD-Ideen.')
  expect(text).toContain('Ohne passende Regel, bitte von Hand färben: 3D Sonnensystem.')
})

test('/registerkarten 🔵 sonnen färbt genau diesen einen Abschnitt', async ($, on) => {
  const seen = engine(on, { list: true, rename: true })

  expect(await run($, '🔵 sonnen')).toBe('Umbenannt in „🔵 3D Sonnensystem“.')
  expect(seen.renames).toEqual([
    { id: 'd', name: '🔵 3D Sonnensystem', consent: 'Ich habe /registerkarten 🔵 sonnen eingegeben, um Abschnitte der Seitenleiste umzubenennen.' },
  ])
  // Auch ein schon gefärbter Abschnitt lässt sich umfärben.
  expect(await run($, '🟢 Startseite')).toBe('Umbenannt in „🟢 Startseite-LandingPage“.')
  expect(await run($, '🟢 gibtsnicht')).toBe('Kein eigener Abschnitt enthält „gibtsnicht“.')
  expect(await run($, 'blau sonnen')).toContain('Bitte einen dieser Punkte vorn')
})

test('ohne Freigabe zum Lesen sagt /registerkarten, was fehlt', async ($, on) => {
  engine(on, { list: false, rename: false, listDenied: true })

  expect(await run($, '')).toContain('mcp__ccd_sidebar__list_sections')
})
