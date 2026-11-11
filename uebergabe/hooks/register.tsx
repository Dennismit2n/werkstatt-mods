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
const turnsSince = atom({ plugin: 'uebergabe', key: 'turnsSince' } as const, 0)
const isStatusAsked = atom({ plugin: 'uebergabe', key: 'isStatusAsked' } as const, false)

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

// Die bereitliegende Übergabe nachziehen: Claude ergänzt dieselbe Datei um das,
// was seit dem Schreiben passiert ist. Der Pfad bleibt im Zustand; daran erkennt
// das Band „wird aktualisiert“ und eine Antwort ohne Pfadzeile fällt auf die alte
// Übergabe zurück statt auf Anfang.
async function requestUpdate($: EngineInterface, path: string) {
  if ((await read($, phase)) === 'writing') return
  await update($, phase, () => 'writing')
  const text = t()
  submitSoon($, text.updateInstruction(path), why => {
    void update($, phase, () => 'ready')
    $.ui.toast(text.failed(why))
  })
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

    await $.command.register({
      name: 'stand',
      description: t().statusDescription,
    })

    return next(e)
  })

  on('command.run', { command: 'uebergabe' }, async $ => {
    const isStarted = await requestHandoff($)

    return { text: isStarted ? t().started : t().busy }
  })

  // /stand: die kurze Auskunft, wo die Sitzung steht. Keine Datei, nur eine
  // Antwort im Chat; sie zählt nicht als Weiterarbeit nach einer Übergabe.
  on('command.run', { command: 'stand' }, async $ => {
    const text = t()
    if ((await read($, phase)) === 'writing') return { text: text.statusBusy }
    await update($, isStatusAsked, () => true)
    submitSoon($, text.statusInstruction, why => {
      void update($, isStatusAsked, () => false)
      $.ui.toast(text.statusFailed(why))
    })

    return { text: text.statusStarted }
  })

  // Nach jeder Antwort der Hauptsitzung: Kontext messen und, wenn gerade eine
  // Übergabe geschrieben wurde, ihren Pfad aus der letzten Zeile lesen.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await measure($)
      const now = await read($, phase)
      const wasStatus = await read($, isStatusAsked)
      if (wasStatus) await update($, isStatusAsked, () => false)
      if (wasStatus && now !== 'writing') {
        // Nur die Auskunft von /stand: nichts zu lesen, nichts zu zählen.
      } else if (now === 'writing') {
        const path = pathFrom(e.answer)
        const old = await read($, file)
        if (path !== null) {
          await update($, file, () => path)
          await update($, turnsSince, () => 0)
          await update($, phase, () => 'ready')
        } else if (old !== null) {
          // Ein Nachziehen ohne Pfadzeile oder abgebrochen: Die alte Übergabe bleibt, weiter veraltet.
          await update($, turnsSince, n => n + 1)
          await update($, phase, () => 'ready')
          if (!e.isAborted) $.ui.toast(t().noMarkerUpdate)
        } else if (!e.isAborted && e.answer.trim() !== '') {
          // Eine Antwort ohne Pfadzeile: zurück auf Anfang, mit Hinweis.
          await update($, phase, () => 'idle')
          $.ui.toast(t().noMarker)
        }
      } else if (now === 'ready' && !(e.isAborted && e.answer.trim() === '')) {
        // Nach dem Schreiben wurde weitergearbeitet: Die Übergabe kennt diese Antwort nicht.
        await update($, turnsSince, n => n + 1)
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
    const since = await read($, turnsSince)
    const { Box, Text, Button } = $.ui.resolve(e)
    const text = t()

    const line = (() => {
      if (now === 'ready' && path !== null) {
        const isStale = since > 0
        return (
          <Box key="uebergabe" flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
            <Text size={SIZE} color={isStale ? AMBER : GREEN} wrap="truncate-end">
              {isStale ? text.stale(baseName(path), since) : text.ready(baseName(path))}
            </Text>
            {isStale ? (
              <Button key="uebergabe-update" plain onPress={() => void requestUpdate($, path)}>
                <Text size={SIZE} color={AMBER} weight="semibold">
                  {text.refresh}
                </Text>
              </Button>
            ) : null}
            <Button
              key="uebergabe-start"
              plain
              onPress={() => {
                submitSoon($, text.startNewPrompt(path), why => $.ui.toast(text.failed(why)))
                void update($, phase, () => 'idle')
              }}
            >
              {isStale ? (
                <Text size={SIZE} dimColor>
                  {text.startNew}
                </Text>
              ) : (
                <Text size={SIZE} color={GREEN} weight="semibold">
                  {text.startNew}
                </Text>
              )}
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
              {path === null ? text.writing : text.updating}
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
