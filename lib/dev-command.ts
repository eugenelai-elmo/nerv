import type { RepoContext } from './types.js'
import { decide } from './decide.js'
import { trace, now } from './trace.js'
import { ruleMode } from './dev-mode-rules.js'
import { OrchestratorNotFound } from './orchestrator-registry.js'
import { isMode, parseTaskInput, TASKLESS_MODES, type Mode, type TaskInput } from './modes.js'
import { pick, loadChain, resolveChainNames, NoOrchestrator, type Picked } from './orchestrate.js'
import { logDecision, type LabelSource } from './decision-log.js'
import { listTargets, resolveTarget, TargetError } from './targets.js'
import { sanitize } from './sanitize.js'

interface DevArgs {
  target: string | null
  task: string
  mode: Mode | null
  via?: string
  chain?: string
  repo?: string
  json: boolean
}

export interface RunDevOptions {
  // Fixed target (e.g. `nerv mobile dev` → mobile); otherwise the first positional names it.
  target?: string
  // How the command was invoked, for help text.
  usage?: string
}

const dim = (s: string) => `\x1b[90m${s}\x1b[0m`

export class DevArgsError extends Error {}

const VALUE_FLAGS = ['repo', 'via', 'chain'] as const
const BOOL_FLAGS = ['json'] as const

// Pure: throws DevArgsError on malformed input so it can be tested without exiting.
export function parseDevArgs(argv: string[], fixedTarget?: string): DevArgs {
  const values: Partial<Record<typeof VALUE_FLAGS[number], string>> = {}
  let json = false
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      positionals.push(a)
      continue
    }
    const eq = a.indexOf('=')
    const name = a.slice(2, eq === -1 ? undefined : eq)
    if ((BOOL_FLAGS as readonly string[]).includes(name)) {
      if (eq !== -1) throw new DevArgsError(`--${name} takes no value`)
      json = true
    } else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = eq !== -1 ? a.slice(eq + 1) : argv[i + 1]
      if (!value || (eq === -1 && value.startsWith('--'))) throw new DevArgsError(`--${name} needs a value, e.g. --${name} <${name === 'repo' ? 'path' : 'name'}>`)
      if (eq === -1) i++
      values[name as typeof VALUE_FLAGS[number]] = value
    } else {
      throw new DevArgsError(`Unknown option --${name}. Options: ${[...VALUE_FLAGS, ...BOOL_FLAGS].map(f => `--${f}`).join(', ')}`)
    }
  }
  const target = fixedTarget ?? positionals.shift() ?? null
  if (!fixedTarget && target && isMode(target)) {
    throw new DevArgsError(`Missing target — e.g. nerv dev mobile ${target}`)
  }
  const mode = positionals[0] && isMode(positionals[0]) ? positionals[0] : null
  const task = (mode ? positionals.slice(1) : positionals).join(' ')
  return { target, task, mode, via: values.via, chain: values.chain, repo: values.repo, json }
}

async function printDevHelp(usage: string, fixedTarget: string | undefined, chain: string[]) {
  const t = fixedTarget ? '' : '<target> '
  console.log('')
  console.log(`\x1b[1m${usage}\x1b[0m — orchestrated development, issued from the NERV seat`)
  console.log('')
  console.log('Usage:')
  console.log(`  ${usage} ${t}<task>                  implement (or plan, if phrased as a question)`)
  console.log(`  ${usage} ${t}plan <task>             plan only, no code`)
  console.log(`  ${usage} ${t}implement <task>        full run including code`)
  console.log(`  ${usage} ${t}pull <TICKET>           refresh the ticket from Jira only`)
  console.log(`  ${usage} ${t}rebase                  bring the branch up to date`)
  console.log(`  ${usage} ${t}ship                    open the PR`)
  console.log('')
  console.log('Options:')
  console.log('  --repo <path>    a specific worktree of the target')
  console.log('  --chain a,b,c    orchestrator order for this run')
  console.log('  --via <name>     force one orchestrator')
  console.log('  --json           machine-readable output')
  console.log('')
  if (!fixedTarget) {
    const targets = await listTargets()
    const aliases = targets.filter(x => x.source === 'alias').map(x => sanitize(x.name))
    const example = sanitize(targets.find(x => x.source === 'flowmo registry')?.name ?? 'elmo-application')
    console.log(`Targets: \x1b[36m${aliases.join(', ')}\x1b[0m ${dim('(dev.targets)')} — or any flowmo repo name, e.g. ${dim(example)}`)
  }
  console.log(`Chain:   \x1b[36m${chain.map(c => sanitize(c)).join(' → ')}\x1b[0m ${dim('(dev.chain)')}`)
  console.log('')
}

