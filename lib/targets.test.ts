import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmp: string
let targets: typeof import('./targets.js')

function g(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' })
}

async function repo(name: string): Promise<string> {
  const p = join(tmp, name)
  await mkdir(p, { recursive: true })
  g(p, 'init', '-q', '-b', 'master')
  await writeFile(join(p, 'f'), 'x')
  g(p, 'add', '.')
  g(p, 'commit', '-qm', 'init')
  return p
}

before(async () => {
  tmp = await realpath(await mkdtemp(join(tmpdir(), 'nerv-targets-')))
  const alpha = await repo('alpha')
  await repo('beta')
  g(alpha, 'worktree', 'add', '-q', join(tmp, 'alpha-HPI-1'), '-b', 'feature/HPI-1')
  // flowmo registry lives at <flowmo-root>/.claude/related-repos.json with paths relative to <flowmo-root>
  await mkdir(join(tmp, 'flowmo', '.claude'), { recursive: true })
  await writeFile(join(tmp, 'flowmo', '.claude', 'related-repos.json'), JSON.stringify({
    '$note': 'ignored',
    beta: { relativePath: '../beta', kind: 'backend' },
    delta: { relativePath: '../dev-stack/apps/delta', kind: 'frontend' },
    epsilon: { relativePath: '../not-here' },
    gone: { relativePath: '../not-cloned' },
  }))
  process.env.FLOWMO_RELATED_REPOS = join(tmp, 'flowmo', '.claude', 'related-repos.json')
  // per-machine override: moved clone (absolute), relative override, and an unknown key that must be ignored
  await repo('elsewhere/delta')
  await writeFile(join(tmp, 'local.json'), JSON.stringify({
    '$note': 'ignored',
    delta: join(tmp, 'elsewhere', 'delta'),
    epsilon: '../beta',
    ghost: join(tmp, 'beta'),
  }))
  process.env.FLOWMO_RELATED_REPOS_LOCAL = join(tmp, 'local.json')
  targets = await import('./targets.js')
})

after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

test('flowmo registry names resolve through relativePath', async () => {
  assert.equal(await targets.resolveTargetPath('beta'), join(tmp, 'beta'))
  assert.equal(await targets.resolveTargetPath('gone'), null, 'registered but not cloned')
})

test('config aliases resolve with ~ expansion', async () => {
  const path = await targets.resolveTargetPath('mobile')
  assert.ok(path === null || !path.startsWith('~'), 'alias paths are expanded')
})

test('unknown target lists what is available', async () => {
  await assert.rejects(targets.resolveTarget('nope'), (err: Error) => {
    assert.ok(err instanceof targets.TargetError)
    assert.match(err.message, /Unknown target "nope"\. Available: .*beta/)
    return true
  })
})

test('--repo may pick a worktree of the same target, reported under the main repo name', async () => {
  const r = await targets.resolveTarget('beta', join(tmp, 'beta'))
  assert.deepEqual(r, { name: 'beta', path: join(tmp, 'beta') })
})

test('--repo pointing at a different repo is refused', async () => {
  await assert.rejects(targets.resolveTarget('beta', join(tmp, 'alpha-HPI-1')), /is a checkout of "alpha", not target "beta"/)
})

test('listTargets skips repos that are not cloned', async () => {
  const names = (await targets.listTargets()).map(t => t.name)
  assert.ok(names.includes('beta'))
  assert.ok(!names.includes('gone'))
})

test('related-repos.local.json overrides registry paths, absolute or relative to the flowmo root', async () => {
  assert.equal(await targets.resolveTargetPath('delta'), join(tmp, 'elsewhere', 'delta'))
  assert.equal(await targets.resolveTargetPath('epsilon'), join(tmp, 'beta'))
})

test('override keys that are not in the registry are ignored', async () => {
  assert.equal(await targets.resolveTargetPath('ghost'), null)
})
