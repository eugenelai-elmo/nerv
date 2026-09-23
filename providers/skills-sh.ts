import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SkillRecommendation } from './openagentskill.js'

const exec = promisify(execFile)

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f]|\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

function parseInstalls(raw: string): number | undefined {
  const match = raw.match(/([\d.]+)([KkMm]?)\s*installs?/i)
  if (!match) return undefined
  let n = parseFloat(match[1])
  const suffix = match[2].toUpperCase()
  if (suffix === 'K') n *= 1000
  if (suffix === 'M') n *= 1_000_000
  return Math.round(n)
}

export async function search(query: string): Promise<SkillRecommendation[]> {
  let stdout: string
  try {
    const result = await exec('npx', ['skills', 'search', query], {
      timeout: 15_000,
      env: { ...process.env, NO_COLOR: '1' },
    })
    stdout = result.stdout
  } catch (err) {
    const e = err as { code?: string; stderr?: string }
    if (e.code === 'ENOENT' || e.stderr?.includes('not found')) {
      return []
    }
    throw err
  }

  const clean = stripAnsi(stdout)
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)
  const results: SkillRecommendation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const skillMatch = line.match(/^([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)@([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*)/)
    if (!skillMatch) continue

    const repo = skillMatch[1]
    const skillName = skillMatch[2]
    const installs = parseInstalls(line)

    let url: string | undefined
    const nextLine = lines[i + 1] ?? ''
    const urlMatch = nextLine.match(/https?:\/\/\S+/)
    if (urlMatch) url = urlMatch[0]

    results.push({
      name: skillName,
      slug: `${repo}@${skillName}`,
      description: `${repo} — ${installs ? `${(installs / 1000).toFixed(1)}K installs` : 'skills.sh'}`,
      matchScore: 0,
      category: 'skills.sh',
      source: 'skills.sh',
      url,
      repo,
    })
  }

  return results
}
