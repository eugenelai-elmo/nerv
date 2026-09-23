#!/usr/bin/env npx tsx
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { decide, loadDecision, listDecisions } from '../lib/decide.js'
import { trace, now } from '../lib/trace.js'
import type { DecisionDefinition } from '../lib/types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const subcommand = args[0] ?? 'help'

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f]|\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

function formatType(type: string): string {
  switch (type) {
    case 'noul': return 'boolean probability'
    case 'choice': return 'pick one'
    case 'score': return 'ordered level'
    default: return type
  }
}

async function printList() {
  const names = await listDecisions()
  console.log(`\n\x1b[1m${names.length} decisions available\x1b[0m\n`)

  for (const name of names) {
    const def = await loadDecision(name)
    const provider = def.provider ? `\x1b[90m(via ${def.provider})\x1b[0m` : '\x1b[90m(via global chain)\x1b[0m'
    const dims = def.dimensions.map(d => d.name).join(', ')
    console.log(`  \x1b[36m${name.padEnd(24)}\x1b[0m ${def.description}`)
    console.log(`  ${' '.repeat(24)} dims: ${dims} ${provider}`)
    console.log('')
  }
}

async function printHelp(name: string) {
  let def: DecisionDefinition
  try {
    def = await loadDecision(name)
  } catch {
    console.error(`Decision "${name}" not found. Run: nerv decide list`)
    process.exit(1)
  }

  console.log(`\n\x1b[1m${def.name}\x1b[0m`)
  console.log(`${def.description}\n`)

  if (def.provider) {
    console.log(`Provider: ${def.provider}`)
  } else {
    console.log('Provider: global scorer chain')
  }

  if (def.thresholds && Object.keys(def.thresholds).length > 0) {
    console.log(`Thresholds: ${Object.entries(def.thresholds).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }

  console.log(`\n\x1b[1mDimensions\x1b[0m (${def.dimensions.length}):\n`)

  for (const dim of def.dimensions) {
    const q = dim.question
    console.log(`  \x1b[36m${dim.name}\x1b[0m  (${formatType(q.type)})`)
    console.log(`    ${q.instructions}`)

    if (q.type === 'choice' && 'criteria' in q && typeof q.criteria === 'object' && !Array.isArray(q.criteria)) {
      for (const [key, desc] of Object.entries(q.criteria as Record<string, string>)) {
        console.log(`      • ${key}${desc ? ` — ${desc}` : ''}`)
      }
    } else if (q.type === 'score' && 'criteria' in q && Array.isArray(q.criteria)) {
      const criteria = q.criteria as string[]
      console.log(`      ${criteria.join(' → ')}`)
    }
    console.log('')
  }

  console.log('Usage:')
  console.log(`  nerv decide ${name} "<state description>"`)
  console.log('')
}

async function runDecision(name: string, state: string) {
  let def: DecisionDefinition
  try {
    def = await loadDecision(name)
  } catch {
    console.error(`Decision "${name}" not found. Run: nerv decide list`)
    process.exit(1)
  }

  const start = performance.now()
  const result = await decide(name, state)

  await trace({
    ts: now(),
    hook: 'decide-cli',
    layer: 'L6:Decisions+L1:Scorer',
    decision: name,
    provider: result.provider,
    latencyMs: result.latencyMs,
    result: result.decision,
    prompt_len: state.length,
  })

  console.log(`\n\x1b[1m${name}\x1b[0m  →  \x1b[32m${stripAnsi(result.decision)}\x1b[0m  \x1b[90m(${result.latencyMs}ms via ${result.provider})\x1b[0m\n`)

  for (const s of result.scores) {
    const val = typeof s.answer === 'boolean' ? (s.answer ? 'yes' : 'no') : String(s.answer)
    const conf = s.confidence > 0 ? ` \x1b[90m(${(s.confidence * 100).toFixed(0)}% conf)\x1b[0m` : ''
    console.log(`  ${s.name.padEnd(22)} ${stripAnsi(val)}${conf}`)

    if (Object.keys(s.probabilities).length > 0) {
      const sorted = Object.entries(s.probabilities).sort((a, b) => b[1] - a[1])
      const top = sorted.slice(0, 4)
      const bar = top.map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`).join('  ')
      console.log(`  ${' '.repeat(22)} \x1b[90m${bar}\x1b[0m`)
    }
  }

  console.log('')
}

if (subcommand === 'list') {
  await printList()
} else if (args.length === 2 && args[1] === '--help') {
  await printHelp(args[0])
} else if (args.length >= 2) {
  const name = args[0]
  const state = args.slice(1).join(' ')
  await runDecision(name, state)
} else if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
  console.log(`\x1b[1mnerv decide\x1b[0m — on-demand decision scoring via Jev/Laya\n`)
  console.log('Commands:')
  console.log('  list                       List all available decisions')
  console.log('  <name> --help              Show decision dimensions and criteria')
  console.log('  <name> "<state>"           Run a decision against a state description')
  console.log('')
  console.log('Examples:')
  console.log('  nerv decide list')
  console.log('  nerv decide risk-gate --help')
  console.log('  nerv decide risk-gate "git push --force origin main"')
  console.log('  nerv decide task-delegation "QA found a bug in the login flow"')
  console.log('  nerv decide pr-file-triage "src/auth/middleware.ts — added OAuth scope check"')
  console.log('')
} else {
  console.error(`Unknown decision: "${subcommand}". Run: nerv decide list`)
  process.exit(1)
}
