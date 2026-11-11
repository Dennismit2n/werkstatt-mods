# inventar

Seitenleiste „In diesem Chat“ für Claude Code: zeigt, was die laufende Sitzung benutzt hat. Die Leiste schreibt nur mit, ruft kein Modell auf und hält nie einen Werkzeugaufruf auf. Angeregt durch die Mod Chat Inventory von Ben AI. Texte auf Deutsch oder Englisch.

## Was die Leiste zeigt

- **Aufgaben:** die Aufgabenliste der Sitzung mit ○ offen, ● in Arbeit, ✓ erledigt und dem Zähler „2 von 5 erledigt“ (aus `TodoWrite` und der Aufgabenliste der Desktop-App).
- **Konnektoren:** jeder benutzte Konnektor mit der Zahl der Aufrufe. Trägt ein Konnektor nur eine Kennung, nimmt die Leiste den Anfang des Werkzeugnamens (aus `notion-fetch` wird „Notion“), sonst „Konnektor“ und die ersten acht Zeichen der Kennung.
- **Skills** und **Links** (die Adressen, die Claude abgerufen hat).
- **Geschriebene** und **gelesene Dateien**, das Neueste zuerst, unter dem Arbeitsordner mit kurzem Pfad. Je Abschnitt acht Zeilen, der Rest als „und n weitere“.
- Der Knopf „Leeren“ setzt die Leiste zurück.

Gezählt werden die Aufrufe der Hauptsitzung und ihrer Subagenten.

## Bedienung

`/inventar` klappt die Leiste auf und zu.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Leiste, `de` oder `en` |
| `autoOpen` | aus | Die Leiste beim Start jeder Sitzung von selbst öffnen |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.321 unter Windows 11.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install inventar --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install inventar --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu inventar>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (4 Tests).

Lizenz: MIT.
