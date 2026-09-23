#!/usr/bin/env npx tsx
/**
 * nerv mobile — Preflight, launch, and connect to the ELMO mobile dev environment.
 *
 * Usage:
 *   npx tsx commands/mobile.ts              # preflight check (what's ready, what's missing)
 *   npx tsx commands/mobile.ts start        # start what's missing and connect
 *   npx tsx commands/mobile.ts start ios    # start iOS Simulator specifically
 *   npx tsx commands/mobile.ts start android # start Android Emulator specifically
 *   npx tsx commands/mobile.ts stop         # tear down dev server + simulators
 *   npx tsx commands/mobile.ts dev "task"   # infer mode via Laya and dispatch to orchestrator
 *   npx tsx commands/mobile.ts dev plan "task"  # explicit mode (plan/sync/implement)
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { decide } from '../lib/decide.js'

const exec = promisify(execFile)
const MOBILE_REPO = join(homedir(), 'Projects', 'elmo-learning-mobile-app')
const RG_REPO = join(homedir(), 'Projects', 'rg-mobile-app')

const MODE = process.argv[2] ?? 'check'
const PLATFORM = process.argv[3] ?? 'ios'

// ── Utilities ──────────────────────────────────────────────────────

type Status = 'ready' | 'missing' | 'stopped' | 'error'

interface CheckResult {
  name: string
  status: Status
  message: string
  fix?: string
}

const results: CheckResult[] = []

function icon(s: Status): string {
  switch (s) {
    case 'ready': return '\x1b[32m✓\x1b[0m'
    case 'missing': return '\x1b[31m✗\x1b[0m'
    case 'stopped': return '\x1b[33m○\x1b[0m'
    case 'error': return '\x1b[31m!\x1b[0m'
  }
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await exec('which', [cmd], { timeout: 3_000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const info = await stat(p)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function processRunning(pattern: string): Promise<boolean> {
  try {
    const { stdout } = await exec('pgrep', ['-f', pattern], { timeout: 3_000 })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function run(cmd: string, args: string[], opts?: { cwd?: string; timeout?: number }): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: opts?.timeout ?? 10_000, cwd: opts?.cwd })
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, stdout: e.stdout?.trim() ?? '', stderr: e.stderr?.trim() ?? e.message ?? '' }
  }
}

// ── Checks ─────────────────────────────────────────────────────────

async function checkToolchain() {
  // Node
  const node = await which('node')
  if (node) {
    const { stdout } = await exec('node', ['--version'])
    results.push({ name: 'Node.js', status: 'ready', message: stdout.trim() })
  } else {
    results.push({ name: 'Node.js', status: 'missing', message: 'Not installed', fix: 'brew install node' })
  }

  // Watchman
  const watchman = await which('watchman')
  if (watchman) {
    results.push({ name: 'Watchman', status: 'ready', message: watchman })
  } else {
    results.push({ name: 'Watchman', status: 'missing', message: 'Metro bundler will be slower without it', fix: 'brew install watchman' })
  }

  // Expo CLI
  const expo = await which('expo')
  const npxExpo = await run('npx', ['expo', '--version'])
  if (expo || npxExpo.ok) {
    results.push({ name: 'Expo CLI', status: 'ready', message: npxExpo.ok ? `v${npxExpo.stdout}` : expo! })
  } else {
    results.push({ name: 'Expo CLI', status: 'missing', message: 'Required for mobile dev', fix: 'npm install -g expo-cli' })
  }

  // Yarn
  const yarn = await which('yarn')
  if (yarn) {
    results.push({ name: 'Yarn', status: 'ready', message: yarn })
  } else {
    results.push({ name: 'Yarn', status: 'missing', message: 'Mobile repos use yarn', fix: 'npm install -g yarn' })
  }
}

async function checkPlatformTools() {
  // iOS — Xcode + simctl
  const xcrun = await which('xcrun')
  if (xcrun) {
    const { ok, stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted'])
    const bootedLines = stdout.split('\n').filter(l => l.includes('Booted'))
    if (bootedLines.length > 0) {
      results.push({ name: 'iOS Simulator', status: 'ready', message: `${bootedLines.length} booted: ${bootedLines[0].trim()}` })
    } else {
      results.push({ name: 'iOS Simulator', status: 'stopped', message: 'Xcode installed, no simulator running', fix: 'open -a Simulator' })
    }
  } else {
    results.push({ name: 'iOS Simulator', status: 'missing', message: 'Xcode not installed', fix: 'Install Xcode from App Store' })
  }

  // Android — adb
  const adb = await which('adb')
  if (adb) {
    const { ok, stdout } = await run('adb', ['devices'])
    const devices = stdout.split('\n').slice(1).filter(l => l.trim() && l.includes('device'))
    if (devices.length > 0) {
      results.push({ name: 'Android Emulator', status: 'ready', message: `${devices.length} device(s)` })
    } else {
      results.push({ name: 'Android Emulator', status: 'stopped', message: 'ADB installed, no devices', fix: 'Start Android Emulator from Android Studio' })
    }
  } else {
    results.push({ name: 'Android Emulator', status: 'missing', message: 'ADB not installed', fix: 'brew install android-platform-tools' })
  }
}

async function checkRepos() {
  if (await dirExists(MOBILE_REPO)) {
    const hasModules = await dirExists(join(MOBILE_REPO, 'node_modules'))
    results.push({
      name: 'ELMO Mobile repo',
      status: hasModules ? 'ready' : 'stopped',
      message: hasModules ? MOBILE_REPO : 'Repo exists but node_modules missing',
      fix: hasModules ? undefined : `cd ${MOBILE_REPO} && yarn install`,
    })
  } else {
    results.push({ name: 'ELMO Mobile repo', status: 'missing', message: `Not found at ${MOBILE_REPO}` })
  }

  if (await dirExists(RG_REPO)) {
    results.push({ name: 'RG Mobile repo', status: 'ready', message: RG_REPO })
  } else {
    results.push({ name: 'RG Mobile repo', status: 'missing', message: `Not found at ${RG_REPO}` })
  }
}

async function checkDevServer() {
  const metroRunning = await processRunning('metro')
  const expoRunning = await processRunning('expo start')

  if (metroRunning || expoRunning) {
    results.push({ name: 'Metro/Expo dev server', status: 'ready', message: metroRunning ? 'Metro bundler running' : 'Expo dev server running' })
  } else {
    results.push({ name: 'Metro/Expo dev server', status: 'stopped', message: 'Not running', fix: 'cd <mobile-repo> && npx expo start' })
  }
}

async function checkSkills() {
  // Argent MCP
  const mobileRepo = (await dirExists(MOBILE_REPO)) ? MOBILE_REPO : RG_REPO
  if (await dirExists(mobileRepo)) {
    const mcpPath = join(mobileRepo, '.mcp.json')
    try {
      const raw = await readFile(mcpPath, 'utf-8')
      const mcp = JSON.parse(raw)
      const hasArgent = Object.keys(mcp.mcpServers ?? mcp).some(k => k.includes('argent'))
      if (hasArgent) {
        results.push({ name: 'Argent MCP server', status: 'ready', message: `Configured in ${mcpPath}` })
      } else {
        results.push({ name: 'Argent MCP server', status: 'missing', message: 'Not in .mcp.json', fix: 'pnpm add -Dw @swmansion/argent && argent init' })
      }
    } catch {
      results.push({ name: 'Argent MCP server', status: 'missing', message: 'No .mcp.json found', fix: 'argent init in the mobile repo' })
    }
  } else {
    results.push({ name: 'Argent MCP server', status: 'missing', message: 'No mobile repo found' })
  }

  // mobile-tooling plugin
  const pluginPath = join(homedir(), 'Projects', 'elmo-skills-marketplace', 'plugins', 'mobile-tooling')
  if (await dirExists(pluginPath)) {
    results.push({ name: 'mobile-tooling plugin', status: 'ready', message: 'Available in skills marketplace' })
  } else {
    results.push({ name: 'mobile-tooling plugin', status: 'missing', message: 'Skills marketplace not found' })
  }
}

// ── Start ──────────────────────────────────────────────────────────

async function startSimulator() {
  if (PLATFORM === 'ios' || PLATFORM === 'both') {
    console.log('\x1b[1mStarting iOS Simulator...\x1b[0m')
    await run('open', ['-a', 'Simulator'])
    // Wait for boot
    for (let i = 0; i < 30; i++) {
      const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted'])
      if (stdout.includes('Booted')) {
        console.log('  iOS Simulator booted')
        break
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  if (PLATFORM === 'android' || PLATFORM === 'both') {
    console.log('\x1b[1mStarting Android Emulator...\x1b[0m')
    const { ok, stdout } = await run('emulator', ['-list-avds'])
    if (ok && stdout) {
      const avd = stdout.split('\n')[0]
      console.log(`  Launching AVD: ${avd}`)
      // Launch in background — don't wait
      exec('emulator', ['-avd', avd, '-no-snapshot-save'], { timeout: 60_000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 5000))
      console.log('  Android Emulator launching (may take a minute)')
    } else {
      console.log('  No AVDs found — create one in Android Studio')
    }
  }
}

async function startDevServer() {
  const repo = (await dirExists(MOBILE_REPO)) ? MOBILE_REPO : RG_REPO
  if (!await dirExists(repo)) {
    console.log('  No mobile repo found — cannot start dev server')
    return
  }

  console.log(`\x1b[1mStarting Expo dev server in ${repo}...\x1b[0m`)
  console.log('  Run this in a separate terminal:')
  console.log(`  \x1b[36mcd ${repo} && npx expo start\x1b[0m`)
  console.log('')
  console.log('  Or in Herdr:')
  console.log(`  \x1b[36mherdr pane send-keys w1:t1:p1 "cd ${repo} && npx expo start" Enter\x1b[0m`)
}

// ── Dev subcommand ────────────────────────────────────────────────

const DEV_MODES = ['implement', 'plan', 'sync'] as const
type DevMode = typeof DEV_MODES[number]

interface DevArgs {
  mode: DevMode
  task: string
  explicitMode: boolean
}

function parseDevArgs(argv: string[]): DevArgs {
  // argv: everything after 'dev', e.g. ['plan', 'add dark mode toggle'] or ['add dark mode toggle']
  const first = argv[0] ?? ''
  if (DEV_MODES.includes(first as DevMode)) {
    return {
      mode: first as DevMode,
      task: argv.slice(1).join(' '),
      explicitMode: true,
    }
  }
  return {
    mode: 'implement',
    task: argv.join(' '),
    explicitMode: false,
  }
}

async function handleDev(argv: string[]) {
  const args = parseDevArgs(argv)

  if (!args.task) {
    console.log('\x1b[33mUsage: nerv mobile dev [plan|sync|implement] "task description"\x1b[0m')
    process.exit(1)
  }

  let mode = args.mode
  let modeLabel: string

  if (args.explicitMode) {
    modeLabel = '(explicit)'
  } else {
    try {
      const result = await decide('dev-mode', args.task)
      if (DEV_MODES.includes(result.decision as DevMode)) {
        mode = result.decision as DevMode
      }
      modeLabel = `(inferred via ${result.provider}, ${result.latencyMs}ms)`
    } catch {
      modeLabel = '(default)'
    }
  }

  console.log('')
  console.log('\x1b[1mNERV Mobile — Dev\x1b[0m')
  console.log('═'.repeat(50))
  console.log(`  Task:  ${args.task}`)
  console.log(`  Mode:  ${mode} ${modeLabel}`)
  console.log('')

  // Route to orchestrator (flowmo by default)
  console.log(`\x1b[90mDispatching to flowmo → ${mode}...\x1b[0m`)
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  // Route 'dev' subcommand before the environment check flow
  if (MODE === 'dev') {
    await handleDev(process.argv.slice(3))
    return
  }

  console.log('')
  console.log('\x1b[1mNERV Mobile — Developer Environment\x1b[0m')
  console.log('═'.repeat(50))

  await checkToolchain()
  await checkPlatformTools()
  await checkRepos()
  await checkDevServer()
  await checkSkills()

  // Print results
  const groups = [
    { name: 'Toolchain', items: ['Node.js', 'Watchman', 'Expo CLI', 'Yarn'] },
    { name: 'Platform', items: ['iOS Simulator', 'Android Emulator'] },
    { name: 'Repos', items: ['ELMO Mobile repo', 'RG Mobile repo'] },
    { name: 'Runtime', items: ['Metro/Expo dev server'] },
    { name: 'Skills', items: ['Argent MCP server', 'mobile-tooling plugin'] },
  ]

  for (const group of groups) {
    console.log(`\n\x1b[1m${group.name}\x1b[0m`)
    for (const itemName of group.items) {
      const r = results.find(x => x.name === itemName)
      if (!r) continue
      console.log(`  ${icon(r.status)} ${r.name}: ${r.message}`)
      if (r.fix && r.status !== 'ready') {
        console.log(`    \x1b[90mFix: ${r.fix}\x1b[0m`)
      }
    }
  }

  // Summary
  const ready = results.filter(r => r.status === 'ready').length
  const total = results.length
  const blocked = results.filter(r => r.status === 'missing')

  console.log('\n' + '─'.repeat(50))
  console.log(`\x1b[1m${ready}/${total} ready\x1b[0m`)

  if (blocked.length > 0) {
    console.log(`\n\x1b[33mBlockers:\x1b[0m`)
    for (const b of blocked) {
      console.log(`  - ${b.name}: ${b.fix ?? b.message}`)
    }
  }

  // Start mode
  if (MODE === 'start') {
    console.log('\n\x1b[1mStarting...\x1b[0m')

    const simResult = results.find(r => r.name === (PLATFORM === 'android' ? 'Android Emulator' : 'iOS Simulator'))
    if (simResult && simResult.status !== 'ready') {
      await startSimulator()
    } else {
      console.log(`  ${PLATFORM === 'android' ? 'Android' : 'iOS'} already running`)
    }

    const devServer = results.find(r => r.name === 'Metro/Expo dev server')
    if (devServer && devServer.status !== 'ready') {
      await startDevServer()
    } else {
      console.log('  Dev server already running')
    }

    console.log('\n\x1b[32mMobile environment ready.\x1b[0m')
    console.log('Open a Claude Code session in the mobile repo to use Argent skills.')
  }

  if (MODE === 'stop') {
    console.log('\n\x1b[1mStopping...\x1b[0m')
    await run('xcrun', ['simctl', 'shutdown', 'all'])
    console.log('  iOS Simulators shut down')
    // Don't kill metro — it might be in a Herdr pane
    console.log('  (Metro/Expo dev server left running — stop it manually if needed)')
  }

  console.log('')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
