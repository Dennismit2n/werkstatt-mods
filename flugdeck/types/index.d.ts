// ended: Die Engine hat den Agenten aus ihrer Liste ausgetragen, ohne dass ein
// Ende-Signal kam; wie es ausging, weiß die Leiste dann nicht.
export type RunStatus = 'running' | 'done' | 'failed' | 'aborted' | 'ended'

export type Run = {
  id: string
  nr: number
  description: string
  type: string
  model: string | null
  parentId: string | null
  startedAt: number
  endedAt: number | null
  status: RunStatus
  tools: number
  lastTool: string | null
  steps: number
  tokens: number
}

// Eine andere Sitzung der Desktop-App, wie das App-Werkzeug list_sessions sie
// nennt: kein Subagent, aber das, was in der Seitenleiste der App arbeitet.
export type SessionRow = {
  id: string
  title: string
  isRunning: boolean
  lastActivityAt: number
}

declare module 'claude-code' {
  interface PluginState {
    flugdeck: {
      runs: Shaped<Run[]>
      expanded: string | null
      now: number
      autoOpened: boolean
      // null: kein App-Werkzeug (Terminal) oder noch nicht gelesen; dann fehlt der Abschnitt.
      sessions: Shaped<SessionRow[] | null>
    }
  }
}
