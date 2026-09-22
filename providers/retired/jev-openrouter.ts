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
  name: 'jev-openrouter',

  async score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY must be set')
    }

    const url = 'https://openrouter.ai/api/v1/systemone'
    const body = {
      model: 'typesafe/jev-1.13',
      state,
      questions: buildQuestions(dimensions),
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${text}`)
    }

    const response = await res.json() as { answers: Record<string, JevAnswer> }
    return dimensions.map(dim => parseAnswer(dim.name, response.answers[dim.name]))
  },
}

export default provider
