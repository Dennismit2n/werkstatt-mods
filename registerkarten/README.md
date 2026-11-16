# registerkarten

Farbige Reiter für die Seitenleiste im Code-Tab der Desktop-App: Jeder eigene Abschnitt bekommt nach Thema einen Farbpunkt vor den Namen, wie bunte Registerkarten im Ordner. So stehen Web-Werkzeuge, Windows-Programme, Mods, Spiele und Anleitungen sichtbar beieinander. Texte auf Deutsch oder Englisch.

## Wie es arbeitet

- Die App kennt keine Farbe je Abschnitt. Darum setzt die Mod einen Farbpunkt (🔵 🟢 🟣 🟠 🔴 🟡 🟤 ⚫ ⚪) vorn in den Namen. Klein und farbig, auch in der eingeklappten Leiste zu sehen.
- Welcher Punkt, entscheiden Regeln aus Stichwörtern. Die erste passende Regel gewinnt:

  | Punkt | Thema | Stichwörter (Auswahl) |
  | --- | --- | --- |
  | 🟣 | Claude, Mods, Skills | claude, mod, skill, prompt, plugin, mcp, agent, editor |
  | 🟢 | Windows-Programme | windows, exe, desktop, overlay, monitor, ticker, netzwerk |
  | 🟠 | Spiele | spiel, game, gaming, flipper, schach, minecraft, puzzle |
  | 🔴 | Anleitungen und Wissen | anleitung, doku, wissen, notiz, obsidian, cloud, guide |
  | 🔵 | Web und Seiten | web, seite, site, pwa, app, startseite, readme, design |

- Ein Abschnitt, der schon einen Punkt oder ein anderes Emoji vorn trägt (🟥, 🎮, ⭐), wird nie von selbst angefasst. Deine eigene Wahl bleibt also stehen.
- Ein Stichwort zählt am Anfang oder am Ende eines Wortes: „Rennspiel“ ist ein Spiel, „Beispiele“ nicht.
- Von selbst färbt die Mod beim Start einer Sitzung und danach höchstens alle zehn Minuten nach einer Antwort. Das tut sie nur, wenn die Seitenleisten-Werkzeuge der App (`mcp__ccd_sidebar__list_sections`, `mcp__ccd_sidebar__rename_section`) ohne Rückfrage laufen dürfen. Ohne Freigabe öffnet sie keinen Dialog (siehe Einstellungen).

## Bedienung

- `/registerkarten` zeigt die Legende, wie viele Abschnitte schon einen Reiter haben, welche beim Färben einen bekommen und für welche keine Regel passt.
- `/registerkarten färben` (oder `color`) setzt allen neuen Abschnitten ihren Punkt.
- `/registerkarten 🟠 Strecken` färbt den einen Abschnitt, dessen Name „Strecken“ enthält, auch einen schon gefärbten um.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Meldungen, `de` oder `en` |
| `autoColor` | an | Neue Abschnitte von selbst färben, wenn die Werkzeuge ohne Rückfrage laufen dürfen |
| `rules` | siehe oben | Punkt und Stichwörter, Regeln mit `;` getrennt, etwa `🟠 spiel, game; 🔵 web, seite` |

**Freigabe nötig:** Eine Mod öffnet nie einen Dialog. Ohne Freigabe antwortet die App einer Mod mit „abgelehnt“, und es passiert nichts. Damit die Mod lesen und umbenennen darf, trag die zwei Werkzeuge in `~/.claude/settings.json` ein:

```json
"permissions": { "allow": ["mcp__ccd_sidebar__list_sections", "mcp__ccd_sidebar__rename_section"] }
```

Fehlt die Freigabe zum Umbenennen, zeigt die Mod beim Start einmal, wie viele Abschnitte noch keinen Reiter haben. Fehlt auch die zum Lesen, bleibt sie still; `/registerkarten` sagt dann, was fehlt.

## Grenzen

Nur in der Desktop-App, Code-Tab, mit offenem Fenster; im Terminal gibt es keine Seitenleiste. Die eingebauten Abschnitte (Angeheftet, Routinen, Sitzungen) lassen sich nicht umbenennen und bleiben ohne Punkt. Die Reihenfolge der Abschnitte ändert die Mod nicht, die ziehst du von Hand.

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.325 unter Windows 11.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install registerkarten --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install registerkarten --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu registerkarten>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Änderungen gelten ab der nächsten Sitzung oder nach `/reload-plugins`.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (8 Tests).

Lizenz: MIT.
