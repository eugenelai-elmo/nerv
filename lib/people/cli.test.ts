import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, type CliIO } from './cli.js'
import type { FetchLike } from './bloom.js'
import * as fx from './fixtures/bloom.js'

const BASE = 'https://bloom.example.test/api'
const SECRET = 'sessSECRET999'
let rosterFile: string

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'people-cli-'))
  rosterFile = join(dir, 'people.local.json')
  await writeFile(rosterFile, JSON.stringify({
    schemaVersion: 1,
    bloom: { baseUrl: BASE },
    people: [
      { id: 'alex', name: 'Alex Example', aliases: ['al'], relationship: 'report', bloom: { FY27: fx.PERF_ID } },
      { id: 'sam', name: 'Sam Sample', relationship: 'report' },
      { id: 'sasha', name: 'Sasha Test', relationship: 'team' },
    ],
  }))
})

const okFetch: FetchLike = async url => {
  const p = `${BASE}/performances/${fx.PERF_ID}`
  const body: Record<string, unknown> = {
    [p]: fx.overview, [`${p}/sections`]: fx.sections,
    [`${p}/question-sections/11`]: fx.goalsSection, [`${p}/question-sections/12`]: fx.careerSection,
    [`${p}/development-sections/13`]: fx.idpSection, [`${p}/summary-sections/14`]: fx.finalSection,
    [`${p}/recommendation-sections/15`]: fx.recognitionSection,
  }
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => body[url] ?? [] }
}

function io(over: Partial<CliIO> = {}) {
  const out: string[] = []
  const err: string[] = []
  const value: CliIO = {
    stdout: s => out.push(s), stderr: s => err.push(s),
    env: { NERV_PEOPLE_CONFIG: rosterFile, BLOOM_SESSION: SECRET },
    isTTY: false, fetchImpl: okFetch, now: new Date(2026, 9, 7),
    exec: () => ({ status: 44, stdout: '' }),
    ...over,
  }
  return { value, out, err, all: () => out.join('\n') + err.join('\n') }
}

test('bare `people` lists roster (exit 0)', async () => {
  const t = io()
  assert.equal(await main([], t.value), 0)
  assert.match(t.out.join('\n'), /Alex Example/)
})

test('`people --json` behaves like `ls --json`', async () => {
  const t = io()
  assert.equal(await main(['--json'], t.value), 0)
  assert.equal(JSON.parse(t.out.join('')).people.length, 3)
})

test('ls --json is pure JSON with schemaVersion', async () => {
  const t = io()
  assert.equal(await main(['ls', '--json'], t.value), 0)
  const j = JSON.parse(t.out.join(''))
  assert.equal(j.schemaVersion, 1)
  assert.equal(j.people.length, 3)
})

test('resolve --json found', async () => {
  const t = io()
  assert.equal(await main(['resolve', 'al', '--json'], t.value), 0)
  assert.equal(JSON.parse(t.out.join('')).person.id, 'alex')
})

test('resolve ambiguous → exit 2 with candidates', async () => {
  const t = io()
  assert.equal(await main(['resolve', 'sa', '--json'], t.value), 2)
  const j = JSON.parse(t.out.join(''))
  assert.equal(j.error, 'ambiguous')
  assert.deepEqual(j.candidates.map((c: { id: string }) => c.id).sort(), ['sam', 'sasha'])
})

test('appraisal --json ok', async () => {
  const t = io()
  assert.equal(await main(['appraisal', 'alex', '--json'], t.value), 0)
  const j = JSON.parse(t.out.join(''))
  assert.equal(j.fy, 'FY27')
  assert.equal(j.sources.bloom.status, 'ok')
  assert.equal(j.sources.bloom.data.sections.length, 5)
})

