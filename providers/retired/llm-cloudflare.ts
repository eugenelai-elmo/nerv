import type { ScorerProvider, Dimension, DimensionScore } from '../lib/types.js'

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

function buildPrompt(state: string, dimensions: Dimension[]): string {
  const dimDescriptions = dimensions.map(dim => {
    const q = dim.question
    if (q.type === 'score') {
      const levels = q.criteria.map((c, i) => `${i}: ${c}`).join('\n      ')
      return `  "${dim.name}" (score 0-${q.criteria.length - 1}):\n    ${q.instructions}\n      ${levels}`
    }
    if (q.type === 'choice') {
      const opts = Object.entries(q.criteria).map(([k, v]) => `"${k}": ${v}`).join('\n      ')
      return `  "${dim.name}" (choose one key):\n    ${q.instructions}\n      ${opts}`
    }
    return `  "${dim.name}" (true/false):\n    ${q.instructions}`
  }).join('\n\n')

  return `Score the following item on each dimension. Return ONLY valid JSON matching the schema below — no explanation, no markdown.

ITEM:
${state}

DIMENSIONS:
${dimDescriptions}

RESPONSE SCHEMA:
{
  "scores": {
    "<dimension_name>": {
      "answer": <number for score | "key" for choice | true/false for noul>,
      "confidence": <0.0 to 1.0>
    }
  }
}`
}

function parseResponse(raw: string, dimensions: Dimension[]): DimensionScore[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in LLM response')

  const parsed = JSON.parse(jsonMatch[0]) as {
    scores: Record<string, { answer: string | number | boolean; confidence: number }>
  }

  return dimensions.map(dim => {
    const s = parsed.scores[dim.name]
    if (!s) return { name: dim.name, answer: 'unknown', confidence: 0, probabilities: {} }

    let answer: string | number | boolean = s.answer
    if (dim.question.type === 'score' && typeof answer === 'number') {
      const criteria = dim.question.criteria
      answer = criteria[Math.min(answer, criteria.length - 1)] ?? answer
    }

    return {
      name: dim.name,
      answer,
      confidence: s.confidence ?? 0.5,
      probabilities: {},
    }
  })
}

const provider: ScorerProvider = {
  name: 'llm-cloudflare',

  async score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    const accountId = process.env.CF_ACCOUNT_ID
    const apiToken = process.env.CF_API_TOKEN
    if (!accountId || !apiToken) {
      throw new Error('CF_ACCOUNT_ID and CF_API_TOKEN must be set')
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a structured scoring engine. Return only valid JSON.' },
          { role: 'user', content: buildPrompt(state, dimensions) },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Cloudflare AI ${res.status}: ${text}`)
    }

    const envelope = await res.json() as { result: { response?: string; choices?: Array<{ message: { content: string } }> } }
    const content = envelope.result.response ?? envelope.result.choices?.[0]?.message?.content
    if (!content) throw new Error('No content in LLM response')

    return parseResponse(content, dimensions)
  },
}

export default provider
