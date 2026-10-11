import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from './resolve-provider.js'
import { flowmoRepoNames, flowmoRepoPath, flowmoRepoNameForPath } from './flowmo-registry.js'
import { resolveRepoContext, mainCheckoutPath } from './repo-context.js'
import type { RepoContext } from './types.js'

export interface TargetInfo {
  name: string
  path: string
  source: 'alias' | 'flowmo registry'
}

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function aliases(): Promise<Record<string, string>> {
  return (await loadConfig()).dev?.targets ?? {}
}

// Every target you can name from the seat: config aliases, then any flowmo-registered repo cloned locally.
export async function listTargets(): Promise<TargetInfo[]> {
  const out: TargetInfo[] = []
  for (const [name, p] of Object.entries(await aliases())) {
    const path = expandHome(p)
    if (await isDir(path)) out.push({ name, path, source: 'alias' })
  }
  for (const name of await flowmoRepoNames()) {
    const path = await flowmoRepoPath(name)
    if (path && (await isDir(path))) out.push({ name, path, source: 'flowmo registry' })
  }
  return out
}

export async function resolveTargetPath(name: string): Promise<string | null> {
  const all = await aliases()
  if (all[name]) {
    const p = expandHome(all[name])
    return (await isDir(p)) ? p : null
  }
  const registered = await flowmoRepoPath(name)
  if (registered && (await isDir(registered))) return registered
  // The registry path may assume another checkout layout; an alias that points at this repo wins.
  for (const p of Object.values(all).map(expandHome)) {
    if ((await resolveRepoContext(p))?.name === name) return p
  }
  return null
}

export class TargetError extends Error {}

// Named target → repo. --repo may pick a specific worktree, but it must belong to the named target.
export async function resolveTarget(name: string, repoOverride?: string): Promise<RepoContext> {
  const path = await resolveTargetPath(name)
  if (!path) {
    const known = (await listTargets()).map(t => t.name)
    throw new TargetError(`Unknown target "${name}". Available: ${[...new Set(known)].join(', ')}`)
  }
  const found = await resolveRepoContext(path)
  if (!found) throw new TargetError(`Target "${name}" (${path}) is not a git repository`)
  // Prefer flowmo's registry key, so a renamed folder keeps its identity for flowmo routing.
  const base = { name: (await flowmoRepoNameForPath(found.path)) ?? found.name, path: found.path }
  if (!repoOverride) return base

  const override = await resolveRepoContext(expandHome(repoOverride))
  if (!override) throw new TargetError(`--repo ${repoOverride} is not a git repository`)
  // Same repo = same main checkout; folder names can differ (renames, worktree dirs).
  if ((await mainCheckoutPath(override.path)) !== (await mainCheckoutPath(base.path))) {
    throw new TargetError(`--repo ${repoOverride} is a checkout of "${override.name}", not target "${name}" (${base.name})`)
  }
  return { name: base.name, path: override.path }
}
