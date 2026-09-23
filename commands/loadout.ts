#!/usr/bin/env npx tsx
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolve as oasResolve, type SkillRecommendation } from '../providers/openagentskill.js'
import { search as skillsShSearch } from '../providers/skills-sh.js'
import { trace, now } from '../lib/trace.js'

const args = process.argv.slice(2)
const subcommand = args[0] ?? 'help'

// ── Local skill scanner ──────────────────────────────────

interface LocalSkill {
  name: string
  path: string
  scope: 'user' | 'project'
}

async function scanLocalSkills(): Promise<LocalSkill[]> {
  const skills: LocalSkill[] = []
  const home = homedir()

  const userSkillsDir = join(home, '.claude', 'skills')
  try {
    const entries = await readdir(userSkillsDir)
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      skills.push({ name: entry, path: join(userSkillsDir, entry), scope: 'user' })
    }
  } catch { /* dir doesn't exist */ }

  const projectsDir = join(home, '.claude', 'projects')
  try {
    const projects = await readdir(projectsDir)
    for (const project of projects) {
      const skillsDir = join(projectsDir, project, 'skills')
      try {
        const entries = await readdir(skillsDir)
        for (const entry of entries) {
          if (entry.startsWith('.')) continue
          skills.push({ name: entry.replace(/\.md$/, ''), path: join(skillsDir, entry), scope: 'project' })
        }
      } catch { /* no skills dir */ }
    }
  } catch { /* projects dir doesn't exist */ }

  return skills
}

// ── Formatters ───────────────────────────────────────────

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f]|\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

function truncate(str: string, max: number): string {
  const safe = stripAnsi(str)
  if (safe.length <= max) return safe
  return safe.slice(0, max - 1) + '…'
}

function printResults(results: SkillRecommendation[], localSkills: LocalSkill[]): void {
  const localNames = new Set(localSkills.map(s => s.name.toLowerCase()))

  console.log('')
  console.log(`\x1b[1m #  Skill${' '.repeat(22)}Score  Stars  Description\x1b[0m`)
  console.log('─'.repeat(100))

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const rank = String(i + 1).padStart(2)
    const name = truncate(r.name, 26).padEnd(26)
    const score = r.matchScore > 0 ? String(r.matchScore).padStart(3) : '  -'
    const stars = r.stars ? (r.stars >= 1000 ? `${(r.stars / 1000).toFixed(1)}k` : String(r.stars)).padStart(5) : '    -'
    const desc = truncate(r.description, 45)
    const installed = localNames.has(stripAnsi(r.name).toLowerCase()) ? ' \x1b[32m(installed)\x1b[0m' : ''
    const repo = r.repo ? `\x1b[90m${stripAnsi(r.repo)}\x1b[0m` : ''

    console.log(`${rank}. ${name}  ${score}  ${stars}  ${desc}${installed}`)
    if (repo) console.log(`    ${repo}`)
  }

  console.log('')
}

function printSources(): void {
  console.log('')
  console.log('\x1b[1mConfigured Sources\x1b[0m\n')
  console.log('  \x1b[32m●\x1b[0m  OpenAgentSkill    Public REST, no auth, task→skill matching')
  console.log('  \x1b[32m●\x1b[0m  skills.sh         CLI search via npx skills (282+ skills, install counts)')
  console.log('  \x1b[32m●\x1b[0m  Local scan        ~/.claude/skills/ + project skills')
  console.log('  \x1b[90m○\x1b[0m  Laya guard        Security vetting (future)')
  console.log('  \x1b[90m○\x1b[0m  Laya relevance    Relevance scoring (future)')
  console.log('')
}

// ── Commands ─────────────────────────────────────────────

