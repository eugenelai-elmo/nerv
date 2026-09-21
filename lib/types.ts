// Jev question primitives

export type JevChoice = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type JevScore = {
  type: 'score'
  instructions: string
  criteria: string[] // ordered low→high
}

export type JevNoul = {
  type: 'noul'
  instructions: string
}

export type JevQuestion = JevChoice | JevScore | JevNoul

// Scorer

export interface Dimension {
  name: string
  question: JevQuestion
}

export interface DimensionScore {
  name: string
  answer: string | number | boolean
  confidence: number
  probabilities: Record<string, number>
}

export interface ScorerResult {
  scores: DimensionScore[]
  provider: string
  latencyMs: number
}

export interface ScorerProvider {
  name: string
  score(state: string, dimensions: Dimension[]): Promise<DimensionScore[]>
}

// Router

export interface SkillEntry {
  name: string
  description: string
  platform: 'web' | 'mobile' | 'both' | 'infra' | 'any'
  triggerPatterns: string[]
}

export interface SkillMatch {
  name: string
  confidence: number
  reason?: string
}

export interface RouterResult {
  matches: SkillMatch[]
  provider: string
  latencyMs: number
}

export interface RouterProvider {
  name: string
  route(prompt: string, inventory: SkillEntry[]): Promise<SkillMatch[]>
}

// Config

export interface ProviderConfig {
  scorer: {
    provider: 'jev-cloudflare' | 'jev-openrouter' | 'jev-fallback'
    config: Record<string, string>
  }
  router: {
    provider: 'jev-router' | 'keyword-router'
    config: Record<string, string>
  }
}
