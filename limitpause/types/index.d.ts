export type LimitWindow = { label: string; percent: number; resetsAt: number | null }

export type Credit = {
  enabled: boolean
  currency: string
  percent: number | null
  used: number | null
  limit: number | null
}

export type Limits = {
  windows: LimitWindow[]
  credit: Credit | null
  context: number | null
  compactsAt: number | null
  source: 'app' | 'engine'
  at: number
}

// Eine laufende Pause: welches Limit, wie voll, bis wann, wie viele Anfragen warten.
export type Pause = { label: string; percent: number; until: number | null; waiting: number }

declare module 'claude-code' {
  interface PluginState {
    limitpause: {
      isOff: boolean
      pause: Shaped<Pause | null>
      jumps: number[]
    }
  }
}
