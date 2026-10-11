import type { Mode } from './modes.js'

export interface RuleMatch {
  mode: Mode
  rule: 'exploratory'
}

const EXPLORATORY = /^(what would|what does it take|what's involved|how (should|would|could|do) (we|i)|should (we|i)|scope|compare|evaluate|investigate|explore|spike|options for|trade-?offs?)\b/i

// Deterministic mode checks; null means no rule applies (caller defaults to implement).
// A ticket key identifies the input, not the mode — it never decides the mode here.
export function ruleMode(task: string): RuleMatch | null {
  const text = task.trim()
  if (EXPLORATORY.test(text) || text.endsWith('?')) return { mode: 'plan', rule: 'exploratory' }
  return null
}
