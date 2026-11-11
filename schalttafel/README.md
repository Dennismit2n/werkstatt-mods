# schalttafel

Seitenleiste „Mods“ für Claude Code: alle Mods auf einen Blick, mit Version, Zustand und Befehlen, und ein Schalter je Mod. Angeregt durch die Mod Switchboard von Ben AI. Texte auf Deutsch oder Englisch.

## Was die Leiste zeigt

- Jeden Mod, der über `env.CLAUDE_CODE_PLUGIN_DIRS` aus einem Ordner geladen wird: Name, Version, Beschreibung und die Befehle, die er in dieser Sitzung angemeldet hat.
- Den Zustand: ● aktiv, ○ aus, und wenn du geschaltet hast, „aktiv, ab der nächsten Sitzung aus“ oder „aus, ab der nächsten Sitzung an“.
- Unter „Weitere Plugins“ die Plugins, die in den Einstellungen unter `enabledPlugins` stehen.

## Der Schalter

„Ausschalten“ und „Einschalten“ schreiben den Eintrag `enabledPlugins` in `~/.claude/settings.json` (`"<name>@inline": false` schaltet einen Mod aus einem Ordner ab). Die Mod ändert nur dieses eine Objekt, prüft das Ergebnis gegen das Original und lässt den Rest der Datei Zeichen für Zeichen stehen; lässt sich die Datei nicht sicher ändern, schreibt sie nichts.

Claude Code lädt Mods beim Start einer Sitzung. Ein Schalter gilt deshalb ab der nächsten Sitzung; laufende Sitzungen behalten ihre Mods. Die Schalttafel selbst hat keinen Schalter.

## Bedienung

`/mods` klappt die Leiste auf und zu, „Neu lesen“ liest Ordner und Einstellungen erneut.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Leiste, `de` oder `en` |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.321 unter Windows 11.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install schalttafel --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install schalttafel --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu schalttafel>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (6 Tests).

Lizenz: MIT.
