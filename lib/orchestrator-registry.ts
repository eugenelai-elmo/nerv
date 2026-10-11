import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Orchestrator } from './types.js'

const ORCHESTRATORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'orchestrators')

export class OrchestratorNotFound extends Error {
  constructor(public readonly requested: string, public readonly available: string[]) {
    super(`Orchestrator "${requested}" not found. Available: ${available.join(', ')}`)
  }
}

export async function listOrchestrators(dir = ORCHESTRATORS_DIR): Promise<string[]> {
  const files = await readdir(dir)
  return files
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map(f => f.slice(0, -'.ts'.length))
    .sort()
}

// Only names that exist as files in orchestrators/ are importable — the name comes from user input (--via).
export async function loadOrchestrator(name: string, dir = ORCHESTRATORS_DIR): Promise<Orchestrator> {
  const available = await listOrchestrators(dir)
  if (!available.includes(name)) throw new OrchestratorNotFound(name, available)
  const mod = await import(join(dir, `${name}.js`)) as { default: Orchestrator }
  return mod.default
}
