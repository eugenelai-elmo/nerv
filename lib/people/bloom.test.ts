import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAppraisal, type FetchLike } from './bloom.js'
import { parseRoster } from './roster.js'
import * as fx from './fixtures/bloom.js'

const BASE = 'https://bloom.example.test/api'
const SECRET = 'sess123'
const person = parseRoster({
  schemaVersion: 1,
  people: [{ id: 'alex', name: 'Alex Example', relationship: 'report', bloom: { FY27: fx.PERF_ID } }],
}).people[0]

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body }
}

function routes(overrides: Record<string, () => ReturnType<typeof jsonRes>> = {}): { fetchImpl: FetchLike; calls: string[]; cookies: string[] } {
  const p = `${BASE}/performances/${fx.PERF_ID}`
  const table: Record<string, () => ReturnType<typeof jsonRes>> = {
    [p]: () => jsonRes(fx.overview),
    [`${p}/sections`]: () => jsonRes(fx.sections),
    [`${p}/question-sections/11`]: () => jsonRes(fx.goalsSection),
    [`${p}/question-sections/12`]: () => jsonRes(fx.careerSection),
    [`${p}/development-sections/13`]: () => jsonRes(fx.idpSection),
    [`${p}/summary-sections/14`]: () => jsonRes(fx.finalSection),
    [`${p}/recommendation-sections/15`]: () => jsonRes(fx.recognitionSection),
    [`${p}/sections/11/items/101/notes`]: () => jsonRes(fx.notesFor101),
    ...overrides,
  }
  const calls: string[] = []
  const cookies: string[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(url)
    cookies.push(init.headers.Cookie)
    const h = table[url]
    return h ? h() : jsonRes([], 200) // unknown notes endpoints → empty list
  }
  return { fetchImpl, calls, cookies }
}

const opts = (fetchImpl: FetchLike) => ({ baseUrl: BASE, session: SECRET, fy: 'FY27', fetchImpl })

test('maps all five sections and overview', async () => {
  const { fetchImpl, cookies } = routes()
  const r = await fetchAppraisal(person, opts(fetchImpl))
  assert.equal(r.status, 'ok')
  const a = r.data!
  assert.equal(a.employee, 'Alex Example')
  assert.equal(a.progressStatus, 'In Progress')
  assert.deepEqual(a.period, { start: '2026-07-01', end: '2027-06-30' })
  assert.deepEqual(a.sections.map(s => s.key), ['goals', 'career', 'idp', 'final', 'recognition'])
  const goals = a.sections[0]
  assert.equal(goals.items[0].responses[0].value, 'Ship the theming engine')
  assert.equal(goals.items[0].responses[0].author, 'Alex Example')
  assert.deepEqual(goals.items[0].notes, ['Good progress in Q1'])
  assert.equal(a.sections[1].items[1].responses[0].author, 'Alex Example') // string author
  assert.deepEqual(a.sections[2].items[0].actions, ['Run an arch guild session'])
  assert.equal(a.sections[2].items[0].label, 'Technical')
  assert.ok(cookies.every(c => c === `PHPSESSID=${SECRET}`))
})

test('only=idp fetches just the IDP section detail', async () => {
  const { fetchImpl, calls } = routes()
  const r = await fetchAppraisal(person, { ...opts(fetchImpl), only: 'idp' })
  assert.deepEqual(r.data!.sections.map(s => s.key), ['idp'])
  assert.ok(!calls.some(u => u.includes('question-sections')))
})

test('only=goals classifies question sections by title', async () => {
  const { fetchImpl } = routes()
  const r = await fetchAppraisal(person, { ...opts(fetchImpl), only: 'goals' })
  assert.deepEqual(r.data!.sections.map(s => s.key), ['goals'])
})

test('unknown section type is kept as other', async () => {
  const { fetchImpl } = routes({
    [`${BASE}/performances/${fx.PERF_ID}/sections`]: () => jsonRes([...fx.sections, { id: 16, type: 'survey', title: 'Pulse' }]),
  })
  const r = await fetchAppraisal(person, opts(fetchImpl))
  const other = r.data!.sections.find(s => s.key === 'other')!
  assert.equal(other.title, 'Pulse')
  assert.deepEqual(other.items, [])
})

test('data envelope {data: ...} is unwrapped', async () => {
  const { fetchImpl } = routes({
    [`${BASE}/performances/${fx.PERF_ID}/sections`]: () => jsonRes({ data: fx.sections }),
  })
  const r = await fetchAppraisal(person, opts(fetchImpl))
  assert.equal(r.data!.sections.length, 5)
})

test('no FY id → not_applicable, no network', async () => {
  const { fetchImpl, calls } = routes()
  const r = await fetchAppraisal(person, { ...opts(fetchImpl), fy: 'FY28' })
  assert.equal(r.status, 'not_applicable')
  assert.match(r.hint!, /FY28/)
  assert.equal(calls.length, 0)
})

test('no session → auth_expired interactive hint, no network', async () => {
  const { fetchImpl, calls } = routes()
  const r = await fetchAppraisal(person, { ...opts(fetchImpl), session: null })
  assert.equal(r.status, 'auth_expired')
  assert.match(r.hint!, /^interactive:/)
  assert.equal(calls.length, 0)
})

test('no baseUrl → unavailable with config hint', async () => {
  const { fetchImpl } = routes()
  const r = await fetchAppraisal(person, { ...opts(fetchImpl), baseUrl: null })
  assert.equal(r.status, 'unavailable')
  assert.match(r.hint!, /bloom.*baseUrl/)
})

for (const [label, res] of [
  ['401', () => jsonRes({}, 401)],
  ['403', () => jsonRes({}, 403)],
  ['302', () => ({ ...jsonRes({}, 302), ok: false })],
  ['200 text/html login page', () => ({ status: 200, ok: true, headers: { get: () => 'text/html; charset=UTF-8' }, json: async () => { throw new SyntaxError('Unexpected token <') } })],
] as const) {
  test(`session expiry detected: ${label}`, async () => {
    const { fetchImpl } = routes({ [`${BASE}/performances/${fx.PERF_ID}`]: res as () => ReturnType<typeof jsonRes> })
    const r = await fetchAppraisal(person, opts(fetchImpl))
    assert.equal(r.status, 'auth_expired')
    assert.match(r.hint!, /^interactive:/)
  })
}

test('5xx → unavailable, hint never contains the session', async () => {
  const { fetchImpl } = routes({ [`${BASE}/performances/${fx.PERF_ID}`]: () => jsonRes({}, 503) })
  const r = await fetchAppraisal(person, opts(fetchImpl))
  assert.equal(r.status, 'unavailable')
  assert.ok(!JSON.stringify(r).includes(SECRET))
})

test('network error → unavailable', async () => {
  const fetchImpl: FetchLike = async () => { throw new TypeError('fetch failed') }
  const r = await fetchAppraisal(person, opts(fetchImpl))
  assert.equal(r.status, 'unavailable')
  assert.match(r.hint!, /fetch failed/)
})
