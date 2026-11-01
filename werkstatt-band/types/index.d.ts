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

declare module 'claude-code' {
  interface PluginState {
    'werkstatt-band': {
      limits: Shaped<Limits | null>
      isHidden: boolean
      news: string[]
    }
  }
}
