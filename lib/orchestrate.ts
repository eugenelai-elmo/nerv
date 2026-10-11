import type { Orchestrator, RepoContext, Resolution } from './types.js'
import type { Mode, TaskInput } from './modes.js'
import { loadConfig } from './resolve-provider.js'
import { loadOrchestrator } from './orchestrator-registry.js'

export const DEFAULT_CHAIN = ['nerv', 'sprintmo', 'flowmo', 'kernel', 'direct']

export interface Skip {
  name: string
  reason: string
}

export interface Picked {
  orchestrator: Orchestrator
  resolution: Resolution
  skipped: Skip[]
}

export class NoOrchestrator extends Error {
  constructor(public readonly skipped: Skip[]) {
    super(`No orchestrator in the chain can take this: ${skipped.map(s => `${s.name} (${s.reason})`).join(', ')}`)
  }
}

// First orchestrator whose supports() returns true wins; the rest record why they were skipped.
export async function pick(chain: Orchestrator[], mode: Mode, input: TaskInput, repo: RepoContext): Promise<Picked> {
  const skipped: Skip[] = []
  for (const orchestrator of chain) {
    const verdict = await orchestrator.supports(mode, input, repo)
    if (verdict === true) {
      return { orchestrator, resolution: await orchestrator.resolve(mode, input, repo), skipped }
    }
    skipped.push({ name: orchestrator.name, reason: verdict })
  }
  throw new NoOrchestrator(skipped)
}

// --via forces a single orchestrator; --chain overrides the order for one run; otherwise config.
export async function resolveChainNames(opts: { via?: string; chain?: string } = {}): Promise<string[]> {
  if (opts.via) return [opts.via]
  if (opts.chain) return opts.chain.split(',').map(s => s.trim()).filter(Boolean)
  const config = await loadConfig()
  return config.dev?.chain?.length ? config.dev.chain : DEFAULT_CHAIN
}

export async function loadChain(names: string[]): Promise<Orchestrator[]> {
  return Promise.all(names.map(n => loadOrchestrator(n)))
}
