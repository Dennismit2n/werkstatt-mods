# limitpause

Hält jede Modell-Anfrage an, bevor ein Limit die Grenze erreicht (99,89 %, einstellbar), und lässt sie nach dem Reset von selbst weiterlaufen. Nichts bricht ab, keine Aufgabe endet mehr mit „Limit erreicht“. Meldungen auf Deutsch oder Englisch.

## Wie es arbeitet

- Vor jeder Modell-Anfrage, in der Hauptsitzung wie in jedem Subagenten, liest die Mod die Limits: die Zahlen der Desktop-App (App-Werkzeug `get_usage`, höchstens einmal die Minute, ab 90 % vor jeder Anfrage) und die der Engine; je Fenster zählt der höhere Wert. Ein Wochenlimit eines Modells („Woche Fable“) gilt nur für Anfragen an dieses Modell.
- Würde ein Fenster mit Sicherheitsabstand die Grenze erreichen, wartet die Anfrage an Ort und Stelle bis eine Minute nach dem Reset und geht dann unverändert raus. Der Abstand ist das Doppelte des größten Anstiegs der letzten zehn Messungen, mindestens 0,5 und höchstens 5 Punkte; ein Reset leert die Liste.
- Gewartet wird in Häppchen von 30 Sekunden über einen kleinen Kindprozess (node, sonst PowerShell, sonst sh), der jede Sekunde ein Lebenszeichen gibt. Zwischen zwei Lebenszeichen prüft die Mod Esc und `/limitpause aus`.
- Nennt das Limit keinen Reset-Zeitpunkt, misst die Mod alle fünf Minuten neu und lässt die Anfrage nach spätestens 30 Minuten trotzdem raus.
- Toast, Statuszeile und Benachrichtigung melden Beginn und Ende der Pause.

## Bedienung

`/limitpause` zeigt Grenze, Abstand, wartende Anfragen und den Stand aller Fenster. `/limitpause aus` (oder `off`) hebt die Pause für die Sitzung sofort auf, auch mitten im Warten; `/limitpause an` (oder `on`) schaltet sie wieder ein.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Meldungen, `de` oder `en` |
| `limitPercent` | `99.89` | Grenze in Prozent; mit Sicherheitsabstand erreicht, wartet jede Anfrage bis zum Reset |

## Grenzen

Cloud-Sitzungen haben die Mod nicht. Ob die Desktop-App eine stundenlang wartende Anfrage duldet, ist noch nicht in einer echten langen Pause beobachtet worden.

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.309. Für den Schläfer Node.js, PowerShell oder sh im PATH.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install limitpause --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install limitpause --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu limitpause>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (11 Tests). `hooks/limits.ts` liegt gleichlautend auch in den Mods `statistik` und `werkstatt-band`; beim Ändern alle drei Kopien gleich halten.

Lizenz: MIT.
