#!/usr/bin/env npx tsx
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { TraceEntry } from '../lib/trace.js'

const TRACE_FILE = join(homedir(), '.cache', 'nerv', 'trace.jsonl')
const OUTPUT_DIR = join(homedir(), 'projects', 'nerv', 'training-data')

interface TrainingExample {
  state: string
  decision: string
  label: string
  provider: string
  confidence?: number
  timestamp: string
}

async function loadTraceEntries(): Promise<TraceEntry[]> {
  try {
    const raw = await readFile(TRACE_FILE, 'utf-8')
    return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as TraceEntry)
  } catch {
    return []
  }
}

const args = process.argv.slice(2)
const subcommand = args[0] ?? 'export'

if (subcommand === 'export') {
  const entries = await loadTraceEntries()

  const decisionEntries = entries.filter(e =>
    e.hook === 'decide' && e.decision && e.result && e.provider
  )

  if (decisionEntries.length === 0) {
    console.log('No decision entries in trace log yet. Use NERV normally — decisions are traced automatically.')
    process.exit(0)
  }

  const examples: TrainingExample[] = decisionEntries.map(e => ({
    state: `[prompt_len=${e.prompt_len ?? 0}]`,
    decision: e.decision!,
    label: e.result!,
    provider: e.provider!,
    timestamp: e.ts,
  }))

  // Split by provider — Jev-scored examples are ground truth labels
  const jevLabeled = examples.filter(e => e.provider.includes('jev') || e.provider.includes('typesafe'))
  const layaLabeled = examples.filter(e => e.provider.includes('laya'))

  await mkdir(OUTPUT_DIR, { recursive: true })

  const exportPath = join(OUTPUT_DIR, `decisions-${new Date().toISOString().split('T')[0]}.jsonl`)
  const lines = examples.map(e => JSON.stringify(e)).join('\n') + '\n'
  await writeFile(exportPath, lines, 'utf-8')

  console.log(`\x1b[1mTraining Data Export\x1b[0m`)
  console.log(`  Total decision entries: ${examples.length}`)
  console.log(`  Jev-labeled (ground truth): ${jevLabeled.length}`)
  console.log(`  Laya-labeled: ${layaLabeled.length}`)
  console.log(``)

  // Group by decision name
  const byDecision = new Map<string, number>()
  for (const e of examples) {
    byDecision.set(e.decision, (byDecision.get(e.decision) ?? 0) + 1)
  }

  console.log(`\x1b[1mBy Decision\x1b[0m`)
  for (const [name, count] of byDecision) {
    const jev = examples.filter(e => e.decision === name && e.provider.includes('jev')).length
    console.log(`  ${name.padEnd(25)} ${String(count).padStart(4)} total (${jev} jev-labeled)`)
  }

  console.log(`\n  Exported to: ${exportPath}`)

  const MIN_FOR_FINETUNE = 200
  if (jevLabeled.length < MIN_FOR_FINETUNE) {
    console.log(`\n\x1b[33m  Need ~${MIN_FOR_FINETUNE} Jev-labeled examples for fine-tuning, have ${jevLabeled.length}.\x1b[0m`)
    console.log(`\x1b[33m  Keep using NERV normally — trace logging collects training data automatically.\x1b[0m`)
  } else {
    console.log(`\n\x1b[32m  ${jevLabeled.length} Jev-labeled examples — enough for a fine-tuning run.\x1b[0m`)
  }
}

if (subcommand === 'stats') {
  const entries = await loadTraceEntries()
  const decisions = entries.filter(e => e.hook === 'decide')
  console.log(`${decisions.length} decision entries in trace log`)
  const byProvider = new Map<string, number>()
  for (const e of decisions) {
    const p = e.provider ?? 'unknown'
    byProvider.set(p, (byProvider.get(p) ?? 0) + 1)
  }
  for (const [p, c] of byProvider) {
    console.log(`  ${p}: ${c}`)
  }
}

if (!['export', 'stats'].includes(subcommand)) {
  console.log('Usage: nerv export-training [export|stats]')
  console.log('  export — extract labeled training data from trace log')
  console.log('  stats  — show decision entry counts by provider')
}
