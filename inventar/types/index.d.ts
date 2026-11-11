// Ein gezählter Eintrag: ein Konnektor, ein Skill, ein Link oder eine Datei.
export type Counted = { name: string; count: number }

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type Todo = { text: string; status: TodoStatus }

// Was die Sitzung bisher benutzt hat. Die Listen stehen mit dem zuletzt
// benutzten Eintrag vorn; Dateien tragen ihren vollen Pfad als Namen.
export type Inventory = {
  todos: Todo[]
  connectors: Counted[]
  skills: Counted[]
  links: Counted[]
  read: Counted[]
  written: Counted[]
}

declare module 'claude-code' {
  interface PluginState {
    inventar: {
      items: Shaped<Inventory>
    }
  }
}
