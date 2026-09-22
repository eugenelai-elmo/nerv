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
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const msg = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n')
    const errorLines = msg.split('\n').filter(l => l.includes('error TS'))
    if (errorLines.length === 0) return { status: 'warn', message: 'tsc exited non-zero but no TS errors found — check output manually' }
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

await check(1, 'Laya local server', async () => {
  const url = process.env.LAYA_URL ?? 'http://127.0.0.1:8421'
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) })
    if (res.ok) {
      const data = await res.json() as { model_loaded: boolean }
      return { status: 'pass', message: `Laya at ${url}, model_loaded=${data.model_loaded}` }
    }
    return { status: 'warn', message: `Laya ${res.status} at ${url}` }
  } catch {
    return { status: 'skip', message: `Laya not running at ${url} (optional — Jev fallback active)` }
  }
})

await check(1, 'Scorer fallback chain configured', async () => {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(raw)
  const primary = config.scorer?.provider
  const fallback = config.scorer?.fallback ?? 'jev-fallback'
  return { status: 'pass', message: `${primary} → ${fallback} → jev-fallback` }
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

await check(2, 'Skill routing delegated to superpowers', async () => {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  const config = JSON.parse(raw)
  const provider = config.router?.provider
  if (provider === 'jev-router') return { status: 'warn', message: 'Still using jev-router — superpowers handles skill routing in-context now' }
  return { status: 'pass', message: `Router provider: ${provider} (hook-based Jev routing retired)` }
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

// ── Layer 5: Mobile Automation ─────────────────────────────────────

await check(5, 'Device contract loads', async () => {
  const mod = await import(join(ROOT, 'lib', 'device.js'))
  const fns = ['listDevices', 'screenshot', 'tap', 'swipe', 'typeText', 'launchApp', 'logcat']
  const missing = fns.filter(f => typeof mod[f] !== 'function')
  if (missing.length > 0) return { status: 'fail', message: `Missing exports: ${missing.join(', ')}` }
  return { status: 'pass', message: `All ${fns.length} device functions exported` }
})

await check(5, 'Argent MCP configured', async () => {
  const repos = [
    join(homedir(), 'Projects', 'elmo-learning-mobile-app'),
    join(homedir(), 'Projects', 'rg-mobile-app'),
  ]
  for (const repo of repos) {
    try {
      const raw = await readFile(join(repo, '.mcp.json'), 'utf-8')
      const mcp = JSON.parse(raw)
      const hasArgent = Object.keys(mcp.mcpServers ?? mcp).some((k: string) => k.includes('argent'))
      if (hasArgent) return { status: 'pass', message: `Argent MCP in ${repo}` }
    } catch { continue }
  }
  return { status: 'skip', message: 'No Argent MCP found — run argent init in a mobile repo' }
})

await check(5, 'iOS Simulator available', async () => {
  try {
    const { stdout } = await exec('xcrun', ['simctl', 'list', 'devices', 'booted'], { timeout: 5_000 })
    const booted = stdout.split('\n').filter(l => l.includes('Booted'))
    if (booted.length > 0) return { status: 'pass', message: `${booted.length} booted: ${booted[0].trim()}` }
    return { status: 'skip', message: 'Xcode installed but no simulator running' }
  } catch {
    return { status: 'skip', message: 'Xcode / simctl not available' }
  }
})

await check(5, 'ADB installed (Android)', async () => {
  try {
    const { stdout } = await exec('adb', ['version'], { timeout: 3_000 })
    const version = stdout.split('\n')[0]
    return { status: 'pass', message: version }
  } catch {
    return { status: 'skip', message: 'ADB not found — iOS-only is fine for now' }
  }
})

// ── Decisions ──────────────────────────────────────────────────────

await check(6, 'Decision registry loads', async () => {
  const { listDecisions } = await import(join(ROOT, 'lib', 'decide.js'))
  const decisions = await listDecisions()
  if (decisions.length === 0) return { status: 'fail', message: 'No decisions found in decisions/' }
  return { status: 'pass', message: `${decisions.length} decisions: ${decisions.join(', ')}` }
})

await check(6, 'All decision JSONs parse', async () => {
  const { listDecisions, loadDecision } = await import(join(ROOT, 'lib', 'decide.js'))
  const decisions = await listDecisions() as string[]
  const errors: string[] = []
  for (const name of decisions) {
    try {
      const def = await loadDecision(name)
      if (!def.dimensions || def.dimensions.length === 0) errors.push(`${name}: no dimensions`)
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`)
    }
  }
  if (errors.length > 0) return { status: 'fail', message: errors.join('; ') }
  return { status: 'pass', message: `All ${decisions.length} decisions valid` }
})

await check(6, 'decide() contract loads', async () => {
  const { decide } = await import(join(ROOT, 'lib', 'decide.js'))
  if (typeof decide !== 'function') return { status: 'fail', message: 'decide is not a function' }
  return { status: 'pass', message: 'decide() exported' }
})

// ── Integration: Wiring ───────────────────────────────────────

const SETTINGS_PATHS = [
  join(ROOT, '.claude', 'settings.json'),
  join(ROOT, '.claude', 'settings.local.json'),
  join(homedir(), '.claude', 'settings.json'),
]

async function loadAllHookCommands(): Promise<string[]> {
  const commands: string[] = []
  for (const p of SETTINGS_PATHS) {
    try {
      const raw = await readFile(p, 'utf-8')
      const settings = JSON.parse(raw)
      const hooks = settings.hooks ?? {}
      for (const event of Object.values(hooks) as Array<unknown>) {
        if (!Array.isArray(event)) continue
        for (const entry of event) {
          const e = entry as { hooks?: Array<{ command?: string }> }
          for (const h of e.hooks ?? []) {
            if (h.command) commands.push(h.command)
          }
        }
      }
    } catch { continue }
  }
  return commands
}

await check(7, 'Hook scripts audited (wired vs orphaned)', async () => {
  const hookFiles = (await import('node:fs/promises')).readdir
  const entries = await hookFiles(join(ROOT, 'hooks'))
  const shellScripts = entries.filter((f: string) => f.endsWith('.sh'))
  const helperScripts = entries.filter((f: string) => f.endsWith('.ts'))

  const commands = await loadAllHookCommands()
  const commandsStr = commands.join(' ')

  // Check which shell hooks (entry points) are wired in settings.json
  const wired: string[] = []
  const orphaned: string[] = []
  for (const script of shellScripts) {
    const name = script.replace(/\.sh$/, '')
    if (commandsStr.includes(script) || commandsStr.includes(name)) {
      wired.push(script)
    } else {
      orphaned.push(script)
    }
  }

  // Check which .ts helpers are called by any shell hook
  const allShellContent = await Promise.all(
    shellScripts.map(f => readFile(join(ROOT, 'hooks', f), 'utf-8'))
  )
  const shellContentStr = allShellContent.join(' ')
  const unreferencedHelpers = helperScripts.filter(f => !shellContentStr.includes(f))

  const problems: string[] = []
  if (orphaned.length > 0) problems.push(`Orphaned hooks: ${orphaned.join(', ')}`)
  if (unreferencedHelpers.length > 0) problems.push(`Unreferenced helpers: ${unreferencedHelpers.join(', ')}`)

  if (problems.length > 0) {
    return { status: 'warn', message: `Wired: ${wired.join(', ')}. ${problems.join('. ')}` }
  }
  return { status: 'pass', message: `${wired.length} hooks wired, ${helperScripts.length} helpers referenced` }
})

await check(7, 'Settings hooks point to existing scripts', async () => {
  const commands = await loadAllHookCommands()
  const missing: string[] = []
  for (const cmd of commands) {
    const expanded = cmd
      .replace(/\$HOME/g, homedir())
      .replace(/\$\{HOME\}/g, homedir())
      .replace(/\$\{CLAUDE_PROJECT_DIR\}/g, ROOT)
    const parts = expanded.split(/\s+/)
    const scriptPath = parts.find(p => p.endsWith('.sh') || p.endsWith('.ts') || p.endsWith('.mjs'))
    if (!scriptPath) continue
    const resolved = scriptPath.startsWith('/') ? scriptPath : join(ROOT, scriptPath)
    if (!await fileExists(resolved)) {
      missing.push(scriptPath)
    }
  }
  if (missing.length > 0) return { status: 'fail', message: `Scripts not found: ${missing.join(', ')}` }
  return { status: 'pass', message: `All ${commands.length} hook commands resolve to existing scripts` }
})

await check(7, 'Layer 4 (Memory) has callers in hooks', async () => {
  const hookDir = join(ROOT, 'hooks')
  const hookEntries = await (await import('node:fs/promises')).readdir(hookDir)
  const callers: string[] = []
  for (const f of hookEntries) {
    if (!f.endsWith('.sh') && !f.endsWith('.ts')) continue
    const content = await readFile(join(hookDir, f), 'utf-8')
    if (content.includes('memory') || content.includes('recall') || content.includes('save(')) {
      callers.push(f)
    }
  }
  if (callers.length === 0) {
    return { status: 'fail', message: 'No hook calls recall(), save(), or imports memory — Layer 4 is structurally valid but functionally dead' }
  }
  return { status: 'pass', message: `Memory called from: ${callers.join(', ')}` }
})

await check(7, 'Decision hooks resolve to definitions', async () => {
  const hookDir = join(ROOT, 'hooks')
  const hookEntries = await (await import('node:fs/promises')).readdir(hookDir)
  const referencedDecisions: string[] = []
  for (const f of hookEntries) {
    if (!f.endsWith('.sh')) continue
    const content = await readFile(join(hookDir, f), 'utf-8')
    const match = content.match(/decide\.ts\s+(\S+)/)
    if (match) referencedDecisions.push(match[1])
  }
  if (referencedDecisions.length === 0) {
    return { status: 'skip', message: 'No hooks reference decide.ts' }
  }
  const missing: string[] = []
  for (const name of referencedDecisions) {
    if (!await fileExists(join(ROOT, 'decisions', `${name}.json`))) {
      missing.push(name)
    }
  }
  if (missing.length > 0) return { status: 'fail', message: `Hooks reference missing decisions: ${missing.join(', ')}` }
  return { status: 'pass', message: `All referenced decisions exist: ${referencedDecisions.join(', ')}` }
})

await check(7, 'Wired hooks invoke their layers', async () => {
  // Trace the full call chain: settings.json → shell hook → helper scripts → lib/
  const commands = await loadAllHookCommands()
  const nervCommands = commands.filter(c => c.includes('nerv'))

  // Read all wired shell hooks and their .ts helpers to find lib/ imports
  const hookDir = join(ROOT, 'hooks')
  const allHookFiles = await (await import('node:fs/promises')).readdir(hookDir)
  const allContent: string[] = []
  for (const f of allHookFiles) {
    if (!f.endsWith('.sh') && !f.endsWith('.ts')) continue
    allContent.push(await readFile(join(hookDir, f), 'utf-8'))
  }
  const contentStr = allContent.join('\n') + '\n' + nervCommands.join('\n')

  const layersCalled = new Set<string>()

  // L1:Scorer — called transitively via decide.ts → decide() → score()
  if (contentStr.includes('decide') || contentStr.includes('scorer') || contentStr.includes('score(')) {
    layersCalled.add('L1:Scorer')
  }
  // L2:Router — keyword-router is kept for programmatic use; superpowers routes in-context
  if (contentStr.includes('route-prompt') || contentStr.includes('skill-router') || contentStr.includes('router')) {
    layersCalled.add('L2:Router')
  }
  // L3:Session — Herdr is the session container, not called from hooks
  // Mark as wired if we're running inside Herdr (checked separately)
  // L4:Memory
  if (contentStr.includes('memory') || contentStr.includes('recall(') || contentStr.includes("'../lib/memory")) {
    layersCalled.add('L4:Memory')
  }
  // L5:Mobile — on-demand, not expected in every hook chain
  if (contentStr.includes('device') || contentStr.includes('argent') || contentStr.includes('mobile')) {
    layersCalled.add('L5:Mobile')
  }
  // L6:Decisions — called via hooks/decide.ts
  if (contentStr.includes('decide')) {
    layersCalled.add('L6:Decisions')
  }

  // L3 and L5 are on-demand layers — warn only on L4 (should be in the data path)
  const criticalLayers = ['L1:Scorer', 'L4:Memory', 'L6:Decisions']
  const onDemandLayers = ['L2:Router', 'L3:Session', 'L5:Mobile']
  const missingCritical = criticalLayers.filter(l => !layersCalled.has(l))
  const missingOnDemand = onDemandLayers.filter(l => !layersCalled.has(l))

  if (missingCritical.length > 0) {
    return { status: 'fail', message: `Critical layers unwired: ${missingCritical.join(', ')}. On-demand (OK): ${missingOnDemand.join(', ')}` }
  }
  if (missingOnDemand.length > 0) {
    return { status: 'pass', message: `Critical layers wired: ${[...layersCalled].filter(l => criticalLayers.includes(l)).join(', ')}. On-demand: ${missingOnDemand.join(', ')}` }
  }
  return { status: 'pass', message: `All layers reachable from hooks: ${[...layersCalled].join(', ')}` }
})

await check(7, 'Session runs inside Herdr', async () => {
  try {
    const { stdout } = await exec('herdr', ['workspace', 'list'], { timeout: 5_000 })
    const data = JSON.parse(stdout) as { result: { workspaces: Array<{ focused: boolean; label: string }> } }
    const focused = data.result.workspaces.find(w => w.focused)
    if (focused) return { status: 'pass', message: `Inside Herdr workspace: ${focused.label}` }
    return { status: 'warn', message: 'Herdr running but no workspace focused — session may not be protected' }
  } catch {
    return { status: 'warn', message: 'Cannot determine if session is inside Herdr' }
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
    const layerNames = ['Foundation', 'Scorer (Jev)', 'Router', 'Session (Herdr)', 'Memory', 'Mobile (Argent+ARTEMIS)', 'Decisions', 'Wiring (Integration)']
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

const layerNames = ['L0 Foundation', 'L1 Scorer', 'L2 Router', 'L3 Session', 'L4 Memory', 'L5 Mobile', 'L6 Decisions', 'Wiring']
console.log('')
for (const [layer, status] of layerStatus) {
  console.log(`  ${icon(status)} ${layerNames[layer]}`)
}

console.log('')
process.exit(counts.fail > 0 ? 1 : 0)
