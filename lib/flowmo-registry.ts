import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const RELATED_REPOS = process.env.FLOWMO_RELATED_REPOS
  ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'related-repos.json')

interface RegistryEntry {
  kind?: string
  path?: string
}

// flowmo's per-machine override lives next to the workspace's related-repos.json (not the symlink target):
// flowmo run from the NERV seat resolves its workspace to nerv, so both read the same file.
const RELATED_REPOS_LOCAL = process.env.FLOWMO_RELATED_REPOS_LOCAL
  ?? join(dirname(RELATED_REPOS), 'related-repos.local.json')

let cache: Map<string, RegistryEntry> | null = null

async function readOverrides(): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await readFile(RELATED_REPOS_LOCAL, 'utf-8')) as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => !e[0].startsWith('$') && typeof e[1] === 'string'))
  } catch {
    return {}
  }
}

async function load(): Promise<Map<string, RegistryEntry>> {
  if (cache) return cache
  try {
    // relativePath values (and relative overrides) are relative to the flowmo repo root (<root>/.claude/…)
    const file = await realpath(RELATED_REPOS)
    const root = dirname(dirname(file))
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
    const repos = (raw.repos as Record<string, unknown> | undefined) ?? raw
    const overrides = await readOverrides()
    cache = new Map(
      Object.entries(repos)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, v]) => {
          const entry = (v ?? {}) as { kind?: string; relativePath?: string }
          // Overrides only override: keys not in the registry are ignored, as in flowmo.
          const rel = overrides[k] ?? entry.relativePath
          return [k, { kind: entry.kind, path: rel ? resolve(root, rel) : undefined }]
        }),
    )
  } catch {
    cache = new Map()
  }
  return cache
}

export async function isFlowmoRepo(name: string): Promise<boolean> {
  return (await load()).has(name)
}

// flowmo's repo kind (frontend, backend, mobile, …), used where flowmo rules differ by kind.
export async function flowmoRepoKind(name: string): Promise<string | undefined> {
  return (await load()).get(name)?.kind
}

export async function flowmoRepoPath(name: string): Promise<string | undefined> {
  return (await load()).get(name)?.path
}

export async function flowmoRepoNames(): Promise<string[]> {
  return [...(await load()).keys()].sort()
}
