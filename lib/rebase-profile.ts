import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, access, stat } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import type { RepoContext } from './types.js'

const exec = promisify(execFile)

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun'

export interface RebaseOverrides {
  base?: string
  verify?: string[]
  afterRebase?: string[]
}

export interface RebaseSlice {
  ticket: string
  files: string[]
  flowmo: boolean
}

export interface RebaseProfile {
  repo: string
  path: string
  branch: string | null
  head: string | null
  base: string
  baseSource: string
  packageManager: PackageManager | null
  verify: string[]
  afterRebase: string[]
  slice: RebaseSlice | null
  blockers: string[]
  // informational, never blocking (untracked paths, flowmo umbrella conflicts, …)
  notes: string[]
}

export interface RebaseProfileOptions {
  kind?: string
  overrides?: RebaseOverrides
  flowmoUserConfig?: string
  // test hook: walk this plugin cache root instead of reading ~/.claude/plugins/installed_plugins.json
  pluginsRoot?: string
}

// Branch segments carry ticket keys in either case (feature/hpi-1915-x); prefix must start with 2+ letters.
// TODO(consolidate): lib/modes.ts has its own ticket regex for task text.
const BRANCH_TICKET = /(?:^|[/_-])([A-Za-z]{2}[A-Za-z0-9]{0,8}-\d+)(?=$|[/_-])/
const VERIFY_SCRIPT_ORDER = ['typecheck', 'type-check', 'check:types', 'lint', 'test']
const LOCKFILES: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

async function git(path: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['-C', path, ...args], { timeout: 10_000 })
    return stdout.trim()
  } catch {
    return null
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

// Follows symlinks (dev-linked plugin versions are symlinks).
async function listDirs(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const n of names) if (await isDir(join(dir, n))) out.push(join(dir, n))
  return out
}

// Installed plugin roots from Claude Code's installed_plugins.json; null if unavailable.
async function installedPluginPaths(file: string): Promise<string[] | null> {
  try {
    const j = JSON.parse(await readFile(file, 'utf-8')) as { plugins?: Record<string, { installPath?: string }[]> }
    return Object.values(j.plugins ?? {}).flat().map(e => e.installPath).filter((p): p is string => !!p)
  } catch {
    return null
  }
}

async function cachedPluginPaths(root: string): Promise<string[]> {
  const out: string[] = []
  for (const marketplace of await listDirs(root)) {
    for (const plugin of await listDirs(marketplace)) out.push(...(await listDirs(plugin)))
  }
  return out
}

// flowmo fe-integration-branch.md step 3: installed umbrella plugins declaring
// flowmo.defaults.frontend.integrationBranch in .claude-plugin/plugin.json. Differing values → ambiguous → master.
// Reads only installed plugins (installed_plugins.json); walks the cache only when that file is unavailable
// or when a test injects pluginsRoot.
async function umbrellaIntegrationBranch(opts: RebaseProfileOptions): Promise<{ branch?: string; conflict?: string[] }> {
  const pluginsDir = join(homedir(), '.claude', 'plugins')
  const roots = opts.pluginsRoot
    ? await cachedPluginPaths(opts.pluginsRoot)
    : (await installedPluginPaths(join(pluginsDir, 'installed_plugins.json'))) ?? (await cachedPluginPaths(join(pluginsDir, 'cache')))
  const found = new Map<string, string[]>()
  for (const root of roots) {
    try {
      const manifest = JSON.parse(await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf-8')) as {
        name?: string
        flowmo?: { defaults?: { frontend?: { integrationBranch?: string } } }
      }
      const b = manifest.flowmo?.defaults?.frontend?.integrationBranch
      if (b) found.set(b, [...(found.get(b) ?? []), manifest.name ?? root])
    } catch {
      // no manifest or unreadable
    }
  }
  if (found.size === 1) return { branch: [...found.keys()][0] }
  if (found.size > 1) return { conflict: [...found].map(([b, names]) => `${[...new Set(names)].join('/')}=${b}`) }
  return {}
}

