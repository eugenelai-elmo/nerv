import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildRebaseProfile } from './rebase-profile.js'

let tmp: string
let clone: string

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

async function write(path: string, content: string) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'nerv-rebase-'))
  const seed = join(tmp, 'seed')
  await mkdir(seed)
  g(seed, 'init', '-q', '-b', 'master')
  await write(join(seed, 'package.json'), JSON.stringify({ scripts: { lint: 'x', test: 'x', build: 'x' } }))
  await write(join(seed, 'pnpm-lock.yaml'), '')
  await write(join(seed, 'shared.txt'), 'base\n')
  g(seed, 'add', '.')
  g(seed, 'commit', '-qm', 'init')
  g(tmp, 'clone', '-q', '--bare', seed, 'remote.git')
  g(tmp, 'clone', '-q', 'remote.git', 'work')
  clone = join(tmp, 'work')
  g(clone, 'checkout', '-qb', 'feature/HPI-1915-payslips')
  await write(join(clone, 'specs', 'HPI-1915-payslips', 'plan.md'), '# plan')
  await write(join(clone, 'specs', 'HPI-1915-payslips', 'spec.md'), '# spec')
  g(clone, 'add', '.')
  g(clone, 'commit', '-qm', 'slice')
})

after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

const repo = () => ({ name: 'work', path: clone })
const noPlugins = () => join(tmp, 'no-plugins')

async function umbrella(root: string, marketplace: string, plugin: string, version: string, integrationBranch: string) {
  await write(join(root, marketplace, plugin, version, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: plugin, flowmo: { defaults: { frontend: { integrationBranch } } } }))
}

test('clean feature branch: base, package manager, verify, slice, no blockers', async () => {
  const p = await buildRebaseProfile(repo())
  assert.equal(p.branch, 'feature/HPI-1915-payslips')
  assert.match(p.head ?? '', /^[0-9a-f]{40}$/)
  assert.equal(p.base, 'master')
  assert.equal(p.baseSource, 'origin/HEAD')
  assert.equal(p.packageManager, 'pnpm')
  assert.deepEqual(p.verify, ['pnpm run lint', 'pnpm run test'])
  assert.deepEqual(p.slice, { ticket: 'HPI-1915', flowmo: true, files: ['specs/HPI-1915-payslips/spec.md', 'specs/HPI-1915-payslips/plan.md'] })
  assert.deepEqual(p.blockers, [])
  assert.deepEqual(p.notes, [])
})

test('frontend repos follow flowmo integration-branch resolution, not the remote', async () => {
  const cfg = join(tmp, 'flowmo.config.json')
  await writeFile(cfg, JSON.stringify({ frontend: { integrationBranch: 'horizon' } }))
  const configured = await buildRebaseProfile(repo(), { kind: 'frontend', flowmoUserConfig: cfg, pluginsRoot: noPlugins() })
  assert.equal(configured.base, 'horizon')
  const unconfigured = await buildRebaseProfile(repo(), { kind: 'frontend', flowmoUserConfig: join(tmp, 'absent.json'), pluginsRoot: noPlugins() })
  assert.deepEqual([unconfigured.base, unconfigured.baseSource], ['master', 'flowmo FE integration branch default'])
})

test('nerv overrides win for base and verify', async () => {
  const p = await buildRebaseProfile(repo(), { overrides: { base: 'develop', verify: ['make check'], afterRebase: ['regen'] } })
  assert.deepEqual([p.base, p.verify, p.afterRebase], ['develop', ['make check'], ['regen']])
})

test('staged changes block', async () => {
  await writeFile(join(clone, 'scratch.txt'), 'x')
  g(clone, 'add', 'scratch.txt')
  const p = await buildRebaseProfile(repo())
  g(clone, 'rm', '-q', '--cached', 'scratch.txt')
  await rm(join(clone, 'scratch.txt'))
  assert.equal(p.blockers.length, 1)
  assert.match(p.blockers[0], /uncommitted changes/)
})

test('being on the base branch blocks', async () => {
  g(clone, 'checkout', '-q', 'master')
  const p = await buildRebaseProfile(repo())
  g(clone, 'checkout', '-q', 'feature/HPI-1915-payslips')
  assert.ok(p.blockers.some(b => b.includes('on the base branch')))
  assert.equal(p.slice, null)
})

test('detached HEAD blocks', async () => {
  g(clone, 'checkout', '-q', '--detach')
  const p = await buildRebaseProfile(repo())
  g(clone, 'checkout', '-q', 'feature/HPI-1915-payslips')
  assert.equal(p.branch, null)
  assert.ok(p.blockers.some(b => b.includes('detached')))
})

