import { trace, now } from '../lib/trace.js'

const input = process.argv[2]
if (!input || input.length < 20) process.exit(0)

const LAYA_URL = process.env.LAYA_URL ?? 'http://127.0.0.1:8421'

try {
  const res = await fetch(`${LAYA_URL}/guard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: input }),
    signal: AbortSignal.timeout(3_000),
  })

  if (!res.ok) process.exit(0)

  const data = await res.json() as {
    flagged: boolean
    jailbreak: number
    prompt_injection: number
    sensitive_data: number
    harm_severity: string
    latency_ms: number
  }

  await trace({
    ts: now(),
    hook: 'guard-gate',
    layer: 'L1:Scorer',
    provider: 'laya-local',
    latencyMs: data.latency_ms,
    result: data.flagged ? `FLAGGED jailbreak=${data.jailbreak.toFixed(2)} injection=${data.prompt_injection.toFixed(2)} harm=${data.harm_severity}` : 'clean',
    matched: data.flagged,
    prompt_len: input.length,
  })

  if (data.flagged) {
    console.log(`⚠ GUARD: prompt injection detected — jailbreak=${(data.jailbreak * 100).toFixed(0)}% injection=${(data.prompt_injection * 100).toFixed(0)}% harm=${data.harm_severity} [${data.latency_ms}ms via laya]`)
  }
} catch {
  process.exit(0)
}
