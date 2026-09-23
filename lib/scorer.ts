import { resolveAndCall } from './resolve-provider.js'
import type { Dimension, ScorerResult, ScorerProvider } from './types.js'

export async function score(state: string, dimensions: Dimension[]): Promise<ScorerResult> {
  const { result: scores, providerName, latencyMs } = await resolveAndCall<ScorerProvider, import('./types.js').DimensionScore[]>(
    'scorer',
    (provider) => provider.score(state, dimensions),
  )

  return { scores, provider: providerName, latencyMs }
}
