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

function parseAnswer(name: string, answer: JevAnswer, dim: Dimension): DimensionScore {
  let value: string | number | boolean

  if (answer.type === 'score') {
    const raw = answer.score ?? 0
    const legend = answer.legend
    if (legend) {
      const idx = Math.round(raw)
      value = legend[String(idx)] ?? `${raw}`
    } else {
      value = raw
    }
  } else if (answer.type === 'choice') {
    value = answer.choice ?? 'unknown'
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
  name: 'jev-typesafe',

  async score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    const apiKey = process.env.TYPESAFE_API_KEY
    if (!apiKey) {
      throw new Error('TYPESAFE_API_KEY must be set')
    }

    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: buildQuestions(dimensions),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`TypeSafe API ${res.status}: ${text}`)
    }

    const data = await res.json() as { answers: Record<string, JevAnswer> }
    return dimensions.map(dim => parseAnswer(dim.name, data.answers[dim.name], dim))
  },
}

export default provider
