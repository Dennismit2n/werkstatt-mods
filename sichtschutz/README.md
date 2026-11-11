# sichtschutz

Sichtschutz fürs Bildschirmteilen in Claude Code: Solange er an ist, sind im Verlauf Mailadressen, Telefonnummern, Geldbeträge, IBANs, der Name des Nutzerordners und eigene Wörter geschwärzt. Die Mod ändert nur die Zeichnung; gespeichert und ans Modell gesendet wird weiter das Original. Sie arbeitet mit festen Mustern und ruft kein Modell auf. Angeregt durch die Mod Screen Share Mode von Ben AI. Texte auf Deutsch oder Englisch.

## Was geschwärzt wird

| Muster | Beispiel | Im Verlauf |
| --- | --- | --- |
| Mailadresse | `max@example.org` | `▒▒▒▒▒▒▒▒▒▒▒▒` |
| Telefonnummer | `0151 23456789`, `+49 30 1234567` | `▒▒▒▒▒▒▒▒▒▒▒▒` |
| Betrag mit Währung | `12,50 €`, `$3.81`, `400 EUR` | `▒▒▒▒▒▒▒` |
| IBAN | `DE89 3704 0044 0532 0130 00` | `▒▒▒▒▒▒▒▒▒▒▒▒` |
| Nutzerordner | `C:\Users\name\projekt` | `C:\Users\▒▒▒▒\projekt` |
| Eigene Wörter | ein Kundenname aus der Einstellung | `▒▒▒▒▒▒` |

Geschwärzt werden deine Eingaben, Claudes Antworten, die Ausgaben von Befehlen und die Zeilen von Werkzeugaufrufen samt ihren Ergebnissen. Daten, Uhrzeiten, Versionsnummern und Zahlen ohne Währung bleiben lesbar.

**Grenzen:** Namen erkennt die Mod nicht von selbst; trag sie in der Einstellung „Eigene Wörter“ ein. Seitenleisten anderer Mods und die Titelzeile der App schwärzt sie nicht. Vor einer Aufnahme lohnt ein Blick über den Bildschirm.

## Bedienung

- `/sichtschutz` schaltet um, `/sichtschutz an` und `/sichtschutz aus` schalten gezielt.
- Solange der Sichtschutz an ist, steht über dem Eingabefeld „Sichtschutz an: Der Verlauf ist geschwärzt.“ mit dem Knopf „Ausschalten“.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Meldungen, `de` oder `en` |
| `words` | leer | Namen und Wörter, die zusätzlich geschwärzt werden; Groß- und Kleinschreibung ist egal |
| `maskMoney` | an | Geldbeträge mit Währung schwärzen |
| `startOn` | aus | In jeder neuen Sitzung von Anfang an eingeschaltet |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.321 unter Windows 11.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install sichtschutz --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install sichtschutz --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu sichtschutz>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (7 Tests).

Lizenz: MIT.
