import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { int, setLanguage, t } from './text'

// Lange Sitzungen werden teuer und ungenauer. Statt zu komprimieren, schreibt
// Claude eine ausführliche Übergabe und eine frische Sitzung arbeitet damit
// weiter. Die Mod erinnert daran, stößt das Schreiben an und reicht die fertige
// Übergabe an eine neue Sitzung. Sie ruft kein eigenes Modell auf: Die Übergabe
// schreibt das Modell der Sitzung, das den ganzen Verlauf kennt.
const DEFAULT_THRESHOLD = 250_000
const DEFAULT_REMIND_STEP = 50_000

const phase = atom({ plugin: 'uebergabe', key: 'phase' } as const, 'idle')
const file = atom({ plugin: 'uebergabe', key: 'file' } as const, null)
const tokens = atom({ plugin: 'uebergabe', key: 'tokens' } as const, null)
const snoozedUntil = atom({ plugin: 'uebergabe', key: 'snoozedUntil' } as const, 0)

const AMBER = '#c98a3a'
const GREEN = '#5aa846'
const SIZE = 'footnote'

// Einstellungen aus dem Manifest (userConfig), gesetzt in register.
let threshold = DEFAULT_THRESHOLD
let remindStep = DEFAULT_REMIND_STEP
let folder = ''

// Der Pfad aus der letzten Zeile „ÜBERGABE: …“ einer Antwort; null, wenn sie fehlt.
// Beide Sprachen zählen, Backticks und Anführungszeichen um den Pfad fallen weg.
export function pathFrom(answer: string): string | null {
  const lines = answer.split(/\r?\n/).reverse()
  for (const line of lines) {
    const match = line.match(/(?:ÜBERGABE|UEBERGABE|HANDOFF):\s*(.+)$/i)
    if (!match) continue
    const path = (match[1] ?? '').trim().replace(/^[`"'„“<]+|[`"'“”>.]+$/g, '').trim()
    if (path !== '') return path
  }
  return null
}

// Der Dateiname für die Anzeige im Band; der volle Pfad bleibt im Zustand.
export const baseName = (path: string) => path.split(/[\\/]/).pop() || path

// Eine Eingabe absenden, die das Ende des laufenden Hooks überlebt: Die neue
// Runde beginnt erst, wenn die Sitzung frei ist, und ein Befehl oder Knopfdruck
// ist dann längst beantwortet. Deshalb läuft der Aufruf über einen Zeitgeber.
function submitSoon($: EngineInterface, text: string, onError: (why: string) => void) {
  $.clock.after(1, () => {
    void $.prompt.submit({ text, asUser: true }).catch(err => onError(err instanceof Error ? err.message : String(err)))
  })
}

async function measure($: EngineInterface) {
  const usage = await $.session.usage()
  const context = usage.context
  const now = context.tokens ?? (context.percent === undefined ? null : Math.round((context.percent / 100) * context.window))
  if (now !== null) await update($, tokens, () => now)
}

async function requestHandoff($: EngineInterface) {
  if ((await read($, phase)) === 'writing') return false
  await update($, phase, () => 'writing')
  await update($, file, () => null)
  const text = t()
  const where = folder === '' ? text.whereDefault : text.whereFolder(folder)
  submitSoon($, text.instruction(where), why => {
    void update($, phase, () => 'idle')
    $.ui.toast(text.failed(why))
  })
  return true
}

export const register: Register = (on, options) => {
  setLanguage(options.language)
  threshold =
    typeof options.thresholdTokens === 'number' && options.thresholdTokens >= 0 ? options.thresholdTokens : DEFAULT_THRESHOLD
  remindStep = typeof options.remindStep === 'number' && options.remindStep > 0 ? options.remindStep : DEFAULT_REMIND_STEP
  folder = typeof options.folder === 'string' ? options.folder.trim() : ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'uebergabe',
      description: t().commandDescription,
    })

    return next(e)
  })

  on('command.run', { command: 'uebergabe' }, async $ => {
    const isStarted = await requestHandoff($)

    return { text: isStarted ? t().started : t().busy }
  })

  // Nach jeder Antwort der Hauptsitzung: Kontext messen und, wenn gerade eine
  // Übergabe geschrieben wurde, ihren Pfad aus der letzten Zeile lesen.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await measure($)
      if ((await read($, phase)) === 'writing') {
        const path = pathFrom(e.answer)
        if (path !== null) {
          await update($, file, () => path)
          await update($, phase, () => 'ready')
        } else if (!e.isAborted && e.answer.trim() !== '') {
          // Eine Antwort ohne Pfadzeile: zurück auf Anfang, mit Hinweis.
          await update($, phase, () => 'idle')
          $.ui.toast(t().noMarker)
        }
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Erst die anderen Mods und die Engine zeichnen lassen; die eigene Zeile steht darüber.
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const now = await read($, phase)
    const path = await read($, file)
    const used = await read($, tokens)
    const snooze = await read($, snoozedUntil)
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()

    const line = (() => {
      if (now === 'ready' && path !== null) {
        return (
          <Box key="uebergabe" flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
            <Text size={SIZE} color={GREEN} wrap="truncate-end">
              {text.ready(baseName(path))}
            </Text>
            <Button
              key="uebergabe-start"
              variant="primary"
              onPress={() => {
                submitSoon($, text.startNewPrompt(path), why => $.ui.toast(text.failed(why)))
                void update($, phase, () => 'idle')
              }}
            >
              <Text size={SIZE}>{text.startNew}</Text>
            </Button>
            <Button
              key="uebergabe-copy"
              plain
              dimColor
              onPress={() =>
                void $.ui
                  .copy({ text: path, surface: e.surface })
                  .then(done => $.ui.toast(done.isCopied ? text.copied : text.notCopied(path)))
                  .catch(() => $.ui.toast(text.notCopied(path)))
              }
            >
              <Text size={SIZE}>{text.copyPath}</Text>
            </Button>
            <Button key="uebergabe-close" plain dimColor onPress={() => void update($, phase, () => 'idle')}>
              <Text size={SIZE}>{text.dismiss}</Text>
            </Button>
          </Box>
        )
      }
      if (now === 'writing') {
        return (
          <Box key="uebergabe" flexDirection="row">
            <Text size={SIZE} color={AMBER}>
              {text.writing}
            </Text>
          </Box>
        )
      }
      if (threshold > 0 && used !== null && used >= threshold && used >= snooze) {
        return (
          <Box key="uebergabe" flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
            <Text size={SIZE} color={AMBER} wrap="truncate-end">
              {text.hint(int(used))}
            </Text>
            <Button key="uebergabe-write" onPress={() => void requestHandoff($)}>
              <Text size={SIZE}>{text.write}</Text>
            </Button>
            <Button key="uebergabe-later" plain dimColor onPress={() => void update($, snoozedUntil, () => used + remindStep)}>
              <Text size={SIZE}>{text.later}</Text>
            </Button>
          </Box>
        )
      }
      return null
    })()

    if (line === null) return rest
    return (
      <Box flexDirection="column">
        {line}
        {rest}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
