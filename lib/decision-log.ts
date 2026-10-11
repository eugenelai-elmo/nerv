import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { DimensionScore } from './types.js'

const LOG_DIR = join(homedir(), '.cache', 'nerv')
export const DECISION_LOG = join(LOG_DIR, 'decisions.jsonl')

export type LabelSource = 'explicit' | 'rule'

export interface DecisionLogEntry {
  ts: string
  decision: string
  state: string
  predicted: string | null
  provider: string | null
  scores?: DimensionScore[]
  label?: string
  labelSource?: LabelSource
}

let ensured = false

// Training data for a future fine-tune: raw input + model prediction + label when one is known.
export async function logDecision(entry: Omit<DecisionLogEntry, 'ts'>): Promise<void> {
  try {
    if (!ensured) {
      await mkdir(LOG_DIR, { recursive: true })
      ensured = true
    }
    await appendFile(DECISION_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf-8')
  } catch {
    // best-effort — never block a decision on logging
  }
}
