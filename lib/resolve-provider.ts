import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ProviderConfig, ProviderSection } from './types.js'

export type ProviderSectionKey = 'scorer' | 'router' | 'memory' | 'device' | 'session'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Env overrides exist so tests can point at a temp config / providers dir.
const CONFIG_PATH = () => process.env.NERV_PROVIDERS_CONFIG ?? join(ROOT, 'config', 'providers.json')
const PROVIDERS_DIR = () => process.env.NERV_PROVIDERS_DIR ?? join(ROOT, 'providers')

// Last-resort provider per section, always tried after the configured chain — the
// pre-refactor modules fell back to these regardless of what config named.
export const SECTION_FALLBACK: Record<ProviderSectionKey, string> = {
  scorer: 'jev-fallback',
  router: 'keyword-router',
  memory: 'filesystem-fallback',
  device: 'device-fallback',
  session: 'tmux-fallback',
}

let _configCache: ProviderConfig | null = null

/**
 * Load providers.json, caching for the lifetime of the process.
 * (Config changes require a restart — this is a CLI tool, not a long-lived server.)
 */
export async function loadConfig(): Promise<ProviderConfig> {
  if (_configCache) return _configCache
  _configCache = JSON.parse(await readFile(CONFIG_PATH(), 'utf-8')) as ProviderConfig
  return _configCache
}

export async function getSection(sectionName: ProviderSectionKey): Promise<ProviderSection> {
  const section = (await loadConfig())[sectionName]
  if (!section) {
    throw new Error(`[resolve-provider] No config section "${sectionName}" in providers.json`)
  }
  return section
}

// Configured chain (explicit `chain`, or `[provider]`) plus the section's last-resort fallback.
export function toChain(section: ProviderSection, sectionName?: ProviderSectionKey): string[] {
  let chain: string[]
  if ('chain' in section && Array.isArray(section.chain)) chain = [...section.chain]
  else if ('provider' in section && section.provider) chain = [section.provider]
  else throw new Error('[resolve-provider] Section has neither "chain" nor "provider"')
  const last = sectionName ? SECTION_FALLBACK[sectionName] : undefined
  if (last && !chain.includes(last)) chain.push(last)
  return chain
}

async function importProvider<T>(name: string, providersDir?: string): Promise<T> {
  const mod = await import(join(providersDir ?? PROVIDERS_DIR(), `${name}.js`)) as { default: T }
  return mod.default
}

function warnFallback(label: string, name: string, err: Error, next: string | undefined) {
  if (next) console.error(`[${label}] ${name} failed: ${err.message}, falling back to ${next}`)
}

// Walk a chain until one provider both imports and succeeds at `invoke`.
export async function callChain<T, R>(
  label: string,
  chain: string[],
  invoke: (provider: T) => Promise<R>,
  providersDir?: string,
): Promise<{ result: R; providerName: string; latencyMs: number }> {
  if (chain.length === 0) throw new Error(`[${label}] Empty provider chain`)
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
      warnFallback(label, name, lastError, chain[i + 1])
    }
  }
  throw lastError ?? new Error(`[${label}] All providers in chain failed`)
}

/**
 * Resolve a provider for the section, falling back only on import failure.
 * Prefer resolveAndCall: it also falls back when the provider fails at call time.
 */
export async function resolveProvider<T>(sectionName: ProviderSectionKey, providersDir?: string): Promise<T> {
  const chain = toChain(await getSection(sectionName), sectionName)
  const { result } = await callChain<T, T>(sectionName, chain, async p => p, providersDir)
  return result
}

// Resolve and call a provider method with per-call fallback down the chain.
export async function resolveAndCall<T, R>(
  sectionName: ProviderSectionKey,
  invoke: (provider: T) => Promise<R>,
  providersDir?: string,
): Promise<{ result: R; providerName: string; latencyMs: number }> {
  const chain = toChain(await getSection(sectionName), sectionName)
  return callChain<T, R>(sectionName, chain, invoke, providersDir)
}
