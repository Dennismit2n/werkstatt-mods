# flugdeck

Seitenleiste „Agenten“ für Claude Code: zeigt jeden Subagenten der laufenden Sitzung mit Laufbalken, Zeit und letztem Werkzeug, darunter die anderen Sitzungen der Desktop-App. Die Leiste schaut nur zu und hält nie einen Agenten, ein Werkzeug oder eine Anfrage auf. Angeregt durch die Mod Flightdeck von scasella. Texte auf Deutsch oder Englisch.

## Was die Leiste zeigt

- Je Agent eine Zeile: Zustand (● läuft, ✓ fertig, ✗ gescheitert, ■ abgebrochen, ○ beendet ohne Ende-Signal), Nummer, Beschreibung, Laufzeit und ein Balken, dessen Länge sich am längsten Agenten misst. Darunter „→ letztes Werkzeug“, solange der Agent läuft.
- Ein Klick auf die Zeile klappt Typ, Modell, Werkzeuge, Anfragen und Token auf, dazu „Verlauf ansehen“, das den Verlauf des Agenten im Hauptbereich öffnet.
- Oben die Zusammenfassung „n laufen · m gesamt“ und der Knopf „Fertige leeren“. Die Leiste behält die letzten 30 Agenten.
- Solange ein Agent läuft, tickt die Uhr jede Sekunde und gleicht mit der Agentenliste der Engine ab. Fehlt ein laufender Agent dort länger als zehn Sekunden, gilt er als beendet; so bleibt kein Eintrag für immer auf „läuft“.
- **Sitzungen**: Unter den Agenten stehen die anderen Sitzungen der Desktop-App (App-Werkzeug `list_sessions`, nur lesend), die arbeitenden zuerst, höchstens fünf Zeilen. Im Terminal fehlt der Abschnitt. Diese Sitzungen sind keine Subagenten; der Abschnitt zeigt nur, was in der Seitenleiste der App gerade arbeitet.

Gezählt werden als Agenten die Subagenten, die Claude in dieser Sitzung mit dem Agent-Werkzeug startet.

## Bedienung

- `/agenten` öffnet die Leiste. Beim ersten Subagenten einer Sitzung geht sie einmal von selbst auf; wer sie zumacht, behält sie zu.
- Der Knopf „Agenten“ im Band der Mod `werkstatt-band` klappt sie auf und zu (nur zusammen mit dieser Mod).

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Leiste, `de` oder `en` |
| `autoOpen` | an | Beim ersten Subagenten einer Sitzung einmal von selbst öffnen |
| `showSessions` | an | Die anderen Sitzungen der Desktop-App unter den Agenten zeigen |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.309. Im Terminal zeichnet statt des Balkens ein Textbalken.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install flugdeck --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install flugdeck --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu flugdeck>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (6 Tests).

Lizenz: MIT.
