import { decide } from '../lib/decide.js'

const [decisionName, state] = process.argv.slice(2)
if (!decisionName || !state) {
  process.exit(0)
}

try {
  const result = await decide(decisionName, state)
  const scores = result.scores.map(s => `${s.name}=${s.answer}`).join(', ')
  console.log(JSON.stringify({ decision: result.decision, scores: result.scores, provider: result.provider, latencyMs: result.latencyMs }))
} catch {
  process.exit(0)
}
