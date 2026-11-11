import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { mask, maskDeep } from '../hooks/register'

type Engine = Parameters<TestBody>[0]

const BAND = {
  plugin: 'sichtschutz',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Unter der Mod zeichnet hier die Engine jede Zeile als ihren Text, so wie die
// Mod ihn weitergereicht hat.
function engine(on: Parameters<TestBody>[1]) {
  const status: (string | undefined)[] = []
  on('command.register', () => ({ value: { command: 'sichtschutz' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const props = e.props as { text?: string; input?: unknown; output?: unknown }
    const shown = e.component === 'AbovePrompt' ? 'unten' : (props.text ?? JSON.stringify([props.input, props.output]))
    return $.ui.resolve(e).Text({ children: [shown] })
  })
  return { status }
}

const run = ($: Engine, args = '') =>
  $.command.run({ command: 'sichtschutz', args } as unknown as Parameters<Engine['command']['run']>[0])

const row = async ($: Engine, component: string, props: Record<string, unknown>) => {
  const ui = await $.ui.mount({
    plugin: 'sichtschutz',
    component,
    requestId: 'r1',
    props,
    surface: 'desktop',
  } as unknown as Parameters<Engine['ui']['mount']>[0])
  const all = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await ui.unmount()
  return all
}

test('die Muster: Mail, Telefon, Betrag, IBAN, Nutzerordner und eigene Wörter', () => {
  expect(mask('Schreib an max.muster@example.org bitte.', [])).toBe('Schreib an ████████████ bitte.')
  expect(mask('Ruf an: 0151 23456789 oder +49 30 1234567.', [])).toBe('Ruf an: ████████████ oder ████████████.')
  expect(mask('Das kostet 12,50 € oder $3.81, also 400 EUR.', [])).toBe('Das kostet ███████ oder █████, also ███████.')
  expect(mask('IBAN DE89 3704 0044 0532 0130 00 steht da.', [])).toBe('IBAN ████████████ steht da.')
  expect(mask('C:\\Users\\maria\\source\\repos und /home/thomas/x', [])).toBe('C:\\Users\\█████\\source\\repos und /home/██████/x')
  expect(mask('Kunde Müller GmbH und müller privat', ['Müller'])).toBe('Kunde ██████ GmbH und ██████ privat')
})

test('was kein Muster ist, bleibt lesbar: Daten, Versionen, Token-Zahlen, Uhrzeiten', () => {
  const plain = 'Am 2026-11-11 um 01:08 lief Version 2.1.321 mit 12.345.678 Token, 96,5 % und 5 von 9 Tests.'
  expect(mask(plain, [])).toBe(plain)
  // Beträge lassen sich abschalten.
  expect(mask('12,50 €', [], false)).toBe('12,50 €')
})

test('Daten von Werkzeugen: jede Zeichenkette wird geschwärzt, die Form bleibt', () => {
  const input = { to: ['a@b.de'], body: { text: 'Preis 9 €', n: 3, ok: true }, none: null }
  expect(maskDeep(input)).toEqual({ to: ['██████'], body: { text: 'Preis ████', n: 3, ok: true }, none: null })
})

test('aus: der Verlauf bleibt, wie er ist; an: Zeilen und Werkzeugdaten sind geschwärzt', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const user = { text: 'Mail an chef@firma.de', origin: { kind: 'user' }, isExpanded: true }
  const reply = { text: 'Die Rechnung über 1.200,00 € ging raus.', isFirstOfReply: true }
  const tool = { tool_use_id: 't1', tool: 'Bash', input: { command: 'cat C:\\Users\\maria\\x.txt' }, isRunning: false, isErrored: false }

  expect(await row($, 'UserMessage', user)).toBe('Mail an chef@firma.de')

  expect((await run($)).text).toContain('Sichtschutz an.')
  expect(w.status.at(-1)).toBe('Sichtschutz an')
  expect(await row($, 'UserMessage', user)).toBe('Mail an ████████████')
  expect(await row($, 'AssistantMessage', reply)).toBe('Die Rechnung über ██████████ ging raus.')
  expect(await row($, 'ToolUse', tool)).toContain('C:\\\\Users\\\\█████\\\\x.txt')

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: /Sichtschutz/ }))?.text).toBe('Sichtschutz an: Der Verlauf ist geschwärzt.')
  expect((await band.find({ type: 'Text', text: /^unten$/ }))?.text).toBe('unten')
  await band.press({ key: 'sichtschutz-off' })
  expect(await band.find({ type: 'Text', text: /Sichtschutz/ })).toBeUndefined()
  await band.unmount()

  expect(w.status.at(-1)).toBeUndefined()
  expect(await row($, 'UserMessage', user)).toBe('Mail an chef@firma.de')
})

test('„an“ und „aus“ als Wort, und der Befehl ohne Wort schaltet um', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await run($, 'aus')).text).toBe('Sichtschutz aus. Der Verlauf zeigt wieder alles.')
  expect((await run($, 'an')).text).toContain('Sichtschutz an.')
  expect((await run($, 'on')).text).toContain('Sichtschutz an.')
  expect((await run($)).text).toContain('Sichtschutz aus.')
})

test(
  'eigene Einstellungen: beim Start an, eigene Wörter, Beträge bleiben',
  { options: { startOn: true, words: ['Acme'], maskMoney: false } },
  async ($, on) => {
    const w = engine(on)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    expect(w.status.at(-1)).toBe('Sichtschutz an')

    const reply = { text: 'ACME zahlt 500 € an x@y.de.', isFirstOfReply: true }
    expect(await row($, 'AssistantMessage', reply)).toBe('████ zahlt 500 € an ██████.')
  },
)

test('auf Englisch: die Meldungen', { options: { language: 'en' } }, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await run($, 'on')).text).toContain('Screen guard on.')
  expect(w.status.at(-1)).toBe('Screen guard on')
  expect((await run($, 'off')).text).toBe('Screen guard off. The transcript shows everything again.')
})
