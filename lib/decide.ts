import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { score } from './scorer.js'
import type { DecisionDefinition, DecisionResult, Dimension } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DECISIONS_DIR = join(ROOT, 'decisions')

const cache = new Map<string, DecisionDefinition>()

export async function loadDecision(name: string): Promise<DecisionDefinition> {
  if (cache.has(name)) return cache.get(name)!
  const raw = await readFile(join(DECISIONS_DIR, `${name}.json`), 'utf-8')
  const def = JSON.parse(raw) as DecisionDefinition
  cache.set(name, def)
  return def
}

export async function listDecisions(): Promise<string[]> {
  const files = await readdir(DECISIONS_DIR)
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
}

export async function decide(name: string, state: string): Promise<DecisionResult> {
  const def = await loadDecision(name)
  const start = performance.now()
  const result = await score(state, def.dimensions)

  const primary = result.scores[0]
  let decision: string
  if (typeof primary.answer === 'boolean') {
    decision = primary.answer ? 'yes' : 'no'
  } else {
    decision = String(primary.answer)
  }

  return {
    decision,
    scores: result.scores,
    provider: result.provider,
    latencyMs: Math.round(performance.now() - start),
  }
}
