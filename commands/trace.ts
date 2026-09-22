#!/usr/bin/env npx tsx
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { TraceEntry } from '../lib/trace.js'

const TRACE_FILE = join(homedir(), '.cache', 'nerv', 'trace.jsonl')
const args = process.argv.slice(2)
const subcommand = args[0] ?? 'show'

async function loadEntries(): Promise<TraceEntry[]> {
  try {
    const raw = await readFile(TRACE_FILE, 'utf-8')
    return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as TraceEntry)
  } catch {
    return []
  }
}

if (subcommand === 'show' || subcommand === 'tail') {
  const entries = await loadEntries()
  const count = parseInt(args[1] ?? '20', 10)
  const recent = entries.slice(-count)

  if (recent.length === 0) {
    console.log('No trace entries yet. Hooks will log to ~/.cache/nerv/trace.jsonl')
    process.exit(0)
  }

  console.log(`\x1b[1mNERV Trace — last ${recent.length} of ${entries.length} entries\x1b[0m\n`)
  for (const e of recent) {
    const time = e.ts.split('T')[1]?.slice(0, 8) ?? e.ts
    const latency = e.latencyMs !== undefined ? `${e.latencyMs}ms` : ''
    const decision = e.decision ? `[${e.decision}]` : ''
    const provider = e.provider ? `via ${e.provider}` : ''
    const result = e.result ?? ''
    const matched = e.matched === false ? '\x1b[90m(no match)\x1b[0m' : ''

    console.log(`  ${time}  \x1b[36m${e.hook.padEnd(16)}\x1b[0m ${e.layer.padEnd(22)} ${decision} ${result} ${provider} ${latency} ${matched}`.trimEnd())
  }
}

if (subcommand === 'stats') {
  const entries = await loadEntries()
  if (entries.length === 0) {
    console.log('No trace entries yet.')
    process.exit(0)
  }

  const byHook = new Map<string, { count: number; totalMs: number; matches: number }>()
  const byLayer = new Map<string, number>()
  const byDecision = new Map<string, { count: number; totalMs: number }>()
  const byProvider = new Map<string, number>()

  for (const e of entries) {
    const h = byHook.get(e.hook) ?? { count: 0, totalMs: 0, matches: 0 }
    h.count++
    h.totalMs += e.latencyMs ?? 0
    if (e.matched) h.matches++
    byHook.set(e.hook, h)

    byLayer.set(e.layer, (byLayer.get(e.layer) ?? 0) + 1)

    if (e.decision) {
      const d = byDecision.get(e.decision) ?? { count: 0, totalMs: 0 }
      d.count++
      d.totalMs += e.latencyMs ?? 0
      byDecision.set(e.decision, d)
    }

    if (e.provider) {
      byProvider.set(e.provider, (byProvider.get(e.provider) ?? 0) + 1)
    }
  }

  const first = entries[0].ts.split('T')[0]
  const last = entries[entries.length - 1].ts.split('T')[0]

  console.log(`\x1b[1mNERV Trace Stats\x1b[0m  (${entries.length} entries, ${first} → ${last})\n`)

  console.log('\x1b[1mBy Hook\x1b[0m')
  for (const [hook, data] of byHook) {
    const avg = data.count > 0 ? Math.round(data.totalMs / data.count) : 0
    const matchRate = data.count > 0 ? Math.round((data.matches / data.count) * 100) : 0
    console.log(`  ${hook.padEnd(20)} ${String(data.count).padStart(4)} calls, avg ${avg}ms, ${matchRate}% match`)
  }

  console.log('\n\x1b[1mBy Layer\x1b[0m')
  for (const [layer, count] of byLayer) {
    console.log(`  ${layer.padEnd(25)} ${count} calls`)
  }

  if (byDecision.size > 0) {
    console.log('\n\x1b[1mBy Decision\x1b[0m')
    for (const [name, data] of byDecision) {
      const avg = data.count > 0 ? Math.round(data.totalMs / data.count) : 0
      console.log(`  ${name.padEnd(25)} ${String(data.count).padStart(4)} calls, avg ${avg}ms`)
    }
  }

  if (byProvider.size > 0) {
    console.log('\n\x1b[1mBy Provider\x1b[0m')
    for (const [provider, count] of byProvider) {
      console.log(`  ${provider.padEnd(25)} ${count} calls`)
    }
  }
}

if (subcommand === 'clear') {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(TRACE_FILE, '', 'utf-8')
  console.log('Trace log cleared.')
}

if (subcommand === 'path') {
  console.log(TRACE_FILE)
}

if (!['show', 'tail', 'stats', 'clear', 'path'].includes(subcommand)) {
  console.log('Usage: nerv trace [show|tail N|stats|clear|path]')
}
