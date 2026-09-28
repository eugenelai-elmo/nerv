import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDevArgs, DevArgsError } from './dev-command.js'

const base = { via: undefined, chain: undefined, repo: undefined, json: false }

test('target, mode and task', () => {
  assert.deepEqual(parseDevArgs(['mobile', 'plan', 'HPI-1915']), { ...base, target: 'mobile', mode: 'plan', task: 'HPI-1915' })
})

test('task words are joined; no mode means null', () => {
  assert.deepEqual(parseDevArgs(['frontend', 'add', 'a', 'dark', 'mode']), { ...base, target: 'frontend', mode: null, task: 'add a dark mode' })
})

test('taskless mode', () => {
  assert.deepEqual(parseDevArgs(['mobile', 'rebase']), { ...base, target: 'mobile', mode: 'rebase', task: '' })
})

test('--repo accepts both separate and = forms', () => {
  assert.equal(parseDevArgs(['mobile', 'rebase', '--repo', '/tmp/wt']).repo, '/tmp/wt')
  assert.equal(parseDevArgs(['mobile', 'rebase', '--repo=/tmp/wt']).repo, '/tmp/wt')
})

test('--via, --chain and --json', () => {
  const a = parseDevArgs(['mobile', 'plan', 'x', '--via=direct', '--chain', 'kernel,flowmo', '--json'])
  assert.deepEqual([a.via, a.chain, a.json], ['direct', 'kernel,flowmo', true])
})

test('flags may come before the target', () => {
  assert.deepEqual(parseDevArgs(['--json', '--repo', '/tmp/wt', 'mobile', 'rebase']), { ...base, json: true, repo: '/tmp/wt', target: 'mobile', mode: 'rebase', task: '' })
})

test('a value flag with no value is an error, not silently dropped', () => {
  for (const argv of [['mobile', 'rebase', '--repo'], ['mobile', 'rebase', '--repo='], ['mobile', 'rebase', '--repo', '--json'], ['mobile', 'plan', 'x', '--via']]) {
    assert.throws(() => parseDevArgs(argv), (err: Error) => err instanceof DevArgsError && /needs a value/.test(err.message), argv.join(' '))
  }
})

test('unknown and malformed flags are errors', () => {
  assert.throws(() => parseDevArgs(['mobile', 'rebase', '--force']), (err: Error) => err instanceof DevArgsError && /Unknown option --force/.test(err.message))
  assert.throws(() => parseDevArgs(['mobile', 'rebase', '--json=yes']), /takes no value/)
})

test('a mode in the target slot means the target is missing', () => {
  for (const m of ['rebase', 'plan', 'implement', 'pull', 'ship']) {
    assert.throws(() => parseDevArgs([m, 'x']), (err: Error) => err instanceof DevArgsError && err.message === `Missing target — e.g. nerv dev mobile ${m}`, m)
  }
})

test('fixed target (nerv mobile dev) treats the first positional as the mode', () => {
  assert.deepEqual(parseDevArgs(['rebase'], 'mobile'), { ...base, target: 'mobile', mode: 'rebase', task: '' })
  assert.deepEqual(parseDevArgs(['plan', 'HPI-1'], 'mobile'), { ...base, target: 'mobile', mode: 'plan', task: 'HPI-1' })
})

test('no arguments yields no target (caller shows help)', () => {
  assert.deepEqual(parseDevArgs([]), { ...base, target: null, mode: null, task: '' })
})
