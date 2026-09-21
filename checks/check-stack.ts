#!/usr/bin/env npx tsx
/**
 * NERV v2 — Structural Integrity Check
 *
 * Smoke-tests every layer of the stack. Each check is independent:
 * a failing layer doesn't block other checks.
 *
 * Usage: npx tsx checks/check-stack.ts [--layer N] [--verbose]
 */

import { readFile, stat, access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const exec = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERBOSE = process.argv.includes('--verbose')
const LAYER_FILTER = process.argv.includes('--layer')
  ? parseInt(process.argv[process.argv.indexOf('--layer') + 1], 10)
  : null

// ── Utilities ──────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn'

interface CheckResult {
  layer: number
  name: string
  status: CheckStatus
  message: string
  latencyMs: number
}

const results: CheckResult[] = []

function icon(status: CheckStatus): string {
  switch (status) {
    case 'pass': return '\x1b[32m✓\x1b[0m'
    case 'fail': return '\x1b[31m✗\x1b[0m'
    case 'skip': return '\x1b[90m○\x1b[0m'
    case 'warn': return '\x1b[33m⚠\x1b[0m'
  }
}

async function check(layer: number, name: string, fn: () => Promise<{ status: CheckStatus; message: string }>) {
  if (LAYER_FILTER !== null && LAYER_FILTER !== layer) return

  const start = performance.now()
  try {
    const { status, message } = await fn()
    const latencyMs = Math.round(performance.now() - start)
    results.push({ layer, name, status, message, latencyMs })
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start)
    results.push({ layer, name, status: 'fail', message: (err as Error).message, latencyMs })
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// ── Layer 0: Foundation ────────────────────────────────────────────

await check(0, 'providers.json parseable', async () => {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(raw)
  const required = ['scorer', 'router', 'memory', 'device', 'session']
  const missing = required.filter(k => !(k in config))
  if (missing.length > 0) return { status: 'fail', message: `Missing sections: ${missing.join(', ')}` }
  return { status: 'pass', message: `All ${required.length} provider sections present` }
})

await check(0, 'skill-inventory.json parseable', async () => {
  const raw = await readFile(join(ROOT, 'config', 'skill-inventory.json'), 'utf-8')
  const parsed = JSON.parse(raw)
  const skills = parsed.skills ?? parsed
  if (!Array.isArray(skills)) return { status: 'fail', message: 'Not an array' }
  return { status: 'pass', message: `${skills.length} skills registered` }
})

await check(0, 'env credentials present', async () => {
  const envPath = join(ROOT, '.env.local')
  if (!await fileExists(envPath)) return { status: 'fail', message: '.env.local not found' }
  const env = await readFile(envPath, 'utf-8')
  const keys = ['TYPESAFE_API_KEY']
  const found = keys.filter(k => env.includes(k))
  const missing = keys.filter(k => !env.includes(k))
  if (missing.length > 0) return { status: 'warn', message: `Missing: ${missing.join(', ')}` }
  return { status: 'pass', message: `${found.length}/${keys.length} keys configured` }
})

await check(0, 'TypeScript compiles', async () => {
  try {
    await exec('npx', ['tsc', '--noEmit'], { cwd: ROOT, timeout: 30_000 })
    return { status: 'pass', message: 'No type errors' }
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? (err as Error).message
    const errorLines = msg.split('\n').filter(l => l.includes('error TS'))
    return { status: 'fail', message: `${errorLines.length} type error(s)${VERBOSE ? ':\n' + errorLines.join('\n') : ''}` }
  }
})

await check(0, 'Provider files exist for config', async () => {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(raw) as Record<string, { provider: string }>
  const missing: string[] = []
  for (const [_layer, { provider }] of Object.entries(config)) {
    const providerPath = join(ROOT, 'providers', `${provider}.ts`)
    if (!await fileExists(providerPath)) missing.push(provider)
  }
  if (missing.length > 0) return { status: 'fail', message: `Missing provider files: ${missing.join(', ')}` }
  return { status: 'pass', message: 'All configured providers have source files' }
})

await check(0, 'Fallback providers exist', async () => {
  const fallbacks = ['jev-fallback', 'keyword-router', 'filesystem-fallback', 'device-fallback', 'tmux-fallback']
  const missing: string[] = []
  for (const fb of fallbacks) {
    if (!await fileExists(join(ROOT, 'providers', `${fb}.ts`))) missing.push(fb)
  }
  if (missing.length > 0) return { status: 'fail', message: `Missing fallback providers: ${missing.join(', ')}` }
  return { status: 'pass', message: `All ${fallbacks.length} fallback providers present` }
})

// ── Layer 1: Scorer (Jev) ──────────────────────────────────────────

await check(1, 'Jev TypeSafe API reachable', async () => {
  const envPath = join(ROOT, '.env.local')
  if (!await fileExists(envPath)) return { status: 'skip', message: 'No .env.local' }
  const env = await readFile(envPath, 'utf-8')
  const match = env.match(/TYPESAFE_API_KEY=(.+)/)
  if (!match) return { status: 'skip', message: 'No TYPESAFE_API_KEY' }

  const apiKey = match[1].trim()
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'jev-latest',
      state: 'NERV stack integrity check',
      questions: {
        ping: { type: 'noul', instructions: 'Is this a health check?' },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { status: 'fail', message: `API ${res.status}: ${text.slice(0, 100)}` }
  }

  const data = await res.json() as { answers: Record<string, { noul?: number }> }
  const prob = data.answers?.ping?.noul
  if (typeof prob !== 'number') return { status: 'fail', message: 'Unexpected response shape' }
  return { status: 'pass', message: `Jev responded, noul=${(prob * 100).toFixed(0)}%` }
})

await check(1, 'Scorer contract loads', async () => {
  const { score } = await import(join(ROOT, 'lib', 'scorer.js'))
  if (typeof score !== 'function') return { status: 'fail', message: 'score is not a function' }
  return { status: 'pass', message: 'score() exported' }
})

// ── Layer 2: Router ────────────────────────────────────────────────

await check(2, 'Router contract loads', async () => {
  const { route } = await import(join(ROOT, 'lib', 'router.js'))
  if (typeof route !== 'function') return { status: 'fail', message: 'route is not a function' }
  return { status: 'pass', message: 'route() exported' }
})

await check(2, 'Keyword fallback routes correctly', async () => {
  const { default: kw } = await import(join(ROOT, 'providers', 'keyword-router.js'))
  const inventory = JSON.parse(
    await readFile(join(ROOT, 'config', 'skill-inventory.json'), 'utf-8')
  )
  const skills = inventory.skills ?? inventory
  const matches = await kw.route('review this PR on elmo-application', skills)
  if (matches.length === 0) return { status: 'warn', message: 'No matches for a known PR review prompt' }
  return { status: 'pass', message: `${matches.length} match(es): ${matches.map((m: { name: string }) => m.name).join(', ')}` }
})

await check(2, 'Hook script exists and is executable', async () => {
  const hookPath = join(ROOT, 'hooks', 'skill-router.sh')
  if (!await fileExists(hookPath)) return { status: 'fail', message: 'hooks/skill-router.sh not found' }
  const info = await stat(hookPath)
  const isExec = (info.mode & 0o111) !== 0
  if (!isExec) return { status: 'warn', message: 'Hook exists but is not executable' }
  return { status: 'pass', message: 'Hook present and executable' }
})

// ── Layer 3: Session (Herdr) ───────────────────────────────────────

await check(3, 'Herdr binary installed', async () => {
  try {
    const { stdout } = await exec('herdr', ['--version'], { timeout: 3_000 })
    return { status: 'pass', message: `herdr ${stdout.trim()}` }
  } catch {
    return { status: 'fail', message: 'herdr not found in PATH' }
  }
})

await check(3, 'Herdr socket alive', async () => {
  const socketPath = join(homedir(), '.config', 'herdr', 'herdr.sock')
  try {
    const info = await stat(socketPath)
    if (!info.isSocket()) return { status: 'fail', message: 'Path exists but is not a socket' }
    return { status: 'pass', message: `Socket at ${socketPath}` }
  } catch {
    return { status: 'fail', message: `Socket not found at ${socketPath}` }
  }
})

await check(3, 'Herdr workspace listing', async () => {
  try {
    const { stdout } = await exec('herdr', ['workspace', 'list'], { timeout: 5_000 })
    const data = JSON.parse(stdout) as { result: { workspaces: unknown[] } }
    const count = data.result.workspaces.length
    return { status: 'pass', message: `${count} workspace(s)` }
  } catch (err) {
    return { status: 'fail', message: (err as Error).message }
  }
})

// ── Layer 4: Memory ────────────────────────────────────────────────

await check(4, 'Memory contract loads', async () => {
  const mod = await import(join(ROOT, 'lib', 'memory.js'))
  const fns = ['recall', 'save', 'list']
  const missing = fns.filter(f => typeof mod[f] !== 'function')
  if (missing.length > 0) return { status: 'fail', message: `Missing exports: ${missing.join(', ')}` }
  return { status: 'pass', message: 'recall(), save(), list() exported' }
})

await check(4, 'Filesystem fallback can recall', async () => {
  const { default: fb } = await import(join(ROOT, 'providers', 'filesystem-fallback.js'))
  const entries = await fb.recall('initiatives', 'L0')
  return { status: 'pass', message: `${entries.length} entries at L0 from initiatives/` }
})

await check(4, 'Filesystem fallback can list', async () => {
  const { default: fb } = await import(join(ROOT, 'providers', 'filesystem-fallback.js'))
  const paths = await fb.list('initiatives')
  return { status: 'pass', message: `${paths.length} paths under initiatives/` }
})

await check(4, 'OpenViking reachable', async () => {
  const url = process.env.OPENVIKING_URL ?? 'http://localhost:8420'
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) })
    if (res.ok) return { status: 'pass', message: `OpenViking at ${url}` }
    return { status: 'warn', message: `OpenViking ${res.status} at ${url}` }
  } catch {
    return { status: 'skip', message: `OpenViking not running at ${url} (Layer 4 optional — filesystem fallback active)` }
  }
})

