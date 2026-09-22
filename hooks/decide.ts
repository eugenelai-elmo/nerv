import { decide } from '../lib/decide.js'
import { trace, now } from '../lib/trace.js'

const [decisionName, state] = process.argv.slice(2)
if (!decisionName || !state) {
  process.exit(0)
}

try {
  const result = await decide(decisionName, state)
  await trace({
    ts: now(),
    hook: 'decide',
    layer: 'L6:Decisions+L1:Scorer',
    decision: decisionName,
    provider: result.provider,
    latencyMs: result.latencyMs,
    result: result.decision,
    prompt_len: state.length,
  })
  console.log(JSON.stringify({ decision: result.decision, scores: result.scores, provider: result.provider, latencyMs: result.latencyMs }))
} catch {
  process.exit(0)
}
