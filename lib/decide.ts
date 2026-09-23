import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { score as globalScore } from './scorer.js'
import type { DecisionDefinition, DecisionResult, Dimension, ScorerProvider } from './types.js'

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

async function scoreWithProvider(providerName: string, state: string, dimensions: Dimension[]) {
  const mod = await import(join(ROOT, 'providers', `${providerName}.js`)) as { default: ScorerProvider }
  const provider = mod.default
  const start = performance.now()
  const scores = await provider.score(state, dimensions)
  return { scores, provider: provider.name, latencyMs: Math.round(performance.now() - start) }
}

export async function decide(name: string, state: string): Promise<DecisionResult> {
  const def = await loadDecision(name)
  let result

  if (def.provider) {
    // Per-decision provider override — try specified, fall back to global chain
    try {
      result = await scoreWithProvider(def.provider, state, def.dimensions)
    } catch (err) {
      console.error(`[decide] ${name}: ${def.provider} failed (${(err as Error).message}), falling back to global chain`)
      result = await globalScore(state, def.dimensions)
    }
  } else {
    result = await globalScore(state, def.dimensions)
  }

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
    latencyMs: result.latencyMs,
  }
}
