export interface SkillRecommendation {
  name: string
  slug: string
  description: string
  matchScore: number
  category: string
  source: string
  url?: string
  stars?: number
  lastUpdated?: string
  repo?: string
}

interface SkillEntry {
  slug: string
  name: string
  description: string
  category?: string
  github_stars?: number
  updated_at?: string
  repository?: string
  github_repo?: string
}

interface Candidate {
  rank: number
  match_score: number
  skill: SkillEntry
}

interface ResolveResponse {
  selected?: Candidate
  alternatives?: Candidate[]
  error?: string
}

const BASE_URL = 'https://openagentskill.com'

export async function resolve(task: string): Promise<SkillRecommendation[]> {
  const params = new URLSearchParams({ task, agent: 'codex' })
  const res = await fetch(`${BASE_URL}/api/agent/resolve?${params}`, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAgentSkill API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as ResolveResponse
  if (data.error) throw new Error(`OpenAgentSkill: ${data.error}`)

  const results: SkillRecommendation[] = []

  function mapCandidate(c: Candidate): SkillRecommendation {
    const s = c.skill
    return {
      name: s.name,
      slug: s.slug,
      description: s.description ?? '',
      matchScore: c.match_score,
      category: s.category ?? '',
      source: 'openagentskill',
      url: s.repository,
      stars: s.github_stars,
      lastUpdated: s.updated_at,
      repo: s.github_repo,
    }
  }

  if (data.selected) results.push(mapCandidate(data.selected))
  if (data.alternatives) {
    for (const alt of data.alternatives) {
      results.push(mapCandidate(alt))
    }
  }

  return results
}
