import type { MemoryProvider, MemoryTier, MemoryEntry } from '../lib/types.js'

const DEFAULT_BASE_URL = 'http://localhost:8420'

function baseUrl(): string {
  return process.env.OPENVIKING_URL ?? DEFAULT_BASE_URL
}

function tierToLevel(tier: MemoryTier): number {
  return tier === 'L0' ? 0 : tier === 'L1' ? 1 : 2
}

async function vikingFetch(path: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenViking ${res.status}: ${text}`)
  }

  return res
}

const provider: MemoryProvider = {
  name: 'openviking',

  async recall(path: string, tier: MemoryTier): Promise<MemoryEntry[]> {
    const res = await vikingFetch('/api/v1/memory/recall', {
      method: 'POST',
      body: JSON.stringify({
        path: `viking://${path}`,
        level: tierToLevel(tier),
      }),
    })

    const data = await res.json() as {
      entries: Array<{
        path: string
        content: string
        metadata?: Record<string, unknown>
      }>
    }

    return data.entries.map(e => ({
      path: e.path.replace('viking://', ''),
      tier,
      content: e.content,
      metadata: e.metadata,
      lastAccessed: new Date().toISOString(),
    }))
  },

  async save(path: string, payload: string, metadata?: Record<string, unknown>): Promise<void> {
    await vikingFetch('/api/v1/memory/save', {
      method: 'POST',
      body: JSON.stringify({
        path: `viking://${path}`,
        content: payload,
        metadata,
      }),
    })
  },

  async list(prefix: string): Promise<string[]> {
    const res = await vikingFetch('/api/v1/memory/list', {
      method: 'POST',
      body: JSON.stringify({ prefix: `viking://${prefix}` }),
    })

    const data = await res.json() as { paths: string[] }
    return data.paths.map(p => p.replace('viking://', ''))
  },
}

export default provider
