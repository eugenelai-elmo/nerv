import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveAndCall } from './resolve-provider.js'
import type { SkillEntry, SkillMatch, RouterResult, RouterProvider } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CACHE_TTL_MS = 120_000 // 2 minutes — long enough to avoid redundant calls within a task, short enough that context shifts get fresh routing
const cache = new Map<string, { result: RouterResult; expires: number }>()

function cacheKey(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16)
}

async function loadInventory(): Promise<SkillEntry[]> {
  const raw = await readFile(join(ROOT, 'config', 'skill-inventory.json'), 'utf-8')
  const parsed = JSON.parse(raw)
  return (parsed.skills ?? parsed) as SkillEntry[]
}

export async function route(prompt: string): Promise<RouterResult> {
  const key = cacheKey(prompt)
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    return { ...cached.result, latencyMs: 0 }
  }

  const inventory = await loadInventory()

  const { result: matches, providerName, latencyMs } = await resolveAndCall<RouterProvider, SkillMatch[]>(
    'router',
    (provider) => provider.route(prompt, inventory),
  )

  const result: RouterResult = { matches, provider: providerName, latencyMs }

  cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS })

  // Evict expired entries periodically
  if (cache.size > 50) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k)
    }
  }

  return result
}
