import type { ScorerProvider, Dimension, DimensionScore, JevQuestion } from '../lib/types.js'

interface JevAnswer {
  type: string
  choice?: string
  score?: number
  noul?: number
  probabilities?: Record<string, number>
  legend?: Record<string, string>
  confidence?: number
}

function buildQuestions(dimensions: Dimension[]): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  for (const dim of dimensions) {
    questions[dim.name] = dim.question
  }
  return questions
}

function parseAnswer(name: string, answer: JevAnswer): DimensionScore {
  let value: string | number | boolean

  if (answer.type === 'choice') {
    value = answer.choice ?? 'unknown'
  } else if (answer.type === 'score') {
    value = answer.score ?? 0
  } else {
    value = (answer.noul ?? 0) > 0.5
  }

  return {
    name,
    answer: value,
    confidence: answer.confidence ?? 0,
    probabilities: answer.probabilities ?? {},
  }
}

const provider: ScorerProvider = {
  name: 'jev-cloudflare',

  async score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    const accountId = process.env.CF_ACCOUNT_ID
    const apiToken = process.env.CF_API_TOKEN
    if (!accountId || !apiToken) {
      throw new Error('CF_ACCOUNT_ID and CF_API_TOKEN must be set. Run: npx wrangler login')
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`
    const body = {
      model: 'typesafe/jev',
      input: {
        state,
        questions: buildQuestions(dimensions),
      },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Cloudflare AI ${res.status}: ${text}`)
    }

    const envelope = await res.json() as { result: { answers: Record<string, JevAnswer> } }
    const answers = envelope.result.answers

    return dimensions.map(dim => parseAnswer(dim.name, answers[dim.name]))
  },
}

export default provider
