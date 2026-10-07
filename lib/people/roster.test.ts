import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRoster, loadRoster, resolvePerson, RosterError } from './roster.js'

const valid = {
  schemaVersion: 1,
  bloom: { baseUrl: 'https://bloom.example.test/api' },
  people: [
    { id: 'alex', name: 'Alex Example', aliases: ['al'], relationship: 'report',
      github: 'alex-gh', jira: 'Alex Example', bloom: { FY27: 1001 } },
    { id: 'sam', name: 'Sam Sample', relationship: 'team', github: null, jira: 'Sam Sample' },
    { id: 'sasha', name: 'Sasha Test', relationship: 'report' },
  ],
}

test('parseRoster fills defaults', () => {
  const r = parseRoster(valid)
  const sam = r.people[1]
  assert.deepEqual(sam.aliases, [])
  assert.deepEqual(sam.squads, [])
  assert.deepEqual(sam.bloom, {})
  assert.equal(r.people[2].github, null)
})

test('parseRoster allows missing bloom block', () => {
  const { bloom, ...rest } = valid
  assert.equal(parseRoster(rest).bloom, null)
})

const bad: Array<[string, (v: any) => void, RegExp]> = [
  ['schemaVersion', v => { v.schemaVersion = 2 }, /schemaVersion/],
  ['unknown top-level', v => { v.extra = 1 }, /unknown field "extra"/],
  ['bloom.baseUrl http', v => { v.bloom.baseUrl = 'http://x' }, /bloom\.baseUrl/],
  ['people not array', v => { v.people = {} }, /people: expected array/],
  ['bad id', v => { v.people[0].id = 'Alex!' }, /people\[0\]\.id/],
  ['empty name', v => { v.people[0].name = '' }, /people\[0\]\.name/],
  ['bad relationship', v => { v.people[0].relationship = 'boss' }, /people\[0\]\.relationship: expected "report" \| "team"/],
  ['unknown person field', v => { v.people[0].nickname = 'x' }, /people\[0\]: unknown field "nickname"/],
  ['bad FY key', v => { v.people[0].bloom = { '2027': 1 } }, /people\[0\]\.bloom: key "2027"/],
  ['non-integer perf id', v => { v.people[0].bloom = { FY27: '1001' } }, /people\[0\]\.bloom\.FY27/],
  ['duplicate id', v => { v.people[1].id = 'alex' }, /duplicate id or alias "alex"/],
  ['alias clashes with id', v => { v.people[1].aliases = ['ALEX'] }, /duplicate id or alias "alex"/],
]

for (const [name, mutate, re] of bad) {
  test(`parseRoster rejects: ${name}`, () => {
    const v = structuredClone(valid) as any
    mutate(v)
    assert.throws(() => parseRoster(v), (e: unknown) => e instanceof RosterError && re.test((e as Error).message))
  })
}

test('loadRoster: missing file explains how to create it', async () => {
  await assert.rejects(loadRoster('/nonexistent/people.local.json'),
    (e: unknown) => e instanceof RosterError && /people\.example\.json/.test((e as Error).message))
})

test('loadRoster: invalid JSON is a RosterError', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roster-'))
  const p = join(dir, 'people.local.json')
  await writeFile(p, '{ nope')
  await assert.rejects(loadRoster(p), RosterError)
})

test('loadRoster: reads a valid file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roster-'))
  const p = join(dir, 'people.local.json')
  await writeFile(p, JSON.stringify(valid))
  assert.equal((await loadRoster(p)).people.length, 3)
})

test('config/people.example.json is a valid roster', async () => {
  const p = new URL('../../config/people.example.json', import.meta.url).pathname
  const r = await loadRoster(p)
  assert.equal(r.people.length, 2)
})

const roster = parseRoster(valid)

test('resolve: exact id, alias, and full name, case-insensitive', () => {
  for (const q of ['alex', 'AL', 'alex example']) {
    const r = resolvePerson(roster, q)
    assert.equal(r.kind, 'found'); assert.equal(r.kind === 'found' && r.person.id, 'alex')
  }
})

test('resolve: unique prefix of a name token', () => {
  const r = resolvePerson(roster, 'samp')
  assert.equal(r.kind === 'found' && r.person.id, 'sam')
})

test('resolve: ambiguous partial returns candidates', () => {
  const r = resolvePerson(roster, 'sa')
  assert.equal(r.kind, 'ambiguous')
  assert.deepEqual(r.kind === 'ambiguous' && r.candidates.map(p => p.id).sort(), ['sam', 'sasha'])
})

test('resolve: unknown returns whole roster as candidates', () => {
  const r = resolvePerson(roster, 'zed')
  assert.equal(r.kind, 'unknown')
  assert.equal(r.kind === 'unknown' && r.candidates.length, 3)
})
