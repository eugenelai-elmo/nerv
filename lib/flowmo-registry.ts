import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const RELATED_REPOS = process.env.FLOWMO_RELATED_REPOS
  ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'related-repos.json')

interface RegistryEntry {
  kind?: string
  path?: string
}

let cache: Map<string, RegistryEntry> | null = null

async function load(): Promise<Map<string, RegistryEntry>> {
  if (cache) return cache
  try {
    // relativePath values are relative to the flowmo repo root (the file lives at <root>/.claude/)
    const file = await realpath(RELATED_REPOS)
    const root = dirname(dirname(file))
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
    const repos = (raw.repos as Record<string, unknown> | undefined) ?? raw
    cache = new Map(
      Object.entries(repos)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, v]) => {
          const entry = (v ?? {}) as { kind?: string; relativePath?: string }
          return [k, { kind: entry.kind, path: entry.relativePath ? resolve(root, entry.relativePath) : undefined }]
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
