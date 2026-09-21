import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { MemoryProvider, MemoryTier, MemoryEntry } from '../lib/types.js'

const NERV_ROOT = join(homedir(), 'projects', 'nerv')

function resolvePath(path: string): string {
  const resolved = resolve(NERV_ROOT, path)
  if (!resolved.startsWith(NERV_ROOT)) {
    throw new Error(`Path traversal denied: ${path} resolves outside NERV_ROOT`)
  }
  return resolved
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

function truncateToTier(content: string, tier: MemoryTier): string {
  if (tier === 'L2') return content
  const lines = content.split('\n')
  if (tier === 'L0') {
    const frontmatter = extractFrontmatter(content)
    if (frontmatter) return frontmatter
    return lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n…' : '')
  }
  // L1: first ~30 lines or first two headings
  const cutoff = Math.min(lines.length, 30)
  return lines.slice(0, cutoff).join('\n') + (lines.length > cutoff ? '\n…' : '')
}

function extractFrontmatter(content: string): string | null {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('---', 3)
  if (end === -1) return null
  return content.slice(0, end + 3)
}

const provider: MemoryProvider = {
  name: 'filesystem-fallback',

  async recall(path: string, tier: MemoryTier): Promise<MemoryEntry[]> {
    const resolved = resolvePath(path)

    try {
      const info = await stat(resolved)
      if (info.isFile()) {
        const content = await readFile(resolved, 'utf-8')
        return [{
          path,
          tier,
          content: truncateToTier(content, tier),
          lastAccessed: new Date().toISOString(),
        }]
      }

      if (info.isDirectory()) {
        const files = await readdir(resolved, { recursive: false })
        const entries: MemoryEntry[] = []
        for (const file of files) {
          if (file.startsWith('.')) continue
          const filePath = join(resolved, file)
          const fileStat = await stat(filePath)
          if (!fileStat.isFile()) continue
          const content = await readFile(filePath, 'utf-8')
          entries.push({
            path: join(path, file),
            tier,
            content: truncateToTier(content, tier),
            lastAccessed: new Date().toISOString(),
          })
        }
        return entries
      }
    } catch {
      // path doesn't exist — return empty
    }

    return []
  },

  async save(path: string, payload: string): Promise<void> {
    const resolved = resolvePath(path)
    await mkdir(dirname(resolved), { recursive: true })
    await writeFile(resolved, payload, 'utf-8')
  },

  async list(prefix: string): Promise<string[]> {
    const resolved = resolvePath(prefix)
    try {
      const files = await readdir(resolved, { recursive: true })
      return files
        .filter(f => !f.startsWith('.'))
        .map(f => join(prefix, f))
    } catch {
      return []
    }
  },
}

export default provider
