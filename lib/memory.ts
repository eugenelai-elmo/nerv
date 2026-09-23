import { resolveProvider, resolveAndCall } from './resolve-provider.js'
import type { MemoryTier, MemoryEntry, RecallResult, MemoryProvider } from './types.js'

export async function recall(path: string, tier: MemoryTier = 'L0'): Promise<RecallResult> {
  const { result: entries, providerName, latencyMs } = await resolveAndCall<MemoryProvider, MemoryEntry[]>(
    'memory',
    (provider) => provider.recall(path, tier),
  )

  return { entries, provider: providerName, latencyMs }
}

export async function save(path: string, payload: string, metadata?: Record<string, unknown>): Promise<void> {
  const provider = await resolveProvider<MemoryProvider>('memory')
  await provider.save(path, payload, metadata)
}

export async function list(prefix: string): Promise<string[]> {
  const provider = await resolveProvider<MemoryProvider>('memory')
  return provider.list(prefix)
}
