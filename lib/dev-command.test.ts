import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseDevArgs, DevArgsError } from './dev-command.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const base = { via: undefined, chain: undefined, repo: undefined, json: false }

test('target, mode and task', () => {
  assert.deepEqual(parseDevArgs(['mobile', 'plan', 'HPI-1915']), { ...base, target: 'mobile', mode: 'plan', task: 'HPI-1915' })
})

test('task words are joined; no mode means null', () => {
  assert.deepEqual(parseDevArgs(['frontend', 'add', 'a', 'dark', 'mode']), { ...base, target: 'frontend', mode: null, task: 'add a dark mode' })
})

test('taskless mode', () => {
  assert.deepEqual(parseDevArgs(['mobile', 'refresh']), { ...base, target: 'mobile', mode: 'refresh', task: '' })
})

test('--repo accepts both separate and = forms', () => {
  assert.equal(parseDevArgs(['mobile', 'refresh', '--repo', '/tmp/wt']).repo, '/tmp/wt')
  assert.equal(parseDevArgs(['mobile', 'refresh', '--repo=/tmp/wt']).repo, '/tmp/wt')
})

test('--via, --chain and --json', () => {
  const a = parseDevArgs(['mobile', 'plan', 'x', '--via=direct', '--chain', 'kernel,flowmo', '--json'])
  assert.deepEqual([a.via, a.chain, a.json], ['direct', 'kernel,flowmo', true])
})

test('flags may come before the target', () => {
  assert.deepEqual(parseDevArgs(['--json', '--repo', '/tmp/wt', 'mobile', 'refresh']), { ...base, json: true, repo: '/tmp/wt', target: 'mobile', mode: 'refresh', task: '' })
})

test('a value flag with no value is an error, not silently dropped', () => {
  for (const argv of [['mobile', 'refresh', '--repo'], ['mobile', 'refresh', '--repo='], ['mobile', 'refresh', '--repo', '--json'], ['mobile', 'plan', 'x', '--via']]) {
    assert.throws(() => parseDevArgs(argv), (err: Error) => err instanceof DevArgsError && /needs a value/.test(err.message), argv.join(' '))
  }
})

test('unknown and malformed flags are errors', () => {
  assert.throws(() => parseDevArgs(['mobile', 'refresh', '--force']), (err: Error) => err instanceof DevArgsError && /Unknown option --force/.test(err.message))
  assert.throws(() => parseDevArgs(['mobile', 'refresh', '--json=yes']), /takes no value/)
})

test('a mode in the target slot means the target is missing', () => {
  for (const m of ['ticket', 'intake', 'plan', 'implement', 'refresh', 'ship']) {
    assert.throws(() => parseDevArgs([m, 'x']), (err: Error) => err instanceof DevArgsError && err.message === `Missing target — e.g. nerv dev mobile ${m}`, m)
  }
})

test('fixed target (nerv mobile dev) treats the first positional as the mode', () => {
  assert.deepEqual(parseDevArgs(['refresh'], 'mobile'), { ...base, target: 'mobile', mode: 'refresh', task: '' })
  assert.deepEqual(parseDevArgs(['plan', 'HPI-1'], 'mobile'), { ...base, target: 'mobile', mode: 'plan', task: 'HPI-1' })
})

test('no arguments yields no target (caller shows help)', () => {
  assert.deepEqual(parseDevArgs([]), { ...base, target: null, mode: null, task: '' })
})

test('a mistyped target with no task reports the unknown target and exits 1', () => {
  const r = spawnSync('npx', ['tsx', join(ROOT, 'commands', 'dev.ts'), 'mobil'], { cwd: ROOT, encoding: 'utf-8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Unknown target "mobil"/)
})

test('retired or tool-native mode words fail with the NERV name instead of becoming a task', () => {
  assert.throws(() => parseDevArgs(['mobile', 'rebase']), /"rebase" is not a NERV mode — use refresh/)
  assert.throws(() => parseDevArgs(['mobile', 'sync']), /use refresh \(update the branch\) or intake/)
  assert.throws(() => parseDevArgs(['mobile', 'pull', 'LMS-1']), /use intake/)
  assert.throws(() => parseDevArgs(['mobile', 'issue', 'x']), /use plan/)
  assert.equal(parseDevArgs(['mobile', 'fix', 'the', 'rebase', 'button']).task, 'fix the rebase button')
})
