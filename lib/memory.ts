import { resolveAndCall } from './resolve-provider.js'
import { trace, now } from './trace.js'
import type { MemoryTier, MemoryEntry, RecallResult, MemoryProvider } from './types.js'

export async function recall(path: string, tier: MemoryTier = 'L0'): Promise<RecallResult> {
  const { result: entries, providerName, latencyMs } = await resolveAndCall<MemoryProvider, MemoryEntry[]>(
    'memory',
    (provider) => provider.recall(path, tier),
  )

  await trace({
    ts: now(),
    hook: 'memory.recall',
    layer: 'L4:Memory',
    provider: providerName,
    latencyMs,
    result: `${entries.length} entries for ${path}`,
  })

  return { entries, provider: providerName, latencyMs }
}

export async function save(path: string, payload: string, metadata?: Record<string, unknown>): Promise<void> {
  const { providerName, latencyMs } = await resolveAndCall<MemoryProvider, void>(
    'memory',
    (provider) => provider.save(path, payload, metadata),
  )
  await trace({
    ts: now(),
    hook: 'memory.save',
    layer: 'L4:Memory',
    provider: providerName,
    latencyMs,
    result: path,
  })
}

export async function list(prefix: string): Promise<string[]> {
  const { result: paths, providerName, latencyMs } = await resolveAndCall<MemoryProvider, string[]>(
    'memory',
    (provider) => provider.list(prefix),
  )
  await trace({
    ts: now(),
    hook: 'memory.list',
    layer: 'L4:Memory',
    provider: providerName,
    latencyMs,
    result: `${paths.length} paths for ${prefix}`,
  })
  return paths
}
