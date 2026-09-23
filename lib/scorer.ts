import { resolveAndCall } from './resolve-provider.js'
import { trace, now } from './trace.js'
import type { Dimension, ScorerResult, ScorerProvider } from './types.js'

export async function score(state: string, dimensions: Dimension[]): Promise<ScorerResult> {
  const { result: scores, providerName, latencyMs } = await resolveAndCall<ScorerProvider, import('./types.js').DimensionScore[]>(
    'scorer',
    (provider) => provider.score(state, dimensions),
  )

  await trace({
    ts: now(),
    hook: 'scorer.score',
    layer: 'L1:Scorer',
    provider: providerName,
    latencyMs,
    result: `${dimensions.length} dimensions`,
  })

  return { scores, provider: providerName, latencyMs }
}
