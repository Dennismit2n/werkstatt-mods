# statistik

Seitenleiste „Statistik“ für Claude Code: Nutzungsstatistik, Limits und Zählwerk neben dem Chat. Entstanden als Ersatz für die Statistik-Karte, die der Startbildschirm der Desktop-App seit Oktober 2026 nicht mehr lädt. Texte auf Deutsch oder Englisch.

## Was die Leiste zeigt

- **Statistik**: Sitzungen, Nachrichten, Token, aktive Tage, Stoßzeit und meistgenutztes Modell, umschaltbar zwischen Alle, 30 T und 7 T. Dazu ein Kalender der letzten 26 Wochen (Nachrichten je Tag) und der Reiter „Modelle“ mit Token je Modell. Zum Vergleich steht dabei, wie oft „Der Herr der Ringe“ in den Token steckt.
- **Limits**: 5-Stunden-Fenster, Woche, Woche je Modell, Nutzungsguthaben und Kontext, jeweils mit Balken und Zeit bis zur Freigabe. Quelle ist das App-Werkzeug `get_usage` der Desktop-App: offiziell, nur lesend, kein Cookie, kein Abruf von außen. Im Terminal bleiben die zwei Fenster, die die Engine selbst kennt.
- **Zählwerk**: der laufende Fünf-Stunden-Block (geschätzt, als Kette aller Antworten über den ganzen Verlauf), Heute und Token je Modell im Block. Hauptzahl ist Eingabe + Ausgabe + Cache-Aufbau; gelesener Cache steht extra.

Alle drei Teile klappen einzeln ein. Die Zahlen rechnet `scripts/zaehlen.mjs` jede Minute aus den Gesprächsdateien unter `~/.claude/projects`, mit Zwischenspeicher in `~/.claude/cache/statistik-mod.json`. Der erste Lauf dauert je nach Verlauf etwa 20 Sekunden, danach unter einer Sekunde. Subagenten zählen mit, deshalb liegen die Zahlen über denen der alten Karte.

## Bedienung

- `/statistik` öffnet die Leiste. Beim Start einer Sitzung geht sie von selbst auf (Einstellung `autoOpen`).
- Der Knopf „Statistik“ im Band der Mod `werkstatt-band` klappt sie auf und zu (nur zusammen mit dieser Mod).
- ↻ in der Fußzeile rechnet sofort neu.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache der Leiste, `de` oder `en`; auch Zahlen und Zeiten folgen ihr (12.345 / 12,345) |
| `autoOpen` | an | Die Leiste beim Start jeder Sitzung öffnen |

## Voraussetzungen

- Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.309.
- Node.js im PATH, für das Rechenskript.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install statistik --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install statistik --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu statistik>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (5 Tests). `hooks/limits.ts` liegt gleichlautend auch in den Mods `werkstatt-band` und `limitpause`; beim Ändern alle drei Kopien gleich halten.

Lizenz: MIT.
