# uebergabe

Lange Sitzungen werden teuer und ungenauer. Statt den Verlauf zu komprimieren, lässt diese Mod Claude eine ausführliche Übergabe schreiben und startet damit eine frische Sitzung. Sie ruft kein eigenes Modell auf: Die Übergabe schreibt das Modell der Sitzung, das den ganzen Verlauf kennt. Angeregt durch die Mod Handoff von Ben AI. Texte auf Deutsch oder Englisch.

## Was die Mod tut

- **Erinnern:** Nach jeder Antwort misst sie den Kontext. Ab der Grenze (Standard 250.000 Token) steht über dem Eingabefeld „Kontext bei 262.000 Token: Zeit für eine Übergabe an eine frische Sitzung?“ mit den Knöpfen „Übergabe schreiben“ und „Später“. „Später“ blendet den Hinweis aus, bis der Kontext um weitere 50.000 Token gewachsen ist.
- **Schreiben:** Der Knopf oder `/uebergabe` schickt Claude einen festen Auftrag: Ziel und Anlass, Stand, Entscheidungen, jede berührte Datei mit Pfad, benutzte Skills und Links, offene Punkte, Fallen und die Regeln des Nutzers, als Markdown-Datei. Die letzte Zeile der Antwort nennt den Pfad („ÜBERGABE: …“); daran erkennt die Mod, dass die Übergabe fertig ist.
- **Weiterreichen:** Danach steht im Band „Übergabe liegt bereit“ mit den Knöpfen „Neue Sitzung starten“ (Claude startet eine Sitzung, die zuerst die Übergabe liest), „Pfad kopieren“ und „Schließen“.
- **Nachziehen:** Arbeitest du nach dem Schreiben in derselben Sitzung weiter, kennt die Übergabe das nicht mehr. Das Band zeigt dann „Übergabe veraltet: …, seitdem 2 Antworten weitergearbeitet“ mit dem Knopf „Aktualisieren“. Er lässt Claude dieselbe Datei auf den Stand bringen: Die betroffenen Abschnitte werden geändert, es wird kein Nachtrag angehängt. Danach liegt sie wieder bereit.

Der Auftrag an Claude, das Aktualisieren und die neue Sitzung sind gewöhnliche Eingaben in deinem Namen; sie zählen wie jede andere Nachricht gegen dein Kontingent.

## Bedienung

- `/uebergabe` fordert die Übergabe jederzeit an, auch unter der Grenze.
- `/stand` holt eine kurze Auskunft in den Chat, ohne Datei: Fertig, Angefangen, Nicht gespeichert, Wartet auf dich, Nächster Schritt. Gedacht für den Moment, in dem du in eine Sitzung zurückkommst und nicht mehr weißt, was gemacht ist und wo es weitergeht. Claude schaut dafür nur lesend nach und fängt danach nicht von selbst an zu arbeiten. Die Auskunft lässt eine bereitliegende Übergabe nicht veralten.
- Die Knöpfe im Band über dem Eingabefeld.

## Einstellungen

Beim Installieren fragt Claude Code danach, später änderbar in `/config`:

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `language` | `de` | Sprache des Bands und der Übergabe, `de` oder `en` |
| `thresholdTokens` | `250000` | Ab so vielen Token im Kontext erscheint der Hinweis; `0` schaltet ihn ab |
| `remindStep` | `50000` | Nach „Später“ erscheint der Hinweis wieder, wenn der Kontext um so viele Token gewachsen ist |
| `folder` | leer | Ordner für die Übergaben; leer heißt: dort, wo deine eigenen Regeln Übergaben ablegen, sonst `uebergaben` im Arbeitsordner |

## Voraussetzungen

Claude Code ab 2.1.287 (Mods sind Early Access), geprüft mit der Desktop-App 2.1.321 unter Windows 11. „Neue Sitzung starten“ braucht die Desktop-App; im Terminal nennt Claude stattdessen den nächsten Schritt.

## Installation

Im Terminal, am Prompt von Claude Code:

```
/plugin install uebergabe --marketplace Dennismit2n/werkstatt-mods
```

Aus der Shell: `claude plugin install uebergabe --marketplace Dennismit2n/werkstatt-mods`. In der Desktop-App: + neben dem Eingabefeld, dann Plugins, Marketplace hinzufügen mit `Dennismit2n/werkstatt-mods`, dann das Plugin hinzufügen. Beim ersten Mal fragt Claude Code `Add marketplace?` (y) und nach den Einstellungen oben.

Zum Entwickeln aus einem Ordner: `claude --plugin-dir <Pfad zu uebergabe>`, oder den Pfad in `~/.claude/settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` eintragen (mehrere Pfade unter Windows mit `;` trennen). Die Desktop-App lädt Mods beim Start einer Sitzung; Änderungen gelten ab der nächsten Sitzung.

## Prüfen

`claude plugin validate <Ordner>` und `claude plugin test <Ordner>` (8 Tests).

Lizenz: MIT.
