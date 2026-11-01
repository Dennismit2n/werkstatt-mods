import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

const LAUNCH = 'C:\\Users\\danyr\\.claude\\.claude\\launch.json'

type Listed = AgentInfo

function engine(on: Parameters<TestBody>[1], listed: Listed[] = []) {
  on('command.register', () => ({ value: { command: 'agentenbremse' } }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 0, isLink: false } }))
  on('agent.list', () => ({ value: listed }))
  let spawned = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `neu${(spawned += 1)}` }))
  on('tool.call', () => ({ result: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

const spawn = (subagentType: string) =>
  ({ prompt: 'p', description: 'd', subagentType }) as unknown as Parameters<
    Parameters<TestBody>[0]['agent']['spawn']
  >[0]

test('launch.json: Überschreiben und Löschen gesperrt, Lesen und andere Dateien frei', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const write = await $.tool.call({ tool: 'Write', file_path: LAUNCH, content: '{}' })
  expect(write.deny).toContain('launch.json')

  const other = await $.tool.call({ tool: 'Write', file_path: 'C:\\x\\notiz.txt', content: 'a' })
  expect(other.deny).toBeUndefined()

  const rm = await $.tool.call({ tool: 'Bash', command: `rm -f ${LAUNCH.replace(/\\/g, '/')}` })
  expect(rm.deny).toContain('launch.json')

  const redirect = await $.tool.call({ tool: 'Bash', command: "echo '{}' > .claude/.claude/launch.json" })
  expect(redirect.deny).toContain('launch.json')

  const cat = await $.tool.call({ tool: 'Bash', command: 'cat .claude/.claude/launch.json 2>/dev/null' })
  expect(cat.deny).toBeUndefined()

  const later = await $.tool.call({ tool: 'Bash', command: 'rm -f alt.txt; cat launch.json' })
  expect(later.deny).toBeUndefined()

  // Lesen mit Schaltern oder Suchwörtern, die wie Löschbefehle aussehen.
  for (const command of [
    'grep -ri port .claude/.claude/launch.json',
    'rg "move" launch.json',
    'Select-String -Pattern rm launch.json',
  ]) {
    expect((await $.tool.call({ tool: 'Bash', command })).deny).toBeUndefined()
  }

  // Löschen mitten in einer Kette, über eine Pipe oder in PowerShell -Command.
  for (const command of [
    'cd .claude && rm .claude/launch.json',
    'ls launch.json | xargs rm launch.json',
    'Get-Item x | Remove-Item launch.json',
    'powershell -NoProfile -Command "Remove-Item .claude/launch.json"',
    'sudo mv launch.json alt.json',
  ]) {
    expect((await $.tool.call({ tool: 'PowerShell', command })).deny).toContain('launch.json')
  }
})

test('Befehlslänge: über 7.500 Zeichen gesperrt, darunter frei', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const long = await $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(8000)}` })
  expect(long.deny).toContain('8.000')

  const short = await $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(5000)}` })
  expect(short.deny).toBeUndefined()
})

test('Agenten-Bremse: zwei schwere laufen, ein dritter wartet, ein leichter darf', async ($, on) => {
  engine(on, [
    { id: 'a1', type: 'general-purpose', status: 'running', description: 'eins' },
    { id: 'a2', type: 'general-purpose', status: 'running', description: 'zwei' },
    { id: 'a0', type: 'general-purpose', status: 'completed', description: 'fertig' },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const heavy = await $.agent.spawn(spawn('general-purpose'))
  expect(heavy.deny).toContain('Agenten-Bremse')

  const light = await $.agent.spawn(spawn('Explore'))
  expect(light.deny).toBeUndefined()
})

test('Agenten-Bremse: einer läuft, der zweite darf starten', async ($, on) => {
  engine(on, [{ id: 'a1', type: 'general-purpose', status: 'running', description: 'eins' }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const second = await $.agent.spawn(spawn('general-purpose'))
  expect(second.deny).toBeUndefined()
})

test('Agenten-Bremse: gleichzeitige Starts zählen einander mit', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const heavy = await Promise.all([1, 2, 3].map(() => $.agent.spawn(spawn('general-purpose'))))
  expect(heavy.filter(one => one.deny === undefined).length).toBe(2)
  expect(heavy.filter(one => one.deny?.includes('Agenten-Bremse')).length).toBe(1)

  // Zwei schwere laufen schon, insgesamt höchstens vier.
  const light = await Promise.all([1, 2, 3].map(() => $.agent.spawn(spawn('Explore'))))
  expect(light.filter(one => one.deny === undefined).length).toBe(2)
})

test('auf Englisch: die Meldungen des Wächters', { options: { language: 'en' } }, async ($, on) => {
  engine(on, [
    { id: 'a1', type: 'general-purpose', status: 'running', description: 'one' },
    { id: 'a2', type: 'general-purpose', status: 'running', description: 'two' },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const write = await $.tool.call({ tool: 'Write', file_path: LAUNCH, content: '{}' })
  expect(write.deny).toContain('Guard: launch.json is protected')

  const long = await $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(8000)}` })
  expect(long.deny).toContain('the limit is 7,500')

  const heavy = await $.agent.spawn(spawn('general-purpose'))
  expect(heavy.deny).toContain('Agent brake')

  const answer = await $.command.run({ command: 'agentenbremse', args: '' } as never)
  expect(String((answer as { text?: string }).text)).toContain('Agent brake off')
})

test(
  'eigene Einstellungen: andere Datei, keine Längenprüfung, nur ein schwerer Agent',
  {
    options: {
      protectedFile: '/srv/shared/servers.json',
      maxCommand: 0,
      heavyMax: 1,
      allMax: 2,
      lightAgents: ['Scout'],
    },
  },
  async ($, on) => {
    engine(on, [{ id: 'a1', type: 'general-purpose', status: 'running', description: 'eins' }])
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

    // Die eigene Datei ist geschützt, die Voreinstellung nicht mehr.
    const own = await $.tool.call({ tool: 'Write', file_path: '/srv/shared/servers.json', content: '{}' })
    expect(own.deny).toContain('servers.json')
    const shell = await $.tool.call({ tool: 'Bash', command: 'rm -f /srv/shared/servers.json' })
    expect(shell.deny).toContain('servers.json')
    const old = await $.tool.call({ tool: 'Write', file_path: LAUNCH, content: '{}' })
    expect(old.deny).toBeUndefined()

    // Längenprüfung aus.
    const long = await $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(9000)}` })
    expect(long.deny).toBeUndefined()

    // Ein schwerer läuft, höchstens einer: der zweite schwere wartet, ein Scout darf.
    expect((await $.agent.spawn(spawn('general-purpose'))).deny).toContain('Agenten-Bremse')
    expect((await $.agent.spawn(spawn('Scout'))).deny).toBeUndefined()
  },
)
