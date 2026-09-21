import type { SkillEntry, SkillMatch } from '../lib/types.js'

function buildQuestions(skills: SkillEntry[]): Record<string, { type: 'noul'; instructions: string }> {
  const questions: Record<string, { type: 'noul'; instructions: string }> = {}
  for (const skill of skills) {
    questions[skill.name] = {
      type: 'noul',
      instructions: `Is the "${skill.name}" skill relevant to this task? ${skill.description}`,
    }
  }
  return questions
}

function buildState(prompt: string, skills: SkillEntry[]): string {
  const skillSummary = skills.map(s => `- ${s.name} (${s.platform}): ${s.description}`).join('\n')
  return `USER PROMPT:\n${prompt}\n\nAVAILABLE SKILLS:\n${skillSummary}`
}

interface JevAnswer {
  type: string
  noul?: number
  confidence?: number
}

async function callJev(state: string, questions: Record<string, object>): Promise<Record<string, JevAnswer>> {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error('TYPESAFE_API_KEY must be set')

  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TypeSafe API ${res.status}: ${text}`)
  }

  const data = await res.json() as { answers: Record<string, JevAnswer> }
  return data.answers
}

const provider = {
  name: 'jev-router',

  async route(prompt: string, inventory: SkillEntry[]): Promise<SkillMatch[]> {
    if (prompt.length < 20) return []

    const answers = await callJev(buildState(prompt, inventory), buildQuestions(inventory))
    const matches: SkillMatch[] = []

    for (const skill of inventory) {
      const answer = answers[skill.name]
      if (!answer) continue
      const prob = answer.noul ?? 0
      if (prob > 0.6) {
        matches.push({
          name: skill.name,
          confidence: prob,
          reason: `jev noul: ${(prob * 100).toFixed(0)}%`,
        })
      }
    }

    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
  },
}

export default provider
