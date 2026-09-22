import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const TRACE_DIR = join(homedir(), '.cache', 'nerv')
const TRACE_FILE = join(TRACE_DIR, 'trace.jsonl')

export interface TraceEntry {
  ts: string
  hook: string
  layer: string
  decision?: string
  provider?: string
  latencyMs?: number
  result?: string
  prompt_len?: number
  matched?: boolean
}

let ensured = false

export async function trace(entry: TraceEntry): Promise<void> {
  try {
    if (!ensured) {
      await mkdir(TRACE_DIR, { recursive: true })
      ensured = true
    }
    const line = JSON.stringify(entry) + '\n'
    await appendFile(TRACE_FILE, line, 'utf-8')
  } catch {
    // tracing is best-effort — never block the hook
  }
}

export function now(): string {
  return new Date().toISOString()
}