// ── Layer 5: Device ────────────────────────────────────────────────

await check(5, 'Device contract loads', async () => {
  const mod = await import(join(ROOT, 'lib', 'device.js'))
  const fns = ['listDevices', 'screenshot', 'tap', 'swipe', 'typeText', 'launchApp', 'logcat']
  const missing = fns.filter(f => typeof mod[f] !== 'function')
  if (missing.length > 0) return { status: 'fail', message: `Missing exports: ${missing.join(', ')}` }
  return { status: 'pass', message: `All ${fns.length} device functions exported` }
})

await check(5, 'ADB installed', async () => {
  try {
    const { stdout } = await exec('adb', ['version'], { timeout: 3_000 })
    const version = stdout.split('\n')[0]
    return { status: 'pass', message: version }
  } catch {
    return { status: 'skip', message: 'ADB not found — install Android SDK for device automation' }
  }
})

await check(5, 'ADB devices connected', async () => {
  try {
    const { stdout } = await exec('adb', ['devices'], { timeout: 5_000 })
    const lines = stdout.split('\n').slice(1).filter(l => l.trim() && l.includes('device'))
    if (lines.length === 0) return { status: 'skip', message: 'No devices/emulators connected' }
    return { status: 'pass', message: `${lines.length} device(s) connected` }
  } catch {
    return { status: 'skip', message: 'ADB not available' }
  }
})

