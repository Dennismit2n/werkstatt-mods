// null: in dieser Sitzung noch nicht geschaltet, dann gilt die Einstellung startOn.
export type GuardSwitch = boolean | null

declare module 'claude-code' {
  interface PluginState {
    sichtschutz: {
      isOn: GuardSwitch
    }
  }
}