function renderDev(p: {
  args: DevArgs
  mode: Mode
  modeLabel: string
  input: TaskInput
  repo: RepoContext
  chainNames: string[]
  picked: Picked
}) {
  const { args, mode, modeLabel, input, repo, chainNames, picked } = p
  // Every value below can come from a repo on disk or from the command line — sanitize values, never the format.
  const v = (s: string | null | undefined) => sanitize(s ?? '')
  const chain = chainNames.map(v).join(' → ')
  const chainLabel = args.via ? '(forced with --via)' : args.chain ? `(--chain ${chain})` : `(chain ${chain})`

  console.log('')
  console.log(`\x1b[1mNERV Dev\x1b[0m → \x1b[36m${v(args.target)}\x1b[0m ${dim(v(repo.name))}`)
  console.log('═'.repeat(50))
  if (input.text) console.log(`  Task:    ${v(input.text)}`)
  if (input.ticket) console.log(`  Ticket:  ${v(input.ticket)}`)
  console.log(`  Mode:    ${mode} ${dim(modeLabel)}`)
  console.log(`  Via:     \x1b[36m${v(picked.orchestrator.name)}\x1b[0m ${dim(chainLabel)}`)
  // nerv only claims the modes it owns; its skip on every other mode is noise
  for (const s of picked.skipped.filter(s => s.name !== 'nerv')) console.log(`  ${dim(`Skipped: ${v(s.name)} — ${v(s.reason)}`)}`)
  console.log(`  Repo:    ${v(repo.path)}`)
  console.log('')

  const r = picked.resolution
  if (r.kind === 'invoke') {
    const invocation = v(r.invocation)
    const width = Math.max(invocation.length + 6, 48)
    console.log('┌' + '─'.repeat(width) + '┐')
    console.log('│ ' + '\x1b[1mInvoke:\x1b[0m' + ' '.repeat(width - 'Invoke:'.length - 1) + '│')
    console.log('│   ' + invocation + ' '.repeat(width - invocation.length - 3) + '│')
    console.log('└' + '─'.repeat(width) + '┘')
  } else if (r.kind === 'playbook') {
    const prof = r.profile
    console.log(`\x1b[1mFollow:\x1b[0m ${v(r.playbook)}`)
    console.log('')
    console.log('Profile:')
    console.log(`  branch          ${prof.branch ? v(prof.branch) : '(detached)'} ${dim(v(prof.head?.slice(0, 10)))}`)
    console.log(`  base            ${v(prof.base)} ${dim(`(${v(prof.baseSource)})`)}`)
    console.log(`  packageManager  ${prof.packageManager ? v(prof.packageManager) : dim('(none detected)')}`)
    console.log(`  verify          ${prof.verify.length ? prof.verify.map(v).join('  ·  ') : dim('(none detected — ask what to run)')}`)
    if (prof.afterRebase.length) console.log(`  afterRebase     ${prof.afterRebase.map(v).join('  ·  ')}`)
    if (prof.slice) {
      console.log(`  slice           ${v(prof.slice.ticket)}${prof.slice.flowmo ? dim(' (flowmo — push gate re-runs after rebase)') : ''}`)
      for (const f of prof.slice.files) console.log(`                  ${v(f)}`)
      if (!prof.slice.files.length) console.log(`                  ${dim('(no plan/spec files found for this ticket)')}`)
    }
    for (const n of prof.notes ?? []) console.log(`  ${dim(`note: ${v(n)}`)}`)
    if (prof.blockers.length) {
      console.log('')
      console.log('\x1b[31mBlocked — resolve before rebasing:\x1b[0m')
      for (const b of prof.blockers) console.log(`  \x1b[31m✗\x1b[0m ${v(b)}`)
    }
  } else if (r.note) {
    console.log(`\x1b[33m${v(r.note)}\x1b[0m`)
  }

  if (r.skills?.length) {
    console.log('')
    console.log('Repo skills:')
    for (const s of r.skills) {
      const name = v(s.name)
      const d = v(s.description)
      const desc = d.length > 80 ? `${d.slice(0, 77)}...` : d
      console.log(`  ${name.padEnd(22)} ${dim(desc)}`)
    }
  }
  console.log('')
}

