// idle: nichts läuft. writing: Claude schreibt gerade die Übergabe.
// ready: Die Übergabe liegt als Datei bereit.
export type HandoffPhase = 'idle' | 'writing' | 'ready'

declare module 'claude-code' {
  interface PluginState {
    uebergabe: {
      phase: HandoffPhase
      // Voller Pfad der fertigen Übergabe, solange sie bereitliegt.
      file: string | null
      // Token im Kontext nach der letzten Antwort; null, solange nichts gemessen ist.
      tokens: number | null
      // Bis zu diesem Kontextstand bleibt der Hinweis nach „Später“ aus.
      snoozedUntil: number
    }
  }
}
