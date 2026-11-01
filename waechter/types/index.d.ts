export type TrackedAgent = { id: string; type: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    waechter: {
      agents: TrackedAgent[]
      isBrakeOff: boolean
    }
  }
}