test('appraisal text render', async () => {
  const t = io()
  assert.equal(await main(['appraisal', 'alex'], t.value), 0)
  assert.match(t.out.join('\n'), /## Alex Example — FY27 appraisal/)
})

test('appraisal --section idp limits output', async () => {
  const t = io()
  await main(['appraisal', 'alex', '--section', 'idp', '--json'], t.value)
  assert.deepEqual(JSON.parse(t.out.join('')).sources.bloom.data.sections.map((s: { key: string }) => s.key), ['idp'])
})

test('report without FY id → not_applicable, exit 0, no network', async () => {
  let called = false
  const t = io({ fetchImpl: async () => { called = true; throw new Error('no') } })
  assert.equal(await main(['appraisal', 'sam', '--json'], t.value), 0)
  assert.equal(JSON.parse(t.out.join('')).sources.bloom.status, 'not_applicable')
  assert.equal(called, false)
})

test('missing session → auth_expired with interactive hint, exit 0', async () => {
  const t = io({ env: { NERV_PEOPLE_CONFIG: rosterFile } })
  assert.equal(await main(['appraisal', 'alex', '--json'], t.value), 0)
  const b = JSON.parse(t.out.join('')).sources.bloom
  assert.equal(b.status, 'auth_expired')
  assert.match(b.hint, /^interactive:/)
})

test('--fy override is honoured', async () => {
  const t = io()
  await main(['appraisal', 'alex', '--fy', 'fy28', '--json'], t.value)
  const j = JSON.parse(t.out.join(''))
  assert.equal(j.fy, 'FY28')
  assert.equal(j.sources.bloom.status, 'not_applicable')
})

for (const args of [['appraisal', 'alex', '--section', 'foo'], ['appraisal', 'alex', '--fy', '2027'], ['appraisal'], ['bogus'], ['main']]) {
  test(`usage error: ${args.join(' ')} → exit 1, no network`, async () => {
    let called = false
    const t = io({ fetchImpl: async () => { called = true; throw new Error('no') } })
    assert.equal(await main(args, t.value), 1)
    assert.ok(t.err.join('\n').length > 0)
    assert.equal(called, false)
  })
}

test('--section error lists valid values', async () => {
  const t = io()
  await main(['appraisal', 'alex', '--section', 'foo'], t.value)
  assert.match(t.err.join('\n'), /goals.*career.*idp.*final.*recognition.*notes/)
})

test('unknown person → exit 2', async () => {
  const t = io()
  assert.equal(await main(['appraisal', 'zed'], t.value), 2)
  assert.match(t.err.join('\n'), /alex/)
})

test('missing roster → exit 3 with copy instructions', async () => {
  const t = io({ env: { NERV_PEOPLE_CONFIG: '/nonexistent/x.json' } })
  assert.equal(await main(['ls', '--json'], t.value), 3)
  assert.equal(JSON.parse(t.out.join('')).error, 'roster')
  assert.match(t.err.join('\n'), /people\.example\.json/)
})

test('login without TTY exits 1 immediately with interactive hint', async () => {
  const t = io({ readSecret: async () => { throw new Error('must not prompt') } })
  assert.equal(await main(['login'], t.value), 1)
  assert.match(t.err.join('\n'), /interactive:.*! nerv people login/)
})

test('login with TTY saves to keychain and never echoes the secret', async () => {
  const calls: string[][] = []
  const t = io({
    isTTY: true,
    readSecret: async () => `PHPSESSID=${SECRET}`,
    exec: (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: '' } },
  })
  assert.equal(await main(['login'], t.value), 0)
  assert.ok(calls[0].includes('add-generic-password'))
  assert.ok(!t.all().includes(SECRET))
})

test('help lists every verb', async () => {
  const t = io()
  assert.equal(await main(['--help'], t.value), 0)
  for (const verb of ['ls', 'resolve', 'appraisal', 'login']) assert.match(t.out.join('\n'), new RegExp(`\\b${verb}\\b`))
})

test('verb --help prints that verb usage', async () => {
  const t = io()
  assert.equal(await main(['appraisal', '--help'], t.value), 0)
  assert.match(t.out.join('\n'), /--section/)
})

test('privacy: session never appears in any output across failure modes', async () => {
  const failing: FetchLike[] = [
    async () => ({ status: 500, ok: false, headers: { get: () => 'application/json' }, json: async () => ({}) }),
    async () => ({ status: 302, ok: false, headers: { get: () => null }, json: async () => ({}) }),
    async () => { throw new TypeError('fetch failed') },
  ]
  for (const fetchImpl of failing) {
    for (const json of [true, false]) {
      const t = io({ fetchImpl })
      await main(['appraisal', 'alex', ...(json ? ['--json'] : [])], t.value)
      assert.ok(!t.all().includes(SECRET))
    }
  }
})