// Shadow-scores the task and logs the prediction alongside the known-correct mode (when there is one).
async function recordDevModeSample(task: string, label?: string, labelSource?: LabelSource) {
  let predicted: string | null = null
  let provider: string | null = null
  try {
    const inference = await decide('dev-mode', task)
    predicted = inference.decision
    provider = inference.provider
  } catch {
    // scorer unavailable — still keep the label
  }
  await logDecision({ decision: 'dev-mode', state: task, predicted, provider, label, labelSource })
}

function fail(message: string): never {
  console.error(`\x1b[31m${sanitize(message, { keepNewlines: true })}\x1b[0m`)
  process.exit(1)
}

export async function runDev(argv: string[], opts: RunDevOptions = {}): Promise<void> {
  const usage = opts.usage ?? 'nerv dev'
  let args: DevArgs
  try {
    args = parseDevArgs(argv, opts.target)
  } catch (err) {
    if (!(err instanceof DevArgsError)) throw err
    const known = [...new Set((await listTargets()).map(t => t.name))]
    fail(err.message.startsWith('Missing target') ? `${err.message}\nTargets: ${known.join(', ')}` : err.message)
  }
  const chainNames = await resolveChainNames({ via: args.via, chain: args.chain })

  if (!args.target) {
    await printDevHelp(usage, opts.target, chainNames)
    if (argv.length > 0) process.exit(1)
    return
  }

  // Resolve before any help, so a mistyped target says so instead of printing usage.
  let repo: RepoContext
  try {
    repo = await resolveTarget(args.target, args.repo)
  } catch (err) {
    if (err instanceof TargetError) fail(err.message)
    throw err
  }

  const needsTask = !args.mode || !TASKLESS_MODES.includes(args.mode)
  if (needsTask && !args.task) {
    await printDevHelp(usage, opts.target, chainNames)
    return
  }

  // Mode: explicit > rule > implement. The scorer only shadows (see recordDevModeSample).
  const rule = args.mode ? null : ruleMode(args.task)
  const mode: Mode = args.mode ?? rule?.mode ?? 'implement'
  const modeLabel = args.mode ? '(explicit)' : rule ? `(rule: ${rule.rule})` : '(default)'
  const labelSource: LabelSource | undefined = args.mode ? 'explicit' : rule ? 'rule' : undefined
  const input = parseTaskInput(args.task)

  let picked: Picked
  try {
    picked = await pick(await loadChain(chainNames), mode, input, repo)
  } catch (err) {
    if (err instanceof OrchestratorNotFound || err instanceof NoOrchestrator) fail(err.message)
    throw err
  }

  if (args.json) {
    console.log(JSON.stringify({ target: args.target, mode, modeLabel, input, repo, chain: chainNames, via: picked.orchestrator.name, skipped: picked.skipped, resolution: picked.resolution }))
  } else {
    renderDev({ args, mode, modeLabel, input, repo, chainNames, picked })
  }

  await trace({
    ts: now(),
    hook: 'dev',
    layer: 'L8:Orchestrator',
    provider: picked.orchestrator.name,
    result: `${args.target} ${mode} → ${picked.resolution.kind}${picked.skipped.length ? ` (skipped ${picked.skipped.map(s => s.name).join(',')})` : ''}`,
  })

  if (mode === 'plan' || mode === 'implement') {
    await recordDevModeSample(args.task, labelSource ? mode : undefined, labelSource)
  }
}
