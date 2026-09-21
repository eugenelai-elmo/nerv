import type { ScorerProvider, Dimension, DimensionScore } from '../lib/types.js'

const provider: ScorerProvider = {
  name: 'jev-fallback',

  async score(_state: string, dimensions: Dimension[]): Promise<DimensionScore[]> {
    console.warn('[jev-fallback] Jev unavailable — returning unscored dimensions. Use manual scoring.')

    return dimensions.map(dim => ({
      name: dim.name,
      answer: 'unknown',
      confidence: 0,
      probabilities: {},
    }))
  },
}

export default provider
