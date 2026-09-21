import type { SkillEntry, SkillMatch } from '../lib/types.js'

const MAX_SKILLS_PER_CALL = 15

function chunkInventory(inventory: SkillEntry[]): SkillEntry[][] {
  const chunks: SkillEntry[][] = []
  for (let i = 0; i < inventory.length; i += MAX_SKILLS_PER_CALL) {
    chunks.push(inventory.slice(i, i + MAX_SKILLS_PER_CALL))
  }
  return chunks
}

function buildQuestions(chunk: SkillEntry[]): Record<string, { type: 'noul'; instructions: string }> {
  const questions: Record<string, { type: 'noul'; instructions: string }> = {}
  for (const skill of chunk) {
    questions[skill.name] = {
      type: 'noul',
      instructions: `Is the "${skill.name}" skill relevant to this task? ${skill.description}`,
    }
  }
  return questions
}

function buildState(prompt: string, chunk: SkillEntry[]): string {
  const skillSummary = chunk.map(s => `- ${s.name} (${s.platform}): ${s.description}`).join('\n')
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

    const chunks = chunkInventory(inventory)
    const allMatches: SkillMatch[] = []

    const results = await Promise.all(
      chunks.map(chunk =>
        callJev(buildState(prompt, chunk), buildQuestions(chunk))
          .then(answers => ({ chunk, answers }))
      )
    )

    for (const { chunk, answers } of results) {
      for (const skill of chunk) {
        const answer = answers[skill.name]
        if (!answer) continue
        const prob = answer.noul ?? 0
        if (prob > 0.4) {
          allMatches.push({
            name: skill.name,
            confidence: prob,
            reason: `jev noul: ${(prob * 100).toFixed(0)}%`,
          })
        }
      }
    }

    return allMatches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
  },
}

export default provider
