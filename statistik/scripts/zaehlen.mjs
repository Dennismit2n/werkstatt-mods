// Wertet die Gesprächsdateien unter ~/.claude/projects aus und schreibt die
// Statistik als JSON auf stdout. Pro Datei wird ein Zwischenergebnis nach
// Größe + Änderungszeit zwischengespeichert, damit nur Neues gelesen wird.
import { createReadStream } from 'node:fs'
import { readdir, stat, readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const ROOT = join(homedir(), '.claude', 'projects')
const CACHE = join(homedir(), '.claude', 'cache', 'statistik-mod.json')
const CACHE_VERSION = 2
const LOTR_TOKENS = 576_000
// Zählwerk: ein Block beginnt mit der ersten Antwort und läuft fünf Stunden.
const BLOCK_MS = 5 * 3600 * 1000

async function* jsonlFiles(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* jsonlFiles(path)
    else if (entry.name.endsWith('.jsonl')) yield path
  }
}

const pad = n => String(n).padStart(2, '0')
const dayOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Ein Zwischenergebnis je Datei: Tage mit Nachrichten, Token je Modell, Stunden,
// und für das Zählwerk jede Antwort als [Zeit ms, Modell, echt, Cache gelesen].
async function scanFile(path) {
  const days = {}
  const answers = []
  const seen = new Set()
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if ((row.type !== 'user' && row.type !== 'assistant') || !row.timestamp) continue
    const msg = row.message ?? {}
    if (row.type === 'assistant') {
      // Eine Antwort steht oft in mehreren Zeilen mit derselben id.
      const id = msg.id ?? row.uuid
      if (seen.has(id)) continue
      seen.add(id)
    }
    const when = new Date(row.timestamp)
    if (Number.isNaN(when.getTime())) continue
    const key = dayOf(when)
    const day = (days[key] ??= { m: 0, h: {}, mo: {} })
    day.m++
    day.h[when.getHours()] = (day.h[when.getHours()] ?? 0) + 1
    const u = msg.usage
    if (row.type === 'assistant' && u && msg.model && msg.model !== '<synthetic>') {
      const real =
        (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      const cacheRead = u.cache_read_input_tokens ?? 0
      day.mo[msg.model] = (day.mo[msg.model] ?? 0) + real + cacheRead
      answers.push([when.getTime(), msg.model, real, cacheRead])
    }
  }
  return { days, answers }
}

async function loadCache() {
  try {
    const cache = JSON.parse(await readFile(CACHE, 'utf8'))
    if (cache.version === CACHE_VERSION) return cache.files
  } catch {}
  return {}
}

function modelName(id) {
  const m = id.match(/claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1)
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`
}

function summarize(files, fromDay) {
  let sessions = 0
  let messages = 0
  const activeDays = new Set()
  const hours = new Array(24).fill(0)
  const models = {}
  for (const file of Object.values(files)) {
    let touched = false
    for (const [day, d] of Object.entries(file.days)) {
      if (fromDay && day < fromDay) continue
      touched = true
      messages += d.m
      activeDays.add(day)
      for (const [h, n] of Object.entries(d.h)) hours[h] += n
      for (const [model, t] of Object.entries(d.mo)) {
        const name = modelName(model)
        models[name] = (models[name] ?? 0) + t
      }
    }
    if (touched && !file.isSub) sessions++
  }
  const tokens = Object.values(models).reduce((a, b) => a + b, 0)
  const modelList = Object.entries(models)
    .map(([name, t]) => ({ name, tokens: t }))
    .sort((a, b) => b.tokens - a.tokens)
  const peak = hours.indexOf(Math.max(...hours))
  return {
    sessions,
    messages,
    tokens,
    activeDays: activeDays.size,
    peakHour: messages ? peak : null,
    favorite: modelList[0]?.name ?? null,
    models: modelList,
    lotr: Math.round(tokens / LOTR_TOKENS),
  }
}

// Wie der Zählwerk Ticker: die Kette der Fünf-Stunden-Blöcke über den ganzen
// Verlauf, der zuletzt begonnene ist der laufende. Anthropic dokumentiert die
// Grenzen nicht, deshalb heißt es in der Anzeige „geschätzt“.
function zaehlwerk(files, now) {
  const answers = Object.values(files)
    .flatMap(file => file.answers)
    .sort((a, b) => a[0] - b[0])
  let von = null
  let bis = null
  for (const [t] of answers) {
    if (bis === null || t > bis) {
      von = t
      bis = t + BLOCK_MS
    }
  }
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const sum = list => ({
    echt: list.reduce((a, x) => a + x[2], 0),
    cache: list.reduce((a, x) => a + x[3], 0),
    anzahl: list.length,
  })
  const block = von === null ? [] : answers.filter(([t]) => t >= von && t <= bis)
  const heute = answers.filter(([t]) => t >= midnight)
  const models = {}
  for (const [, model, real] of block.length ? block : heute) {
    const name = modelName(model)
    models[name] = (models[name] ?? 0) + real
  }
  return {
    block: sum(block),
    blockVon: von,
    blockBis: bis,
    blockVonText: von === null ? null : `${pad(new Date(von).getHours())}:${pad(new Date(von).getMinutes())}`,
    heute: sum(heute),
    modelle: Object.entries(models)
      .map(([name, echt]) => ({ name, echt }))
      .sort((a, b) => b.echt - a.echt),
  }
}

const cached = await loadCache()
const files = {}
let read = 0
for await (const path of jsonlFiles(ROOT)) {
  let info
  try {
    info = await stat(path)
  } catch {
    continue
  }
  const sig = `${info.size}:${Math.floor(info.mtimeMs)}`
  const isSub = /[\\/]subagents[\\/]/.test(path)
  if (cached[path]?.sig === sig) {
    files[path] = cached[path]
    continue
  }
  files[path] = { sig, isSub, ...(await scanFile(path)) }
  read++
}
if (read > 0) {
  // Erst daneben schreiben, dann umbenennen: Jede offene Sitzung rechnet für
  // sich, und ein halb geschriebener Zwischenspeicher hieße für die nächste
  // „alles neu lesen“ (rund 5.000 Dateien). Klappt das Umbenennen nicht, weil
  // gerade eine andere Sitzung schreibt, bleibt deren Fassung stehen.
  const draft = `${CACHE}.${process.pid}.tmp`
  try {
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(draft, JSON.stringify({ version: CACHE_VERSION, files }))
    await rename(draft, CACHE)
  } catch {
    await rm(draft, { force: true }).catch(() => {})
  }
}

const today = new Date()
const back = n => dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n))
const perDay = {}
for (const file of Object.values(files))
  for (const [day, d] of Object.entries(file.days)) perDay[day] = (perDay[day] ?? 0) + d.m

process.stdout.write(
  JSON.stringify({
    at: today.toISOString(),
    now: today.getTime(),
    today: dayOf(today),
    stand: `${pad(today.getHours())}:${pad(today.getMinutes())}`,
    filesRead: read,
    filesTotal: Object.keys(files).length,
    ranges: {
      all: summarize(files, null),
      d30: summarize(files, back(29)),
      d7: summarize(files, back(6)),
    },
    perDay,
    zaehlwerk: zaehlwerk(files, today),
  }),
)
