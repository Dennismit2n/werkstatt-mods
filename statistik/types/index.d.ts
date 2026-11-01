export type ModelTokens = { name: string; tokens: number }

export type RangeStats = {
  sessions: number
  messages: number
  tokens: number
  activeDays: number
  peakHour: number | null
  favorite: string | null
  models: ModelTokens[]
  lotr: number
}

export type RangeKey = 'all' | 'd30' | 'd7'
export type TabKey = 'overview' | 'models'

export type ZaehlwerkSum = { echt: number; cache: number; anzahl: number }

export type Zaehlwerk = {
  block: ZaehlwerkSum
  blockVon: number | null
  blockBis: number | null
  blockVonText: string | null
  heute: ZaehlwerkSum
  modelle: { name: string; echt: number }[]
}

// Dieselben Typen wie im Mod werkstatt-band (hooks/limits.ts liegt in beiden).
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

export type Stats = {
  at: string
  now: number
  today: string
  stand: string
  filesRead: number
  filesTotal: number
  ranges: Record<RangeKey, RangeStats>
  perDay: Record<string, number>
  zaehlwerk: Zaehlwerk
}

declare module 'claude-code' {
  interface PluginState {
    statistik: {
      stats: Shaped<Stats | null>
      status: string
      tab: TabKey
      range: RangeKey
      showStats: boolean
      showZaehlwerk: boolean
      showLimits: boolean
      limits: Shaped<Limits | null>
    }
  }
}