// Mirrors flowmo's fe-integration-branch protocol for frontend repos (no remote auto-detection);
// other repos use origin/HEAD, then master/main.
async function resolveBase(path: string, opts: RebaseProfileOptions, notes: string[]): Promise<{ base: string; baseSource: string }> {
  if (opts.overrides?.base) return { base: opts.overrides.base, baseSource: 'nerv config (dev.repos)' }

  if (opts.kind === 'frontend') {
    const configPath = opts.flowmoUserConfig ?? join(homedir(), '.claude', 'flowmo.config.json')
    try {
      const cfg = JSON.parse(await readFile(configPath, 'utf-8')) as { frontend?: { integrationBranch?: string } }
      const b = cfg.frontend?.integrationBranch
      if (b) return { base: b, baseSource: 'flowmo FE integration branch (~/.claude/flowmo.config.json)' }
    } catch {
      // absent or unreadable → next step
    }
    const umbrella = await umbrellaIntegrationBranch(opts)
    if (umbrella.branch) return { base: umbrella.branch, baseSource: 'flowmo FE integration branch (umbrella plugin default)' }
    if (umbrella.conflict) {
      notes.push(`flowmo umbrella plugins disagree on the FE integration branch (${umbrella.conflict.join(', ')}) — using master; set ~/.claude/flowmo.config.json frontend.integrationBranch to choose`)
      return { base: 'master', baseSource: 'flowmo FE integration branch default (umbrella conflict)' }
    }
    return { base: 'master', baseSource: 'flowmo FE integration branch default' }
  }

  const originHead = await git(path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (originHead?.startsWith('origin/')) return { base: originHead.slice('origin/'.length), baseSource: 'origin/HEAD' }
  for (const b of ['master', 'main']) {
    if (await git(path, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`])) {
      return { base: b, baseSource: `origin/${b} exists` }
    }
  }
  return { base: 'master', baseSource: 'fallback' }
}

async function detectPackageManager(path: string): Promise<PackageManager | null> {
  for (const [file, pm] of LOCKFILES) {
    if (await exists(join(path, file))) return pm
  }
  return null
}

async function detectVerify(path: string, pm: PackageManager | null): Promise<string[]> {
  let scripts: Record<string, string> = {}
  try {
    scripts = (JSON.parse(await readFile(join(path, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }).scripts ?? {}
  } catch {
    return []
  }
  const run = `${pm ?? 'npm'} run`
  if (scripts.verify) return [`${run} verify`]
  return VERIFY_SCRIPT_ORDER.filter(s => scripts[s]).map(s => `${run} ${s}`)
}

async function findSliceFiles(path: string, ticket: string): Promise<{ files: string[]; flowmo: boolean }> {
  const files: string[] = []
  let flowmo = false
  try {
    for (const dir of (await readdir(join(path, 'specs'))).filter(d => d.startsWith(`${ticket}-`) || d === ticket)) {
      for (const f of ['spec.md', 'plan.md', 'tasks.md']) {
        if (await exists(join(path, 'specs', dir, f))) {
          files.push(`specs/${dir}/${f}`)
          flowmo = true
        }
      }
    }
  } catch {
    // no flowmo specs in this repo
  }
  for (const f of ['brief.md', 'plan.md', 'verification.md']) {
    const rel = `.ai/artifacts/active/${ticket}/${f}`
    if (await exists(join(path, rel))) files.push(rel)
  }
  return { files, flowmo }
}

// Untracked files that upstream adds as tracked files; null when origin/<base> isn't available locally.
async function untrackedCollisions(path: string, base: string): Promise<string[] | null> {
  const ref = `refs/remotes/origin/${base}`
  if (!(await git(path, ['rev-parse', '--verify', '--quiet', ref]))) return null
  const added = await git(path, ['diff', '--name-only', '--diff-filter=A', `HEAD...origin/${base}`])
  if (!added) return []
  const untracked = new Set(((await git(path, ['ls-files', '--others', '--exclude-standard'])) ?? '').split('\n').filter(Boolean))
  return added.split('\n').filter(f => untracked.has(f))
}

async function inProgressOperation(path: string): Promise<string | null> {
  for (const [marker, label] of [
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ] as const) {
    const p = await git(path, ['rev-parse', '--git-path', marker])
    if (p && (await exists(isAbsolute(p) ? p : join(path, p)))) return label
  }
  return null
}

export async function buildRebaseProfile(repo: RepoContext, opts: RebaseProfileOptions = {}): Promise<RebaseProfile> {
  const blockers: string[] = []
  const notes: string[] = []
  const profile: RebaseProfile = {
    repo: repo.name,
    path: repo.path,
    branch: null,
    head: null,
    base: 'master',
    baseSource: 'fallback',
    packageManager: null,
    verify: opts.overrides?.verify ?? [],
    afterRebase: opts.overrides?.afterRebase ?? [],
    slice: null,
    blockers,
    notes,
  }

  if ((await git(repo.path, ['rev-parse', '--git-dir'])) === null) {
    blockers.push(`${repo.path} is not a git repository`)
    return profile
  }

  const branch = await git(repo.path, ['rev-parse', '--abbrev-ref', 'HEAD'])
  profile.head = await git(repo.path, ['rev-parse', 'HEAD'])
  profile.branch = branch && branch !== 'HEAD' ? branch : null
  Object.assign(profile, await resolveBase(repo.path, opts, notes))
  profile.packageManager = await detectPackageManager(repo.path)
  if (!opts.overrides?.verify) profile.verify = await detectVerify(repo.path, profile.packageManager)

  // Untracked files don't stop git rebase; only tracked changes block.
  const dirty = await git(repo.path, ['status', '--porcelain', '--untracked-files=no'])
  if (dirty) blockers.push(`uncommitted changes (${dirty.split('\n').length} paths) — commit or stash first`)
  // …unless upstream adds a file at an untracked path: rebase then aborts ("would be overwritten").
  const untrackedDirs = await git(repo.path, ['ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory'])
  if (untrackedDirs) {
    const collisions = await untrackedCollisions(repo.path, profile.base)
    if (collisions === null) {
      notes.push(`${untrackedDirs.split('\n').length} untracked paths — origin/${profile.base} not fetched locally, so collisions weren't checked; the playbook re-checks after fetch`)
    } else if (collisions.length) {
      blockers.push(`upstream adds ${collisions.length} file(s) at untracked local paths (${collisions.slice(0, 3).join(', ')}${collisions.length > 3 ? ', …' : ''}) — move or remove them first`)
    } else {
      notes.push(`${untrackedDirs.split('\n').length} untracked paths (no collision with origin/${profile.base} as last fetched; the playbook re-checks after fetch)`)
    }
  }
  if (!profile.branch) blockers.push('HEAD is detached — check out the branch to rebase')
  const op = await inProgressOperation(repo.path)
  if (op) blockers.push(`a ${op} is already in progress — finish or resolve it first`)
  if (profile.branch && profile.branch === profile.base) blockers.push(`on the base branch "${profile.base}" — switch to a feature branch`)

  const ticket = profile.branch?.match(BRANCH_TICKET)?.[1]?.toUpperCase()
  if (ticket) profile.slice = { ticket, ...(await findSliceFiles(repo.path, ticket)) }

  return profile
}
