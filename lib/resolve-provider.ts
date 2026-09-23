import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ProviderConfig, ProviderSection } from './types.js'

type ProviderSectionKey = 'scorer' | 'router' | 'memory' | 'device' | 'session'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let _configCache: { config: ProviderConfig; mtime: number } | null = null

/**
 * Load providers.json, caching for the lifetime of the process.
 * (Config changes require a restart — this is a CLI tool, not a long-lived server.)
 */
export async function loadConfig(): Promise<ProviderConfig> {
  if (_configCache) return _configCache.config
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(raw) as ProviderConfig
  _configCache = { config, mtime: Date.now() }
  return config
}

/**
 * Read the provider section for a given module name (scorer, router, etc.).
 */
export async function getSection(sectionName: ProviderSectionKey): Promise<ProviderSection> {
  const config = await loadConfig()
  const section = config[sectionName]
  if (!section) {
    throw new Error(`[resolve-provider] No config section "${sectionName}" in providers.json`)
  }
  return section
}

/**
 * Derive the ordered provider chain from a section.
 * - Chain sections: use the explicit array
 * - Single-provider sections: [provider]
 */
function toChain(section: ProviderSection): string[] {
  if ('chain' in section && Array.isArray(section.chain)) {
    return section.chain
  }
  if ('provider' in section && section.provider) {
    return [section.provider]
  }
  throw new Error('[resolve-provider] Section has neither "chain" nor "provider"')
}

/**
 * Dynamically import a provider module by name.
 * Looks in `<ROOT>/providers/<name>.js` by default.
 */
async function importProvider<T>(name: string, providersDir?: string): Promise<T> {
  const dir = providersDir ?? join(ROOT, 'providers')
  const mod = await import(join(dir, `${name}.js`)) as { default: T }
  return mod.default
}

/**
 * Resolve a provider for the given section, walking the chain with try/catch fallback.
 *
 * @param sectionName - key in providers.json (scorer, router, memory, device, session)
 * @param providersDir - optional override for the providers directory
 * @returns the loaded provider module (typed by caller)
 */
export async function resolveProvider<T>(
  sectionName: ProviderSectionKey,
  providersDir?: string,
): Promise<T> {
  const section = await getSection(sectionName)
  const chain = toChain(section)

  if (chain.length === 0) {
    throw new Error(`[${sectionName}] Empty provider chain`)
  }

  let lastError: Error | null = null

  for (let i = 0; i < chain.length; i++) {
    const name = chain[i]
    try {
      return await importProvider<T>(name, providersDir)
    } catch (err) {
      lastError = err as Error
      const next = chain[i + 1]
      if (next) {
        console.error(`[${sectionName}] ${name} failed: ${lastError.message}, falling back to ${next}`)
      }
    }
  }

  throw lastError ?? new Error(`[${sectionName}] All providers in chain failed`)
}

/**
 * Resolve and immediately call a provider method, with full chain fallback
 * applied per-call (not just per-import). Use this when the provider might
 * import fine but fail at call time.
 *
 * @param sectionName - key in providers.json
 * @param invoke - function that receives the loaded provider and calls a method on it
 * @param providersDir - optional override for the providers directory
 * @returns the result of the invoke function
 */
export async function resolveAndCall<T, R>(
  sectionName: ProviderSectionKey,
  invoke: (provider: T) => Promise<R>,
  providersDir?: string,
): Promise<{ result: R; providerName: string; latencyMs: number }> {
  const section = await getSection(sectionName)
  const chain = toChain(section)

  if (chain.length === 0) {
    throw new Error(`[${sectionName}] Empty provider chain`)
  }

  const start = performance.now()
  let lastError: Error | null = null

  for (let i = 0; i < chain.length; i++) {
    const name = chain[i]
    try {
      const provider = await importProvider<T>(name, providersDir)
      const result = await invoke(provider)
      return {
        result,
        providerName: (provider as { name?: string }).name ?? name,
        latencyMs: Math.round(performance.now() - start),
      }
    } catch (err) {
      lastError = err as Error
      const next = chain[i + 1]
      if (next) {
        console.error(`[${sectionName}] ${name} failed: ${lastError.message}, falling back to ${next}`)
      }
    }
  }

  throw lastError ?? new Error(`[${sectionName}] All providers in chain failed`)
}
