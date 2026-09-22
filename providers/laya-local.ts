import type { ScorerProvider, Dimension, DimensionScore, JevQuestion } from '../lib/types.js'

const LAYA_URL = process.env.LAYA_URL ?? 'http://127.0.0.1:8421'
const TIMEOUT_MS = 5_000

function buildQuestions(dimensions: Dimension[]): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  for (const dim of dimensions) {
    questions[dim.name] = dim.question
  }
  return questions
}

interface LayaAnswer {
  type: string
  choice?: string
  score?: number
  noul?: number
  probabilities?: Record<string, number>
  legend?: Record<string, string>
  confidence?: number
}

function parseAnswer(name: string, answer: LayaAnswer, dim: Dimension): DimensionScore {
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
  name: 'laya-local',

  async score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    const res = await fetch(`${LAYA_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        questions: buildQuestions(dimensions),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Laya ${res.status}: ${text}`)
    }

    const data = await res.json() as { answers: Record<string, LayaAnswer> }
    return dimensions.map(dim => parseAnswer(dim.name, data.answers[dim.name], dim))
  },
}

export default provider
