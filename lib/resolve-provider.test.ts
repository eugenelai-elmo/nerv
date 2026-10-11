import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmp: string
let providersDir: string
let rp: typeof import('./resolve-provider.js')
let memory: typeof import('./memory.js')
let session: typeof import('./session.js')

// Fake providers record which one actually served the call.
const ok = (name: string) => `
import { appendFileSync } from 'node:fs'
const log = (op) => appendFileSync(process.env.CALL_LOG, '${name}:' + op + '\\n')
export default {
  name: '${name}',
  async recall() { log('recall'); return [{ path: 'p', tier: 'L0', content: '${name}' }] },
  async save() { log('save') },
  async list() { log('list'); return ['${name}'] },
  async score() { log('score'); return [] },
  async route() { log('route'); return [] },
  async status() { log('status'); return { running: true, socketPath: '${name}' } },
  async list_() {},
}`

const throwing = (name: string) => `
export default {
  name: '${name}',
  async recall() { throw new Error('${name} recall down') },
  async save() { throw new Error('${name} save down') },
  async list() { throw new Error('${name} list down') },
  async status() { throw new Error('${name} status down') },
}`

async function calls(): Promise<string[]> {
  try {
    return (await readFile(process.env.CALL_LOG!, 'utf-8')).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'nerv-rp-'))
  providersDir = join(tmp, 'providers')
  await mkdir(providersDir)
  await writeFile(join(providersDir, 'package.json'), JSON.stringify({ type: 'module' }))
  await writeFile(join(providersDir, 'good.js'), ok('good'))
  await writeFile(join(providersDir, 'filesystem-fallback.js'), ok('filesystem-fallback'))
  await writeFile(join(providersDir, 'tmux-fallback.js'), ok('tmux-fallback'))
  await writeFile(join(providersDir, 'broken.js'), throwing('broken'))
  await writeFile(join(providersDir, 'herdr.js'), throwing('herdr'))
  await writeFile(join(providersDir, 'syntax-error.js'), 'export default {{{')

  await writeFile(join(tmp, 'providers.json'), JSON.stringify({
    scorer: { chain: ['missing', 'good'], config: {} },
    router: { provider: 'good', config: {} },
    memory: { chain: ['broken'], config: {} },
    device: { chain: ['good'], config: {} },
    session: { chain: ['herdr'], config: {} },
  }))

  process.env.NERV_PROVIDERS_CONFIG = join(tmp, 'providers.json')
  process.env.NERV_PROVIDERS_DIR = providersDir
  process.env.CALL_LOG = join(tmp, 'calls.log')
  process.env.HOME = tmp // keep trace.jsonl writes out of the real ~/.cache
  rp = await import('./resolve-provider.js')
  memory = await import('./memory.js')
  session = await import('./session.js')
})

after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

test('toChain appends the section last-resort fallback once', () => {
  assert.deepEqual(rp.toChain({ provider: 'openviking', config: {} }, 'memory'), ['openviking', 'filesystem-fallback'])
  assert.deepEqual(rp.toChain({ chain: ['herdr', 'tmux-fallback'], config: {} }, 'session'), ['herdr', 'tmux-fallback'])
  assert.deepEqual(rp.toChain({ chain: ['a'], config: {} }), ['a'])
})

test('callChain walks past providers that fail to import', async () => {
  for (const first of ['missing', 'syntax-error']) {
    const r = await rp.callChain('t', [first, 'good'], async (p: { name: string }) => p.name, providersDir)
    assert.equal(r.providerName, 'good', first)
  }
})

test('callChain falls back when a provider imports but throws at call time', async () => {
  const r = await rp.callChain<{ list(): Promise<string[]> }, string[]>('t', ['broken', 'good'], p => p.list(), providersDir)
  assert.deepEqual([r.providerName, r.result], ['good', ['good']])
})

test('callChain rethrows the last error when every provider fails', async () => {
  await assert.rejects(
    rp.callChain<{ list(): Promise<string[]> }, string[]>('t', ['broken', 'herdr'], p => p.list(), providersDir),
    /herdr list down/,
  )
})

test('config chain: resolveAndCall skips a missing provider', async () => {
  const r = await rp.resolveAndCall<{ name: string }, string>('scorer', async p => p.name)
  assert.equal(r.providerName, 'good')
})

test('single-provider section still resolves', async () => {
  const p = await rp.resolveProvider<{ name: string }>('router')
  assert.equal(p.name, 'good')
})

test('memory recall/save/list fall back to filesystem-fallback at call time', async () => {
  const recalled = await memory.recall('x')
  assert.equal(recalled.provider, 'filesystem-fallback')
  await memory.save('x', 'payload')
  assert.deepEqual(await memory.list('x'), ['filesystem-fallback'])
  const log = await calls()
  for (const op of ['recall', 'save', 'list']) assert.ok(log.includes(`filesystem-fallback:${op}`), op)
  assert.ok(!log.some(l => l.startsWith('broken:')), 'broken provider never records success')
})

test('session status falls back to tmux-fallback when herdr fails at call time', async () => {
  const status = await session.sessionStatus()
  assert.deepEqual(status, { running: true, socketPath: 'tmux-fallback' })
})
