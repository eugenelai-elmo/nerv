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

// Memory

export type MemoryTier = 'L0' | 'L1' | 'L2'

export interface MemoryEntry {
  path: string
  tier: MemoryTier
  content: string
  metadata?: Record<string, unknown>
  lastAccessed?: string
}

export interface RecallResult {
  entries: MemoryEntry[]
  provider: string
  latencyMs: number
}

export interface MemoryProvider {
  name: string
  recall(path: string, tier: MemoryTier): Promise<MemoryEntry[]>
  save(path: string, payload: string, metadata?: Record<string, unknown>): Promise<void>
  list(prefix: string): Promise<string[]>
}

// Mobile Automation

export interface DeviceInfo {
  id: string
  name: string
  platform: 'android' | 'ios' | 'emulator'
  connected: boolean
}

export interface Screenshot {
  path: string
  timestamp: string
  deviceId: string
}

export interface DeviceResult {
  success: boolean
  provider: string
  latencyMs: number
  data?: unknown
}

export type MobileProviderTier = 'workflow' | 'raw' | 'fallback'

export interface DeviceProvider {
  name: string
  tier: MobileProviderTier
  listDevices(): Promise<DeviceInfo[]>
  screenshot(deviceId?: string): Promise<Screenshot>
  tap(x: number, y: number, deviceId?: string): Promise<DeviceResult>
  swipe(startX: number, startY: number, endX: number, endY: number, deviceId?: string): Promise<DeviceResult>
  typeText(text: string, deviceId?: string): Promise<DeviceResult>
  launchApp(packageName: string, deviceId?: string): Promise<DeviceResult>
  logcat(lines?: number, deviceId?: string): Promise<string>
}

// Session (Herdr)

export interface SessionInfo {
  workspaceId: string
  label: string
  paneCount: number
  tabCount: number
  focused: boolean
}

export interface SessionProvider {
  name: string
  list(): Promise<SessionInfo[]>
  create(label: string): Promise<SessionInfo>
  attach(workspaceId: string): Promise<void>
  status(): Promise<{ running: boolean; socketPath: string }>
}

// Decision

export interface DecisionDefinition {
  name: string
  description: string
  dimensions: Dimension[]
  thresholds?: Record<string, number>
  provider?: string
}

export interface DecisionResult {
  decision: string
  scores: DimensionScore[]
  provider: string
  latencyMs: number
}

// Config

export interface ProviderConfig {
  scorer: {
    provider: 'laya-local' | 'jev-typesafe' | 'jev-cloudflare' | 'jev-openrouter' | 'jev-fallback'
    fallback?: string
    config: Record<string, string>
  }
  router: {
    provider: 'jev-router' | 'keyword-router'
    config: Record<string, string>
  }
  memory: {
    provider: 'openviking' | 'filesystem-fallback'
    config: Record<string, string>
  }
  device: {
    provider: 'argent' | 'artemis' | 'device-fallback'
    config: Record<string, string>
  }
  session: {
    provider: 'herdr' | 'tmux-fallback'
    config: Record<string, string>
  }
}
