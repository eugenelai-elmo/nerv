import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { MemoryTier, MemoryEntry, RecallResult, MemoryProvider, ProviderConfig } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadConfig(): Promise<ProviderConfig> {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  return JSON.parse(raw) as ProviderConfig
}

async function loadProvider(name: string): Promise<MemoryProvider> {
  const mod = await import(join(ROOT, 'providers', `${name}.js`)) as { default: MemoryProvider }
  return mod.default
}

export async function recall(path: string, tier: MemoryTier = 'L0'): Promise<RecallResult> {
  const config = await loadConfig()
  const providerName = config.memory.provider
  const start = performance.now()

  try {
    const provider = await loadProvider(providerName)
    const entries = await provider.recall(path, tier)
    return {
      entries,
      provider: provider.name,
      latencyMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    if (providerName === 'filesystem-fallback') throw err

    console.error(`[memory] ${providerName} failed: ${(err as Error).message}, falling back`)
    const fallback = await loadProvider('filesystem-fallback')
    const entries = await fallback.recall(path, tier)
    return {
      entries,
      provider: fallback.name,
      latencyMs: Math.round(performance.now() - start),
    }
  }
}

export async function save(path: string, payload: string, metadata?: Record<string, unknown>): Promise<void> {
  const config = await loadConfig()
  const providerName = config.memory.provider

  try {
    const provider = await loadProvider(providerName)
    await provider.save(path, payload, metadata)
  } catch (err) {
    if (providerName === 'filesystem-fallback') throw err

    console.error(`[memory] ${providerName} save failed: ${(err as Error).message}, falling back`)
    const fallback = await loadProvider('filesystem-fallback')
    await fallback.save(path, payload, metadata)
  }
}

export async function list(prefix: string): Promise<string[]> {
  const config = await loadConfig()
  const providerName = config.memory.provider

  try {
    const provider = await loadProvider(providerName)
    return await provider.list(prefix)
  } catch (err) {
    if (providerName === 'filesystem-fallback') throw err

    console.error(`[memory] ${providerName} list failed: ${(err as Error).message}, falling back`)
    const fallback = await loadProvider('filesystem-fallback')
    return await fallback.list(prefix)
  }
}
