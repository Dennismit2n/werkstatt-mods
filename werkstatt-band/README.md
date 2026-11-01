# werkstatt-band

Band über dem Eingabefeld von Claude Code: die Limits in einer Zeile, dazu zwei Helfer für die eigenen Repos. Texte auf Deutsch oder Englisch.

## Was das Band zeigt

- **Limits**: 5 h, Woche, Woche je Modell (etwa „Woche Fable“), Nutzungsguthaben (nur wenn eingeschaltet) und Kontext, jeweils mit kleinem Balken, Prozent und Zeit bis zur Freigabe in Klammern. Blau bis 70 %, Bernstein ab 70 %, Rot ab 90 %. Quelle ist das App-Werkzeug `get_usage` der Desktop-App: offiziell, nur lesend, kein Cookie. Verlangt das Werkzeug eine Freigabe, fragt die Mod nicht nach, sondern nimmt die Zahlen der Engine (5 h und Woche).
- **Knöpfe rechts**: „Statistik“ und „Agenten“ klappen die Seitenleisten der Mods `statistik` und `flugdeck` auf und zu (ohne diese Mods tun sie nichts), „Limits ▾/▸“ klappt das Band ein; die Knöpfe bleiben stehen.
- **News-Erinnerung**: Nach einem Write oder Edit an einer sichtbaren Datei eines Werkzeug-Repos erscheint „Geändert: … Satz in news.js nachziehen?“. Die Zeile verschwindet mit „Erledigt“ oder sobald die News-Datei geschrieben wird. Interna, Tests, Doku und Werkzeugordner lösen nichts aus.
- **Textprüfer**: Nach dem Schreiben einer Textdatei unter dem Repo-Ordner meldet ein Toast gerade Apostrophe zwischen Buchstaben (’ statt ') und Gedankenstriche (— und –).

## Bedienung

`/limits` klappt das Band ein und aus. Das Band erscheint mit der ersten Antwort einer Sitzung, vorher läuft noch nichts, was zeichnen könnte.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`. Die Voreinstellungen passen zur Werkstatt von Dennis; wer andere Repos hat, trägt seine Werte ein:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache des Bands, `de` oder `en` |
| `reposRoot` | `\source\repos\` | Pfadstück, unter dem die Repos liegen (auch `/code/`); leer schaltet News-Erinnerung und Textprüfer ab |
| `newsFile` | `\dennismit2n.github.io\js\news.js` | Pfadende der News-Datei der eigenen Seite; leer schaltet die Erinnerung ab |
| `toolRepos` | 15 Werkstatt-Repos | Repo-Ordner, deren sichtbare Änderungen eine News brauchen, je Eintrag `ordner=Anzeigename` |
| `textCheck` | an | Apostrophe und Gedankenstriche nach dem Schreiben melden |

Pfade werden ohne Rücksicht auf Groß- und Kleinschreibung und auf `/` oder `\` verglichen.

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.309. Im Terminal fehlt das App-Werkzeug; dann zeigt das Band die Zahlen der Engine.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install werkstatt-band --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install werkstatt-band --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu werkstatt-band>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (8 Tests). `hooks/limits.ts` liegt gleichlautend auch in den Mods `statistik` und `limitpause`; beim Ändern alle drei Kopien gleich halten.

Lizenz: MIT.
