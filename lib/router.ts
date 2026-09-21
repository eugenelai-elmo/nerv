import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { SkillEntry, SkillMatch, RouterResult } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadInventory(): Promise<SkillEntry[]> {
  const raw = await readFile(join(ROOT, 'config', 'skill-inventory.json'), 'utf-8')
  const parsed = JSON.parse(raw)
  return (parsed.skills ?? parsed) as SkillEntry[]
}

interface RouterProvider {
  name: string
  route(prompt: string, inventory: SkillEntry[]): Promise<SkillMatch[]>
}

async function loadProvider(): Promise<RouterProvider> {
  const configRaw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(configRaw)
  const name = config.router?.provider ?? 'keyword-router'
  const mod = await import(join(ROOT, 'providers', `${name}.js`)) as { default: RouterProvider }
  return mod.default
}

export async function route(prompt: string): Promise<RouterResult> {
  const inventory = await loadInventory()
  const start = performance.now()

  try {
    const provider = await loadProvider()
    const matches = await provider.route(prompt, inventory)
    return {
      matches,
      provider: provider.name,
      latencyMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    console.error(`[router] failed: ${(err as Error).message}, falling back to keyword`)
    const { default: fallback } = await import(join(ROOT, 'providers', 'keyword-router.js')) as { default: RouterProvider }
    const matches = await fallback.route(prompt, inventory)
    return {
      matches,
      provider: fallback.name,
      latencyMs: Math.round(performance.now() - start),
    }
  }
}