test('a paused rebase blocks even though the tree looks clean to porcelain', async () => {
  g(clone, 'checkout', '-qb', 'feature/HPI-2000-conflict', 'master')
  await writeFile(join(clone, 'shared.txt'), 'ours\n')
  g(clone, 'commit', '-qam', 'ours')
  g(clone, 'checkout', '-qb', 'upstream-side', 'master')
  await writeFile(join(clone, 'shared.txt'), 'theirs\n')
  g(clone, 'commit', '-qam', 'theirs')
  g(clone, 'checkout', '-q', 'feature/HPI-2000-conflict')
  try { g(clone, 'rebase', 'upstream-side') } catch { /* conflict expected */ }
  const p = await buildRebaseProfile(repo())
  g(clone, 'rebase', '--abort')
  assert.ok(p.blockers.some(b => b.includes('rebase is already in progress')), p.blockers.join('; '))
})

test('non-git directory blocks immediately', async () => {
  const p = await buildRebaseProfile({ name: 'x', path: tmp })
  assert.deepEqual(p.blockers, [`${tmp} is not a git repository`])
})

test('flowmo umbrella plugin default applies to frontend when the user has no override', async () => {
  const root = join(tmp, 'plugins-one')
  await umbrella(root, 'elmo', 'flowmo-recruitment', '0.5.1', 'develop')
  const p = await buildRebaseProfile(repo(), { kind: 'frontend', flowmoUserConfig: join(tmp, 'absent.json'), pluginsRoot: root })
  assert.deepEqual([p.base, p.baseSource], ['develop', 'flowmo FE integration branch (umbrella plugin default)'])
})

test('user flowmo config beats the umbrella default', async () => {
  const root = join(tmp, 'plugins-user')
  await umbrella(root, 'elmo', 'flowmo-recruitment', '0.5.1', 'develop')
  const cfg = join(tmp, 'flowmo-user.json')
  await writeFile(cfg, JSON.stringify({ frontend: { integrationBranch: 'horizon' } }))
  const p = await buildRebaseProfile(repo(), { kind: 'frontend', flowmoUserConfig: cfg, pluginsRoot: root })
  assert.equal(p.base, 'horizon')
})

test('umbrellas that disagree fall through to master with a note', async () => {
  const root = join(tmp, 'plugins-conflict')
  await umbrella(root, 'elmo', 'flowmo-recruitment', '0.5.1', 'develop')
  await umbrella(root, 'elmo', 'flowmo-learning', '1.0.0', 'release')
  const p = await buildRebaseProfile(repo(), { kind: 'frontend', flowmoUserConfig: join(tmp, 'absent.json'), pluginsRoot: root })
  assert.deepEqual([p.base, p.baseSource], ['master', 'flowmo FE integration branch default (umbrella conflict)'])
  assert.ok(p.notes.some(n => n.includes('disagree') && n.includes('develop') && n.includes('release')), p.notes.join('; '))
  assert.deepEqual(p.blockers, [])
})

test('non-frontend repos ignore flowmo FE config and umbrellas', async () => {
  const root = join(tmp, 'plugins-nonfe')
  await umbrella(root, 'elmo', 'flowmo-recruitment', '0.5.1', 'develop')
  const cfg = join(tmp, 'flowmo-nonfe.json')
  await writeFile(cfg, JSON.stringify({ frontend: { integrationBranch: 'horizon' } }))
  const p = await buildRebaseProfile(repo(), { kind: 'mobile', flowmoUserConfig: cfg, pluginsRoot: root })
  assert.deepEqual([p.base, p.baseSource], ['master', 'origin/HEAD'])
})

test('untracked files are reported but do not block', async () => {
  await mkdir(join(clone, '.sprintmo'), { recursive: true })
  await writeFile(join(clone, '.sprintmo', 'state.json'), '{}')
  await writeFile(join(clone, 'loose.txt'), 'x')
  const p = await buildRebaseProfile(repo())
  await rm(join(clone, '.sprintmo'), { recursive: true })
  await rm(join(clone, 'loose.txt'))
  assert.deepEqual(p.blockers, [])
  assert.deepEqual(p.notes, ['2 untracked paths (not blocking; git leaves them alone)'])
})

test('a modified tracked file still blocks', async () => {
  await writeFile(join(clone, 'shared.txt'), 'edited\n')
  const p = await buildRebaseProfile(repo())
  g(clone, 'checkout', '--', 'shared.txt')
  assert.ok(p.blockers.some(b => b.startsWith('uncommitted changes (1 paths)')), p.blockers.join('; '))
})

test('lowercase ticket keys in branch names resolve upper-cased', async () => {
  g(clone, 'checkout', '-qb', 'feature/hpi-1915-lower', 'feature/HPI-1915-payslips')
  const p = await buildRebaseProfile(repo())
  g(clone, 'checkout', '-q', 'feature/HPI-1915-payslips')
  assert.equal(p.slice?.ticket, 'HPI-1915')
  assert.equal(p.slice?.flowmo, true)
})

test('version-like segments are not tickets', async () => {
  g(clone, 'checkout', '-qb', 'release/v2-1', 'master')
  const p = await buildRebaseProfile(repo())
  g(clone, 'checkout', '-q', 'feature/HPI-1915-payslips')
  assert.equal(p.slice, null)
})
