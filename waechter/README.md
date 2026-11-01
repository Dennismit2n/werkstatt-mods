# waechter

Drei Schutzregeln für Claude Code, die auch dann gelten, wenn Claude selbst arbeitet. Jede Regel verweigert den Aufruf mit einem Satz, der sagt, was stattdessen zu tun ist. Meldungen auf Deutsch oder Englisch.

## Die Regeln

- **Geschützte Datei**: `Write` auf eine bestehende Datei, deren Pfad auf `\.claude\launch.json` endet, wird verweigert, ebenso Shell-Befehle, die sie löschen, verschieben oder per Umleitung überschreiben (`rm`, `del`, `Remove-Item`, `mv`, `>` und ähnliche, auch hinter `xargs`, `-exec`, `sudo` oder in `-Command "…"`). Lesen bleibt frei, auch `grep -ri … launch.json`. Hintergrund: Die Datei ist die Server-Liste aller Sitzungen der Desktop-App; eine Sitzung hatte sie einmal überschrieben.
- **Befehlslänge**: Bash- und PowerShell-Befehle über 7.500 Zeichen werden verweigert. Windows kappt eine Befehlszeile still bei etwa 8.000 Zeichen, lange Inhalte gehören erst in eine Datei.
- **Agenten-Bremse**: höchstens 2 schwere Subagenten gleichzeitig und 4 insgesamt. Als leicht gelten Explore, Plan, claude-code-guide und statusline-setup. Starts laufen nacheinander durch die Prüfung, damit fünf gleichzeitige Starts nicht alle noch null laufende sehen. Hintergrund: ein PC mit 16 GB Arbeitsspeicher, den acht parallele Agenten eingefroren haben.

## Bedienung

`/agentenbremse` schaltet die Bremse für die laufende Sitzung aus und wieder an. Die anderen beiden Regeln haben keinen Schalter, lassen sich aber in den Einstellungen abstellen.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Meldungen, `de` oder `en` |
| `protectedFile` | `\.claude\launch.json` | Pfadende der geschützten Datei; leer schaltet den Schutz ab |
| `maxCommand` | `7500` | Längste erlaubte Befehlszeile; `0` schaltet die Prüfung ab |
| `heavyMax` | `2` | Schwere Subagenten gleichzeitig |
| `allMax` | `4` | Subagenten gleichzeitig insgesamt |
| `lightAgents` | Explore, claude-code-guide, Plan, statusline-setup | Agententypen, die nur gegen die Gesamtzahl zählen |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.309. Die Regeln gelten in der Sitzung, in der die Mod geladen ist; Cloud-Sitzungen haben sie nicht.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install waechter --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install waechter --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu waechter>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (7 Tests).

Lizenz: MIT.