await check(5, 'ARTEMIS MCP reachable', async () => {
  const url = process.env.ARTEMIS_MCP_URL ?? 'http://localhost:8700'
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) })
    if (res.ok) return { status: 'pass', message: `ARTEMIS MCP at ${url}` }
    return { status: 'warn', message: `ARTEMIS ${res.status} at ${url}` }
  } catch {
    return { status: 'skip', message: `ARTEMIS not running at ${url} (Layer 5 optional — device fallback active)` }
  }
})

// ── Report ─────────────────────────────────────────────────────────

console.log('')
console.log('\x1b[1mNERV v2 — Stack Integrity Report\x1b[0m')
console.log('═'.repeat(60))

let currentLayer = -1
for (const r of results) {
  if (r.layer !== currentLayer) {
    currentLayer = r.layer
    const layerNames = ['Foundation', 'Scorer (Jev)', 'Router', 'Session (Herdr)', 'Memory', 'Device (ARTEMIS)']
    console.log(`\n\x1b[1mLayer ${r.layer}: ${layerNames[r.layer]}\x1b[0m`)
  }
  const latency = r.latencyMs > 0 ? ` \x1b[90m${r.latencyMs}ms\x1b[0m` : ''
  console.log(`  ${icon(r.status)} ${r.name}${latency}`)
  if (r.message && (VERBOSE || r.status !== 'pass')) {
    console.log(`    ${r.message}`)
  }
}

// Summary
console.log('\n' + '─'.repeat(60))
const counts = { pass: 0, fail: 0, warn: 0, skip: 0 }
for (const r of results) counts[r.status]++

const parts: string[] = []
if (counts.pass) parts.push(`\x1b[32m${counts.pass} pass\x1b[0m`)
if (counts.fail) parts.push(`\x1b[31m${counts.fail} fail\x1b[0m`)
if (counts.warn) parts.push(`\x1b[33m${counts.warn} warn\x1b[0m`)
if (counts.skip) parts.push(`\x1b[90m${counts.skip} skip\x1b[0m`)
console.log(`\x1b[1mTotal: ${results.length} checks\x1b[0m — ${parts.join(', ')}`)

// Layer health summary
const layerStatus = new Map<number, CheckStatus>()
for (const r of results) {
  const current = layerStatus.get(r.layer) ?? 'pass'
  if (r.status === 'fail') layerStatus.set(r.layer, 'fail')
  else if (r.status === 'warn' && current !== 'fail') layerStatus.set(r.layer, 'warn')
  else if (r.status === 'skip' && current === 'pass') layerStatus.set(r.layer, 'skip')
  else if (!layerStatus.has(r.layer)) layerStatus.set(r.layer, r.status)
}

const layerNames = ['L0 Foundation', 'L1 Scorer', 'L2 Router', 'L3 Session', 'L4 Memory', 'L5 Device']
console.log('')
for (const [layer, status] of layerStatus) {
  console.log(`  ${icon(status)} ${layerNames[layer]}`)
}

console.log('')
process.exit(counts.fail > 0 ? 1 : 0)
