import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Dimension, ScorerResult, ScorerProvider, ProviderConfig } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadConfig(): Promise<ProviderConfig> {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  return JSON.parse(raw) as ProviderConfig
}

async function loadProvider(name: string): Promise<ScorerProvider> {
  const mod = await import(join(ROOT, 'providers', `${name}.js`)) as { default: ScorerProvider }
  return mod.default
}

export async function score(state: string, dimensions: Dimension[]): Promise<ScorerResult> {
  const config = await loadConfig()
  const providerName = config.scorer.provider
  const fallbackName = config.scorer.fallback ?? 'jev-fallback'
  const start = performance.now()

  try {
    const provider = await loadProvider(providerName)
    const scores = await provider.score(state, dimensions)
    return {
      scores,
      provider: provider.name,
      latencyMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    console.error(`[scorer] ${providerName} failed: ${(err as Error).message}, trying ${fallbackName}`)

    try {
      const fallback = await loadProvider(fallbackName)
      const scores = await fallback.score(state, dimensions)
      return {
        scores,
        provider: fallback.name,
        latencyMs: Math.round(performance.now() - start),
      }
    } catch (err2) {
      if (fallbackName === 'jev-fallback') throw err2

      console.error(`[scorer] ${fallbackName} also failed: ${(err2 as Error).message}, using jev-fallback`)
      const lastResort = await loadProvider('jev-fallback')
      const scores = await lastResort.score(state, dimensions)
      return {
        scores,
        provider: lastResort.name,
        latencyMs: Math.round(performance.now() - start),
      }
    }
  }
}
