import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RepoSkill } from './types.js'

export interface RepoCapabilities {
  commands: string[]
  skills: RepoSkill[]
}

async function listNames(dir: string, pick: (entry: string) => string | null): Promise<string[]> {
  try {
    return (await readdir(dir)).map(pick).filter((n): n is string => n !== null).sort()
  } catch {
    return []
  }
}

export function parseSkillDescription(skillMd: string): string {
  const lines = skillMd.split('\n')
  const i = lines.findIndex(l => /^description:/.test(l))
  if (i === -1) return ''
  const inline = lines[i].replace(/^description:\s*/, '').trim()
  if (inline && !/^[>|][-+]?$/.test(inline)) return inline.replace(/^["']|["']$/g, '')
  // YAML block scalar: take the indented continuation lines
  const block: string[] = []
  for (const l of lines.slice(i + 1)) {
    if (!/^\s+\S/.test(l)) break
    block.push(l.trim())
  }
  return block.join(' ')
}

// What the repo itself offers Claude Code: slash commands and skills under .claude/.
export async function readRepoCapabilities(repoPath: string): Promise<RepoCapabilities> {
  const commands = await listNames(join(repoPath, '.claude', 'commands'), e => (e.endsWith('.md') ? e.slice(0, -3) : null))
  const skillNames = await listNames(join(repoPath, '.claude', 'skills'), e => (e.startsWith('.') ? null : e))
  const skills: RepoSkill[] = []
  for (const name of skillNames) {
    try {
      const md = await readFile(join(repoPath, '.claude', 'skills', name, 'SKILL.md'), 'utf-8')
      skills.push({ name, description: parseSkillDescription(md) })
    } catch {
      // not a skill directory
    }
  }
  return { commands, skills }
}
