// Ein Mod oder Plugin, wie die Schalttafel es zeigt.
export type ModRow = {
  // Kennung in den Einstellungen: „name@inline“ für einen Mod aus einem Ordner,
  // sonst „name@marketplace“.
  key: string
  name: string
  version: string
  description: string
  // Die Befehle, die der Mod in dieser Sitzung angemeldet hat, ohne Schrägstrich.
  commands: string[]
  // Ob er aus einem Ordner (CLAUDE_CODE_PLUGIN_DIRS) kommt.
  isInline: boolean
  // Ob er in dieser Sitzung läuft (beim Start nicht abgeschaltet war).
  isLoaded: boolean
  // Was die Einstellungen jetzt sagen: gilt ab der nächsten Sitzung.
  isEnabled: boolean
}

declare module 'claude-code' {
  interface PluginState {
    schalttafel: {
      // null: noch nicht gelesen.
      rows: Shaped<ModRow[] | null>
      // Eine Meldung unter der Liste, etwa ein Lesefehler; leer, wenn nichts zu sagen ist.
      note: string
    }
  }
}
