# limitpause

Hält eine Modell-Anfrage der Hauptsitzung kurz an, wenn ein Limit die Grenze erreichen würde (99,89 %, einstellbar) und der Reset nah ist, und lässt sie danach von selbst weiterlaufen. Liegt der Reset weiter weg als die Wartezeit, wird die Runde mit einem klaren Hinweis beendet, statt stundenlang zu hängen. Ist nur das Wochenlimit eines Modells voll (etwa „Woche Fable“), geht es ohne Stopp mit Opus weiter. Kurz vor der Grenze erinnert eine Vorwarnung an die Übergabe, und `/limitpause einmal` lässt nach einem Stopp genau eine Runde durch. Agenten werden nie angehalten. Meldungen auf Deutsch oder Englisch.

## Wie es arbeitet

- Vor jeder Modell-Anfrage der Hauptsitzung liest die Mod die Limits: die Zahlen der Desktop-App (App-Werkzeug `get_usage`, höchstens einmal die Minute, ab 90 % vor jeder Anfrage) und die der Engine; je Fenster zählt der höhere Wert. Ein Wochenlimit eines Modells („Woche Fable“) gilt nur für Anfragen an dieses Modell.
- Würde ein Fenster mit Sicherheitsabstand die Grenze erreichen, gibt es zwei Fälle:
  - **Reset nah** (höchstens `maxWaitMinutes` entfernt, Standard 5 Minuten): Die Anfrage wartet an Ort und Stelle bis eine Minute nach dem Reset und geht dann unverändert raus. Toast, Statuszeile und Benachrichtigung melden Beginn und Ende.
  - **Reset fern oder unbekannt:** Die Runde wird beendet, die Anfrage nicht gesendet. Eine Log-Zeile im Verlauf, ein Toast und eine Benachrichtigung nennen Fenster, Stand und Freigabezeit, dazu den Weg weiter: nach dem Reset erneut senden, mit `/limitpause einmal` eine Runde durchlassen (etwa für `/uebergabe`) oder mit `/limitpause aus` die Pause ganz aufheben.
- **Modell-Ausweiche:** Ist nur das Wochenlimit des eigenen Modells voll und das Ausweichmodell (`fallbackModel`, Standard Opus) frei, geht die Anfrage mit dem Ausweichmodell raus. Das gilt auch für Agenten und bei `/limitpause aus`, denn es hält nichts an, es lenkt nur um. Ein Hinweis im Verlauf, als Toast und als Benachrichtigung kommt einmal je Fenster und Reset.
- **Vorwarnung:** `warnPoints` Punkte vor der Grenze (Standard 3, mit der Unschärfe also ab etwa 96 %) kommen einmal ein Toast und eine Benachrichtigung, die Statuszeile bleibt stehen: jetzt `/uebergabe` schreiben, solange der Rest sicher reicht. Ein Modell-Fenster, das die Ausweiche abfängt, warnt nicht.
- Der Abstand ist das Doppelte des größten Anstiegs der letzten zehn Messungen, mindestens 0,5 und höchstens 2 Punkte; ein Reset leert die Liste.
- Die Desktop-App nennt nur ganze Prozent: Hinter „99 %“ kann schon 99,9 % stecken. Bei einer ganzen Zahl kommt deshalb ein voller Punkt Unschärfe zum Abstand. Mit der Grenze 99,89 heißt das: Bei 99 % hält die Mod an, bei 98 % nur, wenn die letzten Anstiege groß waren.
- Gewartet wird in Häppchen von 30 Sekunden über einen kleinen Kindprozess (node, sonst PowerShell, sonst sh), der jede Sekunde ein Lebenszeichen gibt. Zwischen zwei Lebenszeichen prüft die Mod Esc und `/limitpause aus`.
- **Agenten** (Subagenten) laufen immer durch: Die Desktop-App beendet einen Agenten, dessen Anfrage länger als 600 Sekunden hängt. Erreicht ein Agent das Limit, scheitert nur seine Anfrage.

Warum so (02.11.2026): Die erste Fassung hielt jede Anfrage bis zum Reset, auch zwei Stunden lang. Dabei war nichts zu sehen, ein Subagent wurde von der App beendet, und die Sitzung musste abgebrochen werden. Ein klarer Stopp mit Hinweis ist besser als stilles Warten.

Warum die Ausweiche, die Vorwarnung und die Freifahrt (16.11.2026): Der Stopp kam vor der Übergabe. Um sie noch zu schreiben, musste ich die Pause ganz ausschalten, und dann sperrte das Fable-Wochenlimit hart. Erst ein Wechsel auf Opus von Hand half. Jetzt kommt die Erinnerung früher, eine einzelne Runde geht ohne Ausschalten durch, und am Modell-Limit wechselt die Mod selbst.

## Bedienung

`/limitpause` zeigt Grenze, Abstand, Wartezeit, Ausweichmodell, Vorwarnung, wartende Anfragen und den Stand aller Fenster. `/limitpause einmal` (oder `once`) lässt genau die nächste Runde durch, alle ihre Schritte eingeschlossen; danach ist die Pause wieder scharf. `/limitpause aus` (oder `off`) hebt die Pause für die Sitzung sofort auf, auch mitten im Warten; `/limitpause an` (oder `on`) schaltet sie wieder ein.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Meldungen, `de` oder `en` |
| `limitPercent` | `99.89` | Grenze in Prozent; mit Sicherheitsabstand erreicht, wartet die Anfrage oder wird gestoppt |
| `maxWaitMinutes` | `5` | Höchstens so lange wartet eine Anfrage auf den Reset; `0` heißt nie warten |
| `fallbackModel` | `opus` | Ausweichmodell, wenn nur das Wochenlimit des eigenen Modells voll ist; leer heißt aus |
| `warnPoints` | `3` | Vorwarnung so viele Punkte vor der Grenze; `0` heißt aus |

## Grenzen

Cloud-Sitzungen haben die Mod nicht. Eine gestoppte Runde muss von Hand neu angestoßen werden (Nachricht erneut senden).

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

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (21 Tests). `hooks/limits.ts` liegt gleichlautend auch in den Mods `statistik` und `werkstatt-band`; beim Ändern alle drei Kopien gleich halten.

Lizenz: MIT.