if (subcommand === 'search') {
  const query = args.slice(1).join(' ')
  if (!query) {
    console.error('Usage: nerv loadout search <task description>')
    process.exit(1)
  }

  console.log(`\x1b[90mSearching registries for: "${query}"...\x1b[0m`)
  const start = performance.now()

  const [oasResult, shResult, localSkills] = await Promise.all([
    oasResolve(query).catch((err: Error) => ({ error: err.message, results: [] as SkillRecommendation[] })),
    skillsShSearch(query).then(results => ({ error: undefined, results })).catch((err: Error) => ({ error: err.message, results: [] as SkillRecommendation[] })),
    scanLocalSkills(),
  ])

  const oasError = 'error' in oasResult ? (oasResult as { error: string }).error : undefined
  const oasResults = Array.isArray(oasResult) ? oasResult : (oasResult as { results: SkillRecommendation[] }).results
  const shError = shResult.error
  const shResults = shResult.results

  const seen = new Set<string>()
  const merged: SkillRecommendation[] = []
  for (const r of [...oasResults, ...shResults]) {
    const key = stripAnsi(r.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(r)
  }

  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
  for (const ls of localSkills) {
    const nameLower = ls.name.toLowerCase()
    const matches = queryWords.some(w => nameLower.includes(w) || w.includes(nameLower))
    if (matches && !seen.has(nameLower)) {
      seen.add(nameLower)
      merged.push({
        name: ls.name,
        slug: ls.name,
        description: `Local ${ls.scope} skill`,
        matchScore: 0,
        category: 'local',
        source: `local (${ls.scope})`,
      })
    }
  }

  const latencyMs = Math.round(performance.now() - start)

  const sources: string[] = []
  if (oasResults.length > 0) sources.push(`OAS:${oasResults.length}`)
  if (shResults.length > 0) sources.push(`skills.sh:${shResults.length}`)

  await trace({
    ts: now(),
    hook: 'loadout-search',
    layer: 'L0:Foundation',
    result: `${merged.length} skills (${sources.join(', ')})${oasError ? ` OAS err: ${oasError}` : ''}${shError ? ` SH err: ${shError}` : ''}`,
    latencyMs,
    prompt_len: query.length,
    matched: merged.length > 0,
  })

  if (oasError && shError && merged.length === 0) {
    console.error(`\x1b[31mBoth sources failed: OAS: ${stripAnsi(oasError)}, skills.sh: ${stripAnsi(shError)}\x1b[0m`)
    process.exit(1)
  }

  if (oasError) console.log(`\x1b[90mOpenAgentSkill: ${stripAnsi(oasError)} (continuing with skills.sh)\x1b[0m`)
  if (shError) console.log(`\x1b[90mskills.sh: ${stripAnsi(shError)} (continuing with OpenAgentSkill)\x1b[0m`)

  if (merged.length === 0) {
    console.log(`No skills found for "${query}" \x1b[90m(${latencyMs}ms)\x1b[0m`)
    console.log(`\x1b[90mLocal skills installed: ${localSkills.length}\x1b[0m`)
    process.exit(0)
  }

  console.log(`\x1b[90m${merged.length} result(s) from ${sources.join(' + ') || 'local'} in ${latencyMs}ms\x1b[0m`)
  printResults(merged, localSkills)
  console.log(`\x1b[90mLocal skills installed: ${localSkills.length}\x1b[0m`)
}

else if (subcommand === 'sources') {
  printSources()
}

else if (subcommand === 'local') {
  const localSkills = await scanLocalSkills()
  console.log(`\n\x1b[1m${localSkills.length} local skills installed\x1b[0m\n`)

  const userSkills = localSkills.filter(s => s.scope === 'user')
  const projectSkills = localSkills.filter(s => s.scope === 'project')

  if (userSkills.length > 0) {
    console.log('\x1b[1mUser skills\x1b[0m (~/.claude/skills/)')
    for (const s of userSkills) {
      console.log(`  ${s.name}`)
    }
  }

  if (projectSkills.length > 0) {
    console.log(`\n\x1b[1mProject skills\x1b[0m`)
    for (const s of projectSkills) {
      console.log(`  ${s.name}  \x1b[90m${s.path}\x1b[0m`)
    }
  }
  console.log('')
}

else {
  console.log(`\x1b[1mnerv loadout\x1b[0m — skill procurement & discovery\n`)
  console.log('Commands:')
  console.log('  search <query>   Search registries for skills matching a task')
  console.log('  sources          List configured skill registries')
  console.log('  local            List locally installed skills')
  console.log('')
  console.log('Examples:')
  console.log('  nerv loadout search "review pull requests"')
  console.log('  nerv loadout search "mobile testing automation"')
  console.log('  nerv loadout local')
}
