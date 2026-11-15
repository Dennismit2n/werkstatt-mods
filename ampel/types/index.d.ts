// Was neben der Hauptsitzung läuft: ein Hintergrundbefehl (Bash, PowerShell),
// ein Monitor, ein Unteragent oder eine verknüpfte Nebensitzung der App.
export type JobKind = 'shell' | 'monitor' | 'agent' | 'session'

export type Job = {
  // Die Kennung der Engine: taskId, agentId oder sessionId.
  id: string
  kind: JobKind
  // Kurzer Name für das Band: Beschreibung des Aufrufs oder der Befehl.
  name: string
  // Wann die Mod den Lauf zuerst gesehen hat (Millisekunden der Engine-Uhr).
  startedAt: number
}

// Etwas, das abgebrochen, gestoppt oder fehlgeschlagen ist. Bleibt rot im
// Band, bis du es mit „Gesehen“ quittierst.
export type Incident = {
  id: string
  text: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    ampel: {
      // Die Hauptsitzung arbeitet gerade an einem Zug (Antwort oder Werkzeug).
      isWorking: boolean
      // Beginn des laufenden Zugs; 0, solange keiner läuft.
      workingSince: number
      // Das Werkzeug, das die Hauptsitzung gerade ausführt, als kurzer Text; null ohne.
      tool: string | null
      // Was gerade im Hintergrund läuft.
      jobs: Job[]
      // Was abgebrochen oder fehlgeschlagen ist und noch nicht quittiert wurde.
      incidents: Incident[]
      // Geplante Weckrufe der Sitzung (/loop, ScheduleWakeup, CronCreate) beim letzten Zugende.
      crons: number
      // Die Uhr fürs Band: läuft nur, solange etwas arbeitet.
      now: number
    }
  }
}
