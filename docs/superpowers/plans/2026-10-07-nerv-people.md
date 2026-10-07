# `nerv people` v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user say "bring up <report>'s profile" and have Claude produce it, backed by a `nerv people` CLI that reads a single local roster and the Bloom appraisal API.

**Architecture:** A gitignored roster file holds identity only. `lib/people/*` holds small single-purpose modules (FY, roster, credentials, Bloom adapter, renderer, CLI `main`). `commands/people.ts` is a thin process wrapper. A `/people` skill consumes `--json` output and adds GitHub (existing `/dev-radar` procedure) and Jira (Atlassian MCP).

**Tech Stack:** Node 22, TypeScript (ESM, `nodenext`), `tsx`, `node:test`, macOS `security` CLI. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-07-nerv-people-design.md` (v1 scope = section 11)

## Global Constraints

- Strictly read-only against Bloom: GET requests only.
- No new runtime dependencies; use Node built-ins (`fetch`, `node:child_process`, `node:fs`, `node:test`).
- Nothing persisted except `config/people.local.json` (gitignored) and the Keychain entry (service `nerv-bloom`).
- No real names, performance IDs, employee IDs, or the Bloom tenant host in any committed file. Fixtures use fictional people.
- The session cookie never appears in stdout, stderr, thrown messages, or files.
- With `--json`, stdout contains exactly one JSON document; diagnostics go to stderr.
- Every JSON output carries `"schemaVersion": 1`.
- Exit codes: `0` ok (including partial), `1` usage / non-TTY login, `2` person not resolved, `3` roster missing or invalid.
- Non-ok source results carry a `hint`; prefix `interactive:` when the user must act.
- Only `login` reads stdin; without a TTY it exits 1 immediately.
- Default FY = current Australian financial year (1 Jul – 30 Jun), label `FYnn` where `nn` is the year the FY ends.
- Commit messages: no `Co-Authored-By` lines (user's CLAUDE.md).
- All commands run from the worktree: `/Users/eugene.lai/Projects/nerv/.claude/worktrees/nerv-people`.

## Review Focus

1. Cookie pasted with a `PHPSESSID=` prefix, surrounding quotes, or trailing whitespace → normalised and saved; anything with other characters rejected (header injection). Test in Task 2.
2. Expired session answered by Bloom as `200 text/html` (login page) rather than 401 → `auth_expired`, not a JSON parse crash. Test in Task 3.
3. Short query matching several people (e.g. `"a"`) → exit 2 with a candidate list, never a silent first match. Test in Task 1 + Task 5.
4. A report with no Bloom ID for the requested FY → `not_applicable` with a hint, exit 0, no network call. Test in Task 3 + Task 5.
5. Bad flag values (`--section foo`, `--fy 2027`) → exit 1 listing valid values, no network call. Test in Task 5.

---

## File Structure

| Path | Responsibility |
|---|---|
| `lib/people/fy.ts` | current AU FY label; parse `--fy` |
| `lib/people/roster.ts` | roster path, load, validate, resolve |
| `lib/people/credentials.ts` | normalise cookie; read/write Keychain; env override |
| `lib/people/bloom.ts` | Bloom HTTP + mapping → `SourceResult<Appraisal>` |
| `lib/people/render.ts` | roster + appraisal → terminal markdown |
| `lib/people/cli.ts` | `main(argv, io)` — parsing, dispatch, exit codes, help |
| `commands/people.ts` | wires `main` to `process`, hidden-input prompt |
| `bin/nerv` | `people)` dispatch + usage line |
| `config/people.example.json` | committed, fictional roster |
| `.gitignore` | ignore `config/people.local.json` |
| `package.json` | `test` script |
| `lib/people/*.test.ts` | tests per module |
| `lib/people/fixtures/*.json` | fictional Bloom responses |
| `skills/people/SKILL.md` | `/people` profile skill |

---

### Task 1: Roster + FY foundation

**Files:**
- Create: `lib/people/fy.ts`, `lib/people/roster.ts`, `config/people.example.json`
- Modify: `.gitignore`, `package.json`
- Test: `lib/people/fy.test.ts`, `lib/people/roster.test.ts`

**Interfaces:**
- Produces:
  - `currentFy(now?: Date): string` — e.g. `"FY27"`
  - `parseFy(input: string): string | null` — `"fy27"` → `"FY27"`, else `null`
  - `type Relationship = 'report' | 'team'`
  - `interface Person { id: string; name: string; aliases: string[]; relationship: Relationship; squads: string[]; github: string | null; jira: string | null; bloom: Record<string, number> }`
  - `interface Roster { schemaVersion: 1; bloom: { baseUrl: string } | null; people: Person[] }`
  - `class RosterError extends Error`
  - `rosterPath(): string` — `$NERV_PEOPLE_CONFIG` or `<nerv>/config/people.local.json`
  - `parseRoster(raw: unknown): Roster` — throws `RosterError`
  - `loadRoster(path?: string): Promise<Roster>` — throws `RosterError`
  - `type Resolution = { kind: 'found'; person: Person } | { kind: 'ambiguous' | 'unknown'; candidates: Person[] }`
  - `resolvePerson(roster: Roster, query: string): Resolution`

- [ ] **Step 1: Install deps and add test script**

```bash
npm install
```

In `package.json` `"scripts"`, add as the first entry:

```json
"test": "tsx --test 'lib/**/*.test.ts'",
```

Append to `.gitignore` under `# Machine-specific config`:

```
config/people.local.json
```

- [ ] **Step 2: Write failing FY tests** — `lib/people/fy.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentFy, parseFy } from './fy.js'

test('currentFy: 30 June belongs to the FY ending that year', () => {
  assert.equal(currentFy(new Date(2027, 5, 30)), 'FY27')
})

test('currentFy: 1 July starts the next FY', () => {
  assert.equal(currentFy(new Date(2026, 6, 1)), 'FY27')
})

test('currentFy: October 2026 is FY27', () => {
  assert.equal(currentFy(new Date(2026, 9, 7)), 'FY27')
})

test('parseFy normalises case and whitespace', () => {
  assert.equal(parseFy(' fy28 '), 'FY28')
})

test('parseFy rejects non-FY input', () => {
  assert.equal(parseFy('2027'), null)
  assert.equal(parseFy('FY2027'), null)
})
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module './fy.js'`)

Run: `npx tsx --test lib/people/fy.test.ts`

- [ ] **Step 4: Implement** — `lib/people/fy.ts`

```ts
// Australian financial year: 1 Jul – 30 Jun, labelled by the year it ends.
export function currentFy(now: Date = new Date()): string {
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `FY${String(endYear % 100).padStart(2, '0')}`
}

export function parseFy(input: string): string | null {
  const m = /^fy(\d{2})$/i.exec(input.trim())
  return m ? `FY${m[1]}` : null
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx tsx --test lib/people/fy.test.ts`

- [ ] **Step 6: Write failing roster tests** — `lib/people/roster.test.ts`

```ts
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
```

- [ ] **Step 7: Run — expect FAIL** (`Cannot find module './roster.js'`)

Run: `npx tsx --test lib/people/roster.test.ts`

- [ ] **Step 8: Implement** — `lib/people/roster.ts`

```ts
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Relationship = 'report' | 'team'

export interface Person {
  id: string
  name: string
  aliases: string[]
  relationship: Relationship
  squads: string[]
  github: string | null
  jira: string | null
  bloom: Record<string, number>
}

export interface Roster {
  schemaVersion: 1
  bloom: { baseUrl: string } | null
  people: Person[]
}

export class RosterError extends Error {}

export type Resolution =
  | { kind: 'found'; person: Person }
  | { kind: 'ambiguous' | 'unknown'; candidates: Person[] }

const NERV_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TOP_KEYS = new Set(['schemaVersion', 'bloom', 'people'])
const PERSON_KEYS = new Set(['id', 'name', 'aliases', 'relationship', 'squads', 'github', 'jira', 'bloom'])

export function rosterPath(): string {
  return process.env.NERV_PEOPLE_CONFIG ?? join(NERV_ROOT, 'config', 'people.local.json')
}

function fail(msg: string): never {
  throw new RosterError(`Invalid roster — ${msg}`)
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function strArray(v: unknown, path: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim())) fail(`${path}: expected array of non-empty strings`)
  return v as string[]
}

function nullableStr(v: unknown, path: string): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string' || !v.trim()) fail(`${path}: expected non-empty string or null`)
  return v
}

function parsePerson(v: unknown, i: number): Person {
  const at = `people[${i}]`
  if (!isObj(v)) fail(`${at}: expected object`)
  for (const k of Object.keys(v)) if (!PERSON_KEYS.has(k)) fail(`${at}: unknown field "${k}"`)
  if (typeof v.id !== 'string' || !/^[a-z0-9-]+$/.test(v.id)) fail(`${at}.id: expected lowercase letters, digits, hyphens`)
  if (typeof v.name !== 'string' || !v.name.trim()) fail(`${at}.name: expected non-empty string`)
  if (v.relationship !== 'report' && v.relationship !== 'team') fail(`${at}.relationship: expected "report" | "team"`)
  const bloom: Record<string, number> = {}
  if (v.bloom !== undefined) {
    if (!isObj(v.bloom)) fail(`${at}.bloom: expected object like {"FY27": 1234}`)
    for (const [k, id] of Object.entries(v.bloom)) {
      if (!/^FY\d{2}$/.test(k)) fail(`${at}.bloom: key "${k}" must look like "FY27"`)
      if (!Number.isInteger(id) || (id as number) <= 0) fail(`${at}.bloom.${k}: expected positive integer`)
      bloom[k] = id as number
    }
  }
  return {
    id: v.id,
    name: v.name,
    aliases: strArray(v.aliases, `${at}.aliases`),
    relationship: v.relationship,
    squads: strArray(v.squads, `${at}.squads`),
    github: nullableStr(v.github, `${at}.github`),
    jira: nullableStr(v.jira, `${at}.jira`),
    bloom,
  }
}

export function parseRoster(raw: unknown): Roster {
  if (!isObj(raw)) fail('expected a JSON object')
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) fail(`unknown field "${k}"`)
  if (raw.schemaVersion !== 1) fail('schemaVersion: expected 1')
  let bloom: Roster['bloom'] = null
  if (raw.bloom !== undefined) {
    if (!isObj(raw.bloom) || typeof raw.bloom.baseUrl !== 'string' || !raw.bloom.baseUrl.startsWith('https://')) {
      fail('bloom.baseUrl: expected an https:// URL')
    }
    bloom = { baseUrl: raw.bloom.baseUrl.replace(/\/+$/, '') }
  }
  if (!Array.isArray(raw.people)) fail('people: expected array')
  const people = raw.people.map(parsePerson)
  const seen = new Set<string>()
  for (const p of people) {
    for (const key of [p.id, ...p.aliases].map(s => s.toLowerCase())) {
      if (seen.has(key)) fail(`duplicate id or alias "${key}"`)
      seen.add(key)
    }
  }
  return { schemaVersion: 1, bloom, people }
}

export async function loadRoster(path: string = rosterPath()): Promise<Roster> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch {
    throw new RosterError(`Roster not found at ${path}. Copy config/people.example.json to config/people.local.json and fill it in.`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new RosterError(`Roster at ${path} is not valid JSON: ${(e as Error).message}`)
  }
  return parseRoster(raw)
}

export function resolvePerson(roster: Roster, query: string): Resolution {
  const q = query.trim().toLowerCase()
  const exact = roster.people.filter(p =>
    p.id === q || p.name.toLowerCase() === q || p.aliases.some(a => a.toLowerCase() === q))
  if (exact.length === 1) return { kind: 'found', person: exact[0] }
  const partial = q
    ? roster.people.filter(p =>
        [p.id, ...p.aliases, ...p.name.toLowerCase().split(/\s+/)].some(t => t.toLowerCase().startsWith(q)))
    : []
  if (partial.length === 1) return { kind: 'found', person: partial[0] }
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial }
  return { kind: 'unknown', candidates: roster.people }
}
```

- [ ] **Step 9: Run — expect PASS**

Run: `npx tsx --test lib/people/roster.test.ts`

- [ ] **Step 10: Add example roster** — `config/people.example.json`

```json
{
  "schemaVersion": 1,
  "bloom": { "baseUrl": "https://<tenant>/cobra/api/tms/api/performance/v1" },
  "people": [
    {
      "id": "alex",
      "name": "Alex Example",
      "aliases": ["al"],
      "relationship": "report",
      "squads": ["mobfe"],
      "github": "alexexample-org",
      "jira": "Alex Example",
      "bloom": { "FY27": 1234 }
    },
    {
      "id": "sam",
      "name": "Sam Sample",
      "relationship": "team",
      "github": null,
      "jira": "Sam Sample"
    }
  ]
}
```

Add a test to `roster.test.ts` so the example never rots:

```ts
test('config/people.example.json is a valid roster', async () => {
  const p = new URL('../../config/people.example.json', import.meta.url).pathname
  const r = await loadRoster(p)
  assert.equal(r.people.length, 2)
})
```

Note: `<tenant>` makes the URL still start with `https://`, so it validates.

- [ ] **Step 11: Run all tests — expect PASS**

Run: `npm test`

- [ ] **Step 12: Commit**

```bash
git add .gitignore package.json package-lock.json config/people.example.json lib/people/fy.ts lib/people/fy.test.ts lib/people/roster.ts lib/people/roster.test.ts
git commit -m "Add people roster loader and FY helper"
```

---

### Task 2: Credentials (Keychain + env override)

**Files:**
- Create: `lib/people/credentials.ts`
- Test: `lib/people/credentials.test.ts`

**Interfaces:**
- Produces:
  - `type Exec = (cmd: string, args: string[]) => { status: number | null; stdout: string }`
  - `KEYCHAIN_SERVICE = 'nerv-bloom'`
  - `normaliseSession(input: string): string | null` — strips `PHPSESSID=`, quotes, whitespace; `null` if invalid
  - `readSession(env?: NodeJS.ProcessEnv, exec?: Exec): string | null`
  - `saveSession(value: string, exec?: Exec): void` — throws `Error` (message never contains value)

- [ ] **Step 1: Write failing tests** — `lib/people/credentials.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseSession, readSession, saveSession, KEYCHAIN_SERVICE, type Exec } from './credentials.js'

const SECRET = 'abc123def456ghi789'

test('normaliseSession accepts raw, prefixed, quoted, padded values', () => {
  for (const input of [SECRET, `PHPSESSID=${SECRET}`, `"${SECRET}"`, `  ${SECRET}\n`, `'PHPSESSID=${SECRET}'`]) {
    assert.equal(normaliseSession(input), SECRET)
  }
})

test('normaliseSession rejects header-injection and empty values', () => {
  for (const input of ['', '   ', 'abc;def', 'abc\r\nX-Evil: 1', 'abc def']) {
    assert.equal(normaliseSession(input), null)
  }
})

test('readSession prefers BLOOM_SESSION env', () => {
  const exec: Exec = () => { throw new Error('should not call keychain') }
  assert.equal(readSession({ BLOOM_SESSION: `PHPSESSID=${SECRET}` }, exec), SECRET)
})

test('readSession falls back to keychain', () => {
  const calls: string[][] = []
  const exec: Exec = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: `${SECRET}\n` } }
  assert.equal(readSession({}, exec), SECRET)
  assert.equal(calls[0][0], 'security')
  assert.ok(calls[0].includes('find-generic-password'))
  assert.ok(calls[0].includes(KEYCHAIN_SERVICE))
})

test('readSession returns null when keychain has no entry', () => {
  const exec: Exec = () => ({ status: 44, stdout: '' })
  assert.equal(readSession({}, exec), null)
})

test('saveSession writes normalised value with -U (update)', () => {
  const calls: string[][] = []
  const exec: Exec = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: '' } }
  saveSession(`PHPSESSID=${SECRET}`, exec)
  const args = calls[0]
  assert.ok(args.includes('add-generic-password'))
  assert.ok(args.includes('-U'))
  assert.equal(args[args.indexOf('-w') + 1], SECRET)
})

test('saveSession rejects invalid value without echoing it', () => {
  const exec: Exec = () => ({ status: 0, stdout: '' })
  assert.throws(() => saveSession('bad;value', exec), (e: unknown) => !(e as Error).message.includes('bad;value'))
})

test('saveSession failure message never contains the secret', () => {
  const exec: Exec = () => ({ status: 1, stdout: '' })
  assert.throws(() => saveSession(SECRET, exec), (e: unknown) => !(e as Error).message.includes(SECRET))
})
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './credentials.js'`)

Run: `npx tsx --test lib/people/credentials.test.ts`

- [ ] **Step 3: Implement** — `lib/people/credentials.ts`

```ts
import { spawnSync } from 'node:child_process'
import { userInfo } from 'node:os'

export type Exec = (cmd: string, args: string[]) => { status: number | null; stdout: string }

export const KEYCHAIN_SERVICE = 'nerv-bloom'

const defaultExec: Exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  return { status: r.status, stdout: r.stdout ?? '' }
}

// PHPSESSID values are [A-Za-z0-9,-]. Anything else could inject into the Cookie header.
export function normaliseSession(input: string): string | null {
  let v = input.trim().replace(/^['"]|['"]$/g, '').trim()
  v = v.replace(/^PHPSESSID=/i, '')
  return /^[A-Za-z0-9,-]+$/.test(v) ? v : null
}

export function readSession(env: NodeJS.ProcessEnv = process.env, exec: Exec = defaultExec): string | null {
  if (env.BLOOM_SESSION?.trim()) return normaliseSession(env.BLOOM_SESSION)
  const r = exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-w'])
  if (r.status !== 0) return null
  return normaliseSession(r.stdout)
}

export function saveSession(value: string, exec: Exec = defaultExec): void {
  const v = normaliseSession(value)
  if (!v) throw new Error('That does not look like a PHPSESSID value (expected letters, digits, "-" or ",").')
  const r = exec('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-w', v])
  if (r.status !== 0) throw new Error(`Keychain write failed (security exited ${r.status}).`)
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx tsx --test lib/people/credentials.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/people/credentials.ts lib/people/credentials.test.ts
git commit -m "Add Bloom session credentials via Keychain"
```

---

### Task 3: Bloom adapter

**Files:**
- Create: `lib/people/bloom.ts`, `lib/people/fixtures/bloom.ts`
- Test: `lib/people/bloom.test.ts`

**Interfaces:**
- Consumes: `Person` (Task 1)
- Produces:
  - `type SourceStatus = 'ok' | 'auth_expired' | 'unavailable' | 'not_applicable'`
  - `interface SourceResult<T> { status: SourceStatus; data?: T; hint?: string }`
  - `type SectionKey = 'goals' | 'career' | 'idp' | 'final' | 'recognition' | 'other'`
  - `SECTION_KEYS: readonly SectionKey[]`
  - `interface ItemResponse { author: string | null; reviewer: string | null; value: string }`
  - `interface AppraisalItem { id: number; title: string; description: string | null; label: string | null; responses: ItemResponse[]; actions: string[]; notes: string[] }`
  - `interface AppraisalSection { key: SectionKey; sectionId: number; type: string; title: string; status: string | null; items: AppraisalItem[]; extra: string[] }`
  - `interface Appraisal { fy: string; performanceId: number; title: string; employee: string | null; progressStatus: string | null; period: { start: string | null; end: string | null }; sections: AppraisalSection[] }`
  - `type FetchLike = (url: string, init: { headers: Record<string, string>; redirect: 'manual' }) => Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>`
  - `fetchAppraisal(person: Person, opts: { baseUrl: string | null; session: string | null; fy: string; only?: SectionKey; fetchImpl?: FetchLike }): Promise<SourceResult<Appraisal>>`
  - `LOGIN_HINT = "interactive: ask the user to run '! nerv people login' (copy PHPSESSID from Chrome DevTools → Application → Cookies)"`

Notes are always fetched for every section that is fetched; `only` limits which sections are fetched. (`--section notes` is a render-time filter in Task 5.)

- [ ] **Step 1: Write fictional fixtures** — `lib/people/fixtures/bloom.ts`

Shapes follow the PRD. All names fictional.

```ts
export const PERF_ID = 1001

export const overview = {
  id: PERF_ID,
  title: 'Performance Appraisal FY27 - Alex Example',
  employee: { id: 77, fullName: 'Alex Example' },
  manager: { id: 1, fullName: 'Morgan Manager' },
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  progressStatus: 'In Progress',
}

export const sections = [
  { id: 11, type: 'question', title: 'Individual Goals & Objectives' },
  { id: 12, type: 'question', title: 'Career Aspirations, Interests & Strengths' },
  { id: 13, type: 'development', title: 'Individual Development Plan (IDP)' },
  { id: 14, type: 'summary', title: 'Final Review & Rating' },
  { id: 15, type: 'recommendation', title: 'Recognition' },
]

export const goalsSection = {
  title: 'Individual Goals & Objectives',
  status: 'In Progress',
  items: [
    { id: 101, title: 'Enter Individual Goals & Objectives Below', description: null, type: 'text',
      responses: [{ id: 1, author: { fullName: 'Alex Example' }, value: 'Ship the theming engine', reviewer: { id: 1, fullName: 'Morgan Manager' } }] },
  ],
}

export const careerSection = {
  title: 'Career Aspirations, Interests & Strengths',
  status: 'Not Started',
  items: [
    { id: 201, title: 'My Career Aspirations and Interests (enter 2-3)', type: 'text', responses: [] },
    { id: 202, title: 'My Top Strengths (enter 2-3)', type: 'text', responses: [{ id: 2, author: 'Alex Example', value: 'Debugging', reviewer: null }] },
    { id: 203, title: 'My Top Development Areas (enter 2-3)', type: 'text', responses: [] },
  ],
}

export const idpSection = {
  title: 'Individual Development Plan (IDP)',
  items: [
    { id: 301, title: 'Grow system design skills', description: 'Lead one design review', label: 'Technical',
      actions: [{ id: 1, title: 'Run an arch guild session' }], weight: null, ratings: [] },
  ],
}

export const finalSection = {
  title: 'Final Review & Rating',
  status: 'Not Started',
  items: [],
  comment: null,
}

export const recognitionSection = { title: 'Recognition', items: [] }

export const notesFor101 = [{ id: 9, value: 'Good progress in Q1', author: { fullName: 'Morgan Manager' } }]
```

- [ ] **Step 2: Write failing tests** — `lib/people/bloom.test.ts`

```ts
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
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module './bloom.js'`)

Run: `npx tsx --test lib/people/bloom.test.ts`

- [ ] **Step 4: Implement** — `lib/people/bloom.ts`

```ts
import type { Person } from './roster.js'

export type SourceStatus = 'ok' | 'auth_expired' | 'unavailable' | 'not_applicable'

export interface SourceResult<T> {
  status: SourceStatus
  data?: T
  hint?: string
}

export type SectionKey = 'goals' | 'career' | 'idp' | 'final' | 'recognition' | 'other'
export const SECTION_KEYS: readonly SectionKey[] = ['goals', 'career', 'idp', 'final', 'recognition', 'other']

export interface ItemResponse { author: string | null; reviewer: string | null; value: string }

export interface AppraisalItem {
  id: number
  title: string
  description: string | null
  label: string | null
  responses: ItemResponse[]
  actions: string[]
  notes: string[]
}

export interface AppraisalSection {
  key: SectionKey
  sectionId: number
  type: string
  title: string
  status: string | null
  items: AppraisalItem[]
  extra: string[] // top-level text fields we don't model (e.g. a summary comment)
}

export interface Appraisal {
  fy: string
  performanceId: number
  title: string
  employee: string | null
  progressStatus: string | null
  period: { start: string | null; end: string | null }
  sections: AppraisalSection[]
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; redirect: 'manual' },
) => Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>

export const LOGIN_HINT =
  "interactive: ask the user to run '! nerv people login' (copy PHPSESSID from Chrome DevTools → Application → Cookies)"

const PREFIX: Record<string, string> = {
  question: 'question-sections',
  development: 'development-sections',
  summary: 'summary-sections',
  recommendation: 'recommendation-sections',
}

class AuthExpired extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function unwrap(v: unknown): unknown {
  return isObj(v) && 'data' in v && !('id' in v) ? v.data : v
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function nameOf(v: unknown): string | null {
  return str(v) ?? (isObj(v) ? str(v.fullName) ?? str(v.name) : null)
}

// Bloom's nested shapes vary; pull the first human-readable field.
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (isObj(v)) {
    for (const k of ['value', 'text', 'content', 'comment', 'title', 'description', 'name']) {
      const s = str(v[k])
      if (s) return s
    }
  }
  return JSON.stringify(v)
}

function list(v: unknown): unknown[] {
  const u = unwrap(v)
  if (Array.isArray(u)) return u
  if (isObj(u) && Array.isArray(u.items)) return u.items
  return []
}

function classify(type: string, title: string): SectionKey {
  if (type === 'question') return /goal/i.test(title) ? 'goals' : 'career'
  if (type === 'development') return 'idp'
  if (type === 'summary') return 'final'
  if (type === 'recommendation') return 'recognition'
  return 'other'
}

function mapItem(raw: unknown): Omit<AppraisalItem, 'notes'> {
  const o = isObj(raw) ? raw : {}
  return {
    id: Number(o.id),
    title: str(o.title) ?? '(untitled)',
    description: str(o.description),
    label: str(o.label) ?? (isObj(o.label) ? str(o.label.name) : null),
    responses: (Array.isArray(o.responses) ? o.responses : []).map(r => {
      const ro = isObj(r) ? r : {}
      return { author: nameOf(ro.author), reviewer: nameOf(ro.reviewer), value: textOf(ro.value ?? '') }
    }),
    actions: (Array.isArray(o.actions) ? o.actions : []).map(textOf),
  }
}

export async function fetchAppraisal(
  person: Person,
  opts: { baseUrl: string | null; session: string | null; fy: string; only?: SectionKey; fetchImpl?: FetchLike },
): Promise<SourceResult<Appraisal>> {
  const performanceId = person.bloom[opts.fy]
  if (!performanceId) {
    return {
      status: 'not_applicable',
      hint: `No ${opts.fy} Bloom appraisal for ${person.id}. If one exists, add "bloom": {"${opts.fy}": <performanceId>} to their entry in config/people.local.json.`,
    }
  }
  if (!opts.baseUrl) {
    return { status: 'unavailable', hint: 'Add "bloom": {"baseUrl": "https://…/performance/v1"} to config/people.local.json.' }
  }
  if (!opts.session) return { status: 'auth_expired', hint: LOGIN_HINT }

  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike)
  const root = `${opts.baseUrl}/performances/${performanceId}`
  const headers = { Cookie: `PHPSESSID=${opts.session}`, Accept: 'application/json' }

  async function get(path: string): Promise<unknown> {
    const res = await fetchImpl(`${root}${path}`, { headers, redirect: 'manual' })
    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) throw new AuthExpired()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new AuthExpired()
    return unwrap(await res.json())
  }

  try {
    const [overviewRaw, sectionsRaw] = await Promise.all([get(''), get('/sections')])
    const overview = isObj(overviewRaw) ? overviewRaw : {}
    const sectionList = list(sectionsRaw).filter(isObj)

    const wanted = sectionList.filter(s => {
      if (!opts.only) return true
      const type = String(s.type)
      // question sections need their title to classify; listed titles are used when present
      if (type === 'question' && !str(s.title)) return opts.only === 'goals' || opts.only === 'career'
      return classify(type, str(s.title) ?? '') === opts.only
    })

    const sections = await Promise.all(wanted.map(async (s): Promise<AppraisalSection> => {
      const sectionId = Number(s.id)
      const type = String(s.type)
      const prefix = PREFIX[type]
      const detail = prefix ? await get(`/${prefix}/${sectionId}`) : {}
      const d = isObj(detail) ? detail : {}
      const title = str(d.title) ?? str(s.title) ?? '(untitled section)'
      const baseItems = list(d.items).map(mapItem)
      const items = await Promise.all(baseItems.map(async item => ({
        ...item,
        notes: list(await get(`/sections/${sectionId}/items/${item.id}/notes`)).map(textOf),
      })))
      const extra = Object.entries(d)
        .filter(([k, v]) => !['title', 'description', 'status', 'items', 'id', 'weight', 'performance', 'alerts'].includes(k) && str(v))
        .map(([k, v]) => `${k}: ${v}`)
      return { key: classify(type, title), sectionId, type, title, status: str(d.status), items, extra }
    }))

    const filtered = opts.only ? sections.filter(s => s.key === opts.only) : sections
    return {
      status: 'ok',
      data: {
        fy: opts.fy,
        performanceId,
        title: str(overview.title) ?? `${opts.fy} appraisal`,
        employee: nameOf(overview.employee),
        progressStatus: str(overview.progressStatus) ?? (isObj(overview.progressStatus) ? str(overview.progressStatus.name) : null),
        period: { start: str(overview.startDate), end: str(overview.endDate) },
        sections: filtered,
      },
    }
  } catch (e) {
    if (e instanceof AuthExpired) return { status: 'auth_expired', hint: LOGIN_HINT }
    return { status: 'unavailable', hint: `Bloom request failed (${(e as Error).message}). Check network/VPN and retry.` }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx tsx --test lib/people/bloom.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/people/bloom.ts lib/people/bloom.test.ts lib/people/fixtures/bloom.ts
git commit -m "Add Bloom appraisal adapter with session-expiry detection"
```

---

### Task 4: Renderer

**Files:**
- Create: `lib/people/render.ts`
- Test: `lib/people/render.test.ts`

**Interfaces:**
- Consumes: `Roster`, `Person` (Task 1); `SourceResult`, `Appraisal`, `AppraisalSection` (Task 3)
- Produces:
  - `renderRoster(roster: Roster): string`
  - `renderAppraisal(person: Person, result: SourceResult<Appraisal>, opts?: { notesOnly?: boolean }): string`

- [ ] **Step 1: Write failing tests** — `lib/people/render.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderRoster, renderAppraisal } from './render.js'
import { parseRoster } from './roster.js'
import type { Appraisal } from './bloom.js'

const roster = parseRoster({
  schemaVersion: 1,
  people: [
    { id: 'sam', name: 'Sam Sample', relationship: 'team', github: 'sam-gh' },
    { id: 'alex', name: 'Alex Example', relationship: 'report', bloom: { FY27: 1001 } },
  ],
})
const alex = roster.people[1]

const appraisal: Appraisal = {
  fy: 'FY27', performanceId: 1001, title: 'Performance Appraisal FY27 - Alex Example',
  employee: 'Alex Example', progressStatus: 'In Progress', period: { start: '2026-07-01', end: '2027-06-30' },
  sections: [
    { key: 'goals', sectionId: 11, type: 'question', title: 'Individual Goals & Objectives', status: 'In Progress', extra: [],
      items: [{ id: 101, title: 'Enter goals', description: null, label: null, actions: [], notes: ['Good progress'],
        responses: [{ author: 'Alex Example', reviewer: null, value: 'Ship theming' }] }] },
    { key: 'career', sectionId: 12, type: 'question', title: 'Career', status: null, extra: [],
      items: [{ id: 201, title: 'Strengths', description: null, label: null, actions: [], notes: [], responses: [] }] },
    { key: 'idp', sectionId: 13, type: 'development', title: 'IDP', status: null, extra: [],
      items: [{ id: 301, title: 'System design', description: 'Lead a review', label: 'Technical', actions: ['Run a guild session'], notes: [], responses: [] }] },
  ],
}

test('renderRoster lists reports before team', () => {
  const out = renderRoster(roster)
  assert.ok(out.indexOf('Alex Example') < out.indexOf('Sam Sample'))
  assert.match(out, /Reports/)
  assert.match(out, /Team/)
  assert.match(out, /FY27/)
})

test('renderAppraisal shows header, responses, IDP actions, notes', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal })
  assert.match(out, /^## Alex Example — FY27 appraisal/m)
  assert.match(out, /In Progress/)
  assert.match(out, /Ship theming/)
  assert.match(out, /Run a guild session/)
  assert.match(out, /Technical/)
  assert.match(out, /Good progress/)
})

test('renderAppraisal marks empty items as not filled in', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal })
  assert.match(out, /Strengths[\s\S]*_not filled in_/)
})

test('renderAppraisal notesOnly prints only items that have notes', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal }, { notesOnly: true })
  assert.match(out, /Good progress/)
  assert.doesNotMatch(out, /System design/)
})

test('renderAppraisal non-ok shows status and hint', () => {
  const out = renderAppraisal(alex, { status: 'auth_expired', hint: "interactive: run '! nerv people login'" })
  assert.match(out, /auth_expired/)
  assert.match(out, /nerv people login/)
})
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './render.js'`)

Run: `npx tsx --test lib/people/render.test.ts`

- [ ] **Step 3: Implement** — `lib/people/render.ts`

```ts
import type { Person, Roster } from './roster.js'
import type { Appraisal, AppraisalItem, SourceResult } from './bloom.js'

function personLine(p: Person): string {
  const bits = [
    p.github ? `gh:${p.github}` : null,
    p.jira ? `jira:${p.jira}` : null,
    Object.keys(p.bloom).length ? `bloom:${Object.keys(p.bloom).join(',')}` : null,
  ].filter(Boolean)
  return `- **${p.name}** (\`${p.id}\`)${bits.length ? ' — ' + bits.join(' · ') : ''}`
}

export function renderRoster(roster: Roster): string {
  const reports = roster.people.filter(p => p.relationship === 'report')
  const team = roster.people.filter(p => p.relationship === 'team')
  const out = ['## Reports', ...(reports.length ? reports.map(personLine) : ['_none_'])]
  if (team.length) out.push('', '## Team', ...team.map(personLine))
  return out.join('\n')
}

function renderItem(item: AppraisalItem): string[] {
  const out = [`**${item.title}**${item.label ? ` _[${item.label}]_` : ''}`]
  if (item.description) out.push(item.description)
  if (item.responses.length === 0 && item.actions.length === 0) out.push('_not filled in_')
  for (const r of item.responses) out.push(`> ${r.value.replace(/\n/g, '\n> ')}${r.author ? `\n> — ${r.author}` : ''}`)
  for (const a of item.actions) out.push(`- ${a}`)
  if (item.notes.length) out.push('', '_Notes:_', ...item.notes.map(n => `- ${n}`))
  return [...out, '']
}

export function renderAppraisal(person: Person, result: SourceResult<Appraisal>, opts: { notesOnly?: boolean } = {}): string {
  if (result.status !== 'ok' || !result.data) {
    return [`## ${person.name} — appraisal`, '', `Bloom: **${result.status}**`, result.hint ? `→ ${result.hint}` : ''].join('\n').trimEnd()
  }
  const a = result.data
  const out = [
    `## ${person.name} — ${a.fy} appraisal`,
    `${a.progressStatus ?? 'status unknown'} · ${a.period.start ?? '?'} → ${a.period.end ?? '?'}`,
    '',
  ]
  for (const s of a.sections) {
    const items = opts.notesOnly ? s.items.filter(i => i.notes.length) : s.items
    if (opts.notesOnly && items.length === 0) continue
    out.push(`### ${s.title}${s.status ? ` (${s.status})` : ''}`, '')
    if (items.length === 0 && s.extra.length === 0) out.push('_empty_', '')
    for (const item of items) out.push(...renderItem(item))
    for (const e of s.extra) out.push(`- ${e}`)
  }
  if (opts.notesOnly && out.length === 3) out.push('_no notes_')
  return out.join('\n').trimEnd()
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx tsx --test lib/people/render.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/people/render.ts lib/people/render.test.ts
git commit -m "Add people roster and appraisal renderer"
```

---

### Task 5: CLI (`main`, `commands/people.ts`, `bin/nerv`)

**Files:**
- Create: `lib/people/cli.ts`, `commands/people.ts`
- Modify: `bin/nerv` (usage block + case)
- Test: `lib/people/cli.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces:
  - `interface CliIO { stdout: (s: string) => void; stderr: (s: string) => void; env: NodeJS.ProcessEnv; isTTY: boolean; fetchImpl?: FetchLike; exec?: Exec; readSecret?: (prompt: string) => Promise<string>; now?: Date }`
  - `main(argv: string[], io: CliIO): Promise<number>` — returns exit code
  - JSON shapes (stdout with `--json`):
    - `ls`: `{ schemaVersion: 1, people: Person[] }`
    - `resolve` ok: `{ schemaVersion: 1, person: Person }`; fail: `{ schemaVersion: 1, error: 'ambiguous' | 'unknown', query: string, candidates: { id: string; name: string }[] }`
    - `appraisal`: `{ schemaVersion: 1, person: { id, name, relationship }, fy: string, sources: { bloom: SourceResult<Appraisal> } }`
    - roster error: `{ schemaVersion: 1, error: 'roster', message: string }`

`--section` values: `goals | career | idp | final | recognition | notes`. `notes` fetches the full appraisal and renders notes only (JSON is the full appraisal).

- [ ] **Step 1: Write failing tests** — `lib/people/cli.test.ts`

```ts
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
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './cli.js'`)

Run: `npx tsx --test lib/people/cli.test.ts`

- [ ] **Step 3: Implement** — `lib/people/cli.ts`

```ts
import { loadRoster, resolvePerson, RosterError, type Roster, type Person } from './roster.js'
import { currentFy, parseFy } from './fy.js'
import { readSession, saveSession, type Exec } from './credentials.js'
import { fetchAppraisal, type FetchLike, type SectionKey } from './bloom.js'
import { renderRoster, renderAppraisal } from './render.js'

export interface CliIO {
  stdout: (s: string) => void
  stderr: (s: string) => void
  env: NodeJS.ProcessEnv
  isTTY: boolean
  fetchImpl?: FetchLike
  exec?: Exec
  readSecret?: (prompt: string) => Promise<string>
  now?: Date
}

const SECTIONS = ['goals', 'career', 'idp', 'final', 'recognition', 'notes'] as const

const HELP: Record<string, string> = {
  main: `nerv people — your reports and team, from one roster

Usage: nerv people <verb> [<who>] [flags]

Verbs:
  ls                      List the roster (default). No network.
  resolve <who>           Match a name/alias to one person. No network.
  appraisal <who>         Bloom appraisal for the current FY.
  login                   Save your Bloom PHPSESSID to Keychain (interactive).

Flags:
  --json                  Machine-readable output on stdout (schemaVersion 1).
  -h, --help              Help for a verb: nerv people appraisal --help

Exit codes: 0 ok (check sources for partial) · 1 usage · 2 person not resolved · 3 roster missing/invalid
Roster: config/people.local.json (see config/people.example.json)`,
  ls: `nerv people ls [--json]
  List reports then team. Example: nerv people ls --json`,
  resolve: `nerv people resolve <who> [--json]
  Exit 2 with candidates when ambiguous/unknown. Example: nerv people resolve al --json`,
  appraisal: `nerv people appraisal <who> [--section ${SECTIONS.join('|')}] [--fy FY27] [--json]
  Read-only. Default FY is the current Australian FY.
  Example: nerv people appraisal alex --section idp --json`,
  login: `nerv people login
  Interactive: prompts for PHPSESSID (hidden) and stores it in Keychain (service nerv-bloom).
  Get it from Chrome DevTools → Application → Cookies → PHPSESSID.
  BLOOM_SESSION env var overrides Keychain when set.`,
}

const LOGIN_INTERACTIVE = "interactive: ask the user to run '! nerv people login' in their terminal."

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | true> } | string {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--json' || a === '--help' || a === '-h') flags[a === '-h' ? '--help' : a] = true
    else if (a === '--section' || a === '--fy') {
      const v = args[++i]
      if (v === undefined || v.startsWith('--')) return `${a} needs a value`
      flags[a] = v
    } else if (a.startsWith('-')) return `unknown flag ${a}`
    else positional.push(a)
  }
  return { positional, flags }
}

export async function main(argv: string[], io: CliIO): Promise<number> {
  const [first, ...rest] = argv
  const verb = !first || first.startsWith('-') ? (first === '--help' || first === '-h' ? 'help' : 'ls') : first
  const parsed = parseFlags(verb === 'ls' && first?.startsWith('-') ? argv : rest)
  if (typeof parsed === 'string') { io.stderr(`${parsed}\n\n${HELP.main}`); return 1 }
  const { positional, flags } = parsed
  const json = flags['--json'] === true

  if (verb === 'help') { io.stdout(HELP.main); return 0 }
  if (!['ls', 'resolve', 'appraisal', 'login'].includes(verb)) { io.stderr(`Unknown verb "${verb}".\n\n${HELP.main}`); return 1 }
  if (flags['--help']) { io.stdout(HELP[verb]); return 0 }

  if (verb === 'login') {
    if (!io.isTTY || !io.readSecret) { io.stderr(`login needs an interactive terminal. ${LOGIN_INTERACTIVE}`); return 1 }
    const value = await io.readSecret('Paste PHPSESSID (input hidden): ')
    try {
      saveSession(value, io.exec)
    } catch (e) {
      io.stderr((e as Error).message); return 1
    }
    io.stdout('Saved Bloom session to Keychain (service nerv-bloom).')
    return 0
  }

  let roster: Roster
  try {
    roster = await loadRoster(io.env.NERV_PEOPLE_CONFIG ?? undefined)
  } catch (e) {
    if (!(e instanceof RosterError)) throw e
    if (json) io.stdout(JSON.stringify({ schemaVersion: 1, error: 'roster', message: e.message }))
    io.stderr(e.message)
    return 3
  }

  if (verb === 'ls') {
    io.stdout(json ? JSON.stringify({ schemaVersion: 1, people: roster.people }) : renderRoster(roster))
    return 0
  }

  const query = positional[0]
  if (!query) { io.stderr(`Missing <who>.\n\n${HELP[verb]}`); return 1 }

  let section: (typeof SECTIONS)[number] | undefined
  if (typeof flags['--section'] === 'string') {
    if (!(SECTIONS as readonly string[]).includes(flags['--section'])) {
      io.stderr(`--section must be one of: ${SECTIONS.join(', ')}`); return 1
    }
    section = flags['--section'] as (typeof SECTIONS)[number]
  }
  let fy = currentFy(io.now)
  if (typeof flags['--fy'] === 'string') {
    const p = parseFy(flags['--fy'])
    if (!p) { io.stderr('--fy must look like FY27'); return 1 }
    fy = p
  }

  const res = resolvePerson(roster, query)
  if (res.kind !== 'found') {
    const candidates = res.candidates.map(p => ({ id: p.id, name: p.name }))
    if (json) io.stdout(JSON.stringify({ schemaVersion: 1, error: res.kind, query, candidates }))
    io.stderr(`${res.kind === 'ambiguous' ? 'Ambiguous' : 'Unknown'} person "${query}". Candidates: ${candidates.map(c => `${c.id} (${c.name})`).join(', ')}`)
    return 2
  }
  const person: Person = res.person

  if (verb === 'resolve') {
    io.stdout(json ? JSON.stringify({ schemaVersion: 1, person }) : `${person.id}\t${person.name}`)
    return 0
  }

  // appraisal
  const only = section && section !== 'notes' ? (section as SectionKey) : undefined
  const bloom = await fetchAppraisal(person, {
    baseUrl: roster.bloom?.baseUrl ?? null,
    session: readSession(io.env, io.exec),
    fy,
    only,
    fetchImpl: io.fetchImpl,
  })
  if (json) {
    io.stdout(JSON.stringify({
      schemaVersion: 1,
      person: { id: person.id, name: person.name, relationship: person.relationship },
      fy,
      sources: { bloom },
    }))
  } else {
    io.stdout(renderAppraisal(person, bloom, { notesOnly: section === 'notes' }))
  }
  return 0
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx tsx --test lib/people/cli.test.ts`

- [ ] **Step 5: Implement process wrapper** — `commands/people.ts`

```ts
#!/usr/bin/env npx tsx
import { main } from '../lib/people/cli.js'

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process
    stderr.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf-8')
    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData)
          stderr.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') { stdin.setRawMode(false); return reject(new Error('cancelled')) }
        if (ch === '\u007f') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

const code = await main(process.argv.slice(2), {
  stdout: s => process.stdout.write(s + '\n'),
  stderr: s => process.stderr.write(s + '\n'),
  env: process.env,
  isTTY: Boolean(process.stdin.isTTY),
  readSecret,
})
process.exit(code)
```

- [ ] **Step 6: Wire `bin/nerv`**

In the usage heredoc, add after the `check` line:

```
  people [ls|resolve|appraisal|login]
                                  Reports & team from one roster; Bloom appraisals
```

In the `case`, add after `check)`:

```bash
  people)   exec npx tsx commands/people.ts "$@" ;;
```

- [ ] **Step 7: Smoke test the real wrapper**

```bash
NERV_PEOPLE_CONFIG=config/people.example.json ./bin/nerv people ls --json | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8")); console.log("json ok")'
NERV_PEOPLE_CONFIG=config/people.example.json ./bin/nerv people --help
./bin/nerv people login </dev/null; echo "exit=$?"
```

Expected: `json ok`; help text listing `ls resolve appraisal login`; login prints the `interactive:` hint and `exit=1` without hanging.

- [ ] **Step 8: Run full suite — expect PASS**

Run: `npm test`

- [ ] **Step 9: Commit**

```bash
git add lib/people/cli.ts lib/people/cli.test.ts commands/people.ts bin/nerv
git commit -m "Add nerv people CLI: ls, resolve, appraisal, login"
```

---

### Task 6: `/people` skill, local roster, live acceptance

**Files:**
- Create: `skills/people/SKILL.md`
- Create (local, gitignored, never committed): `config/people.local.json`
- Symlink: `~/.claude/skills/people` → this worktree's `skills/people` (re-point to `~/projects/nerv/skills/people` after merge)

**Interfaces:**
- Consumes: `nerv people resolve|appraisal --json` (Task 5); existing `~/Projects/nerv/.claude/skills/dev-radar.md` procedure; Atlassian MCP.

- [ ] **Step 1: Write the skill** — `skills/people/SKILL.md`

````markdown
---
name: people
description: Bring up a profile of one of Eugene's reports or team members — Bloom appraisal (goals, career, IDP, final review), recent GitHub delivery signals, and open Jira work — as a 1:1-ready brief. Triggers on "/people <name>", "bring up <name>'s profile", "profile for <name>", "how is <name> tracking", "<name>'s goals/IDP".
---

# People profile

The roster and Bloom access live in the `nerv people` CLI. This skill holds **no roster and no command list** — learn the grammar from the CLI.

## Steps

1. **Learn the CLI** (once per session): `nerv people --help`.
2. **Resolve the person:** `nerv people resolve "<query>" --json`.
   - Exit 2 → show the candidates and ask which one. Never guess.
   - Exit 3 → the roster is missing/invalid; relay the message and stop.
3. **Gather in parallel:**
   - **Appraisal:** `nerv people appraisal <id> --json` (add `--section <s>` if the user asked about one area only).
   - **GitHub** (only if `person.github` is set): follow the *Data collection* and *Sections to render* steps of `~/Projects/nerv/.claude/skills/dev-radar.md` for that login, default 14d. Skip the dev-radar roster — use `person.github`.
   - **Jira** (only if `person.jira` is set): load `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` via ToolSearch, cloudId `c44f2b4b-ca23-46e4-883b-3f7f5e2de9fd`, JQL `assignee = "<person.jira>" AND resolution = Unresolved ORDER BY updated DESC`, fields `["summary","status","priority","updated","issuetype"]`, maxResults 15.
4. **Write the profile** (shape below).
5. **Source status:** for every source that was not `ok` or was skipped, say so in one line with its `hint`. If a hint starts with `interactive:`, tell the user to run the quoted command (e.g. `! nerv people login`) and continue with the remaining sources.

## Profile shape

```
## <Name> — profile (<today>)

**Appraisal (<FY>, <progressStatus>)**
- Goals: <1–3 line summary of their stated goals, or "not filled in">
- Career: aspirations / strengths / development areas — one line each
- IDP: <each item title → actions>
- Final review: <status or "not started">

**Delivery (last 14d)** — <dev-radar headline metrics + traffic lights>

**Current work** — <Jira in-progress / unresolved, top 5>

**Threads to pull in a 1:1**
- <connect appraisal goals/IDP to what the delivery and Jira data show — e.g. an IDP item with no matching work, a goal visibly progressing>

_Sources: bloom ✓ · github ✓ · jira ✓_  (✗ + hint for any that failed)
```

Quote appraisal text sparingly — summarise. Don't invent ratings or judgements the data doesn't support.

## Privacy

Appraisal content stays in this terminal conversation. Do not put it into Artifacts, Glean, Slack drafts, Confluence, Jira, or NERV/auto memory unless the user explicitly asks in that turn. Never print or log the Bloom session cookie.
````

- [ ] **Step 2: Create the local roster** (gitignored — confirm with `git check-ignore config/people.local.json` before writing)

Ask the user for each report's Jira display name if unsure; otherwise use full names. Fill from the session's known values: reports Ralph, Hai, Ola, Jayz (FY27 IDs from the PRD) and Glev (no FY27 ID); team Kundan (`github: null`), Rema (`github` inferred — confirm with user), Nathan. GitHub logins from `team-stats.md`. `bloom.baseUrl` from the PRD.

```bash
git check-ignore config/people.local.json   # must print the path
```

- [ ] **Step 3: Link the skill**

```bash
ln -sfn "$PWD/skills/people" ~/.claude/skills/people
```

- [ ] **Step 4: Live login** — hand to the user:

> Run `! nerv people login` and paste a fresh PHPSESSID from Chrome DevTools → Application → Cookies → elmotms host.

(Use `./bin/nerv` from the worktree if `nerv` on PATH resolves to the main checkout.)

- [ ] **Step 5: Shape check against live Bloom (keys only, no values)**

```bash
S=$(security find-generic-password -s nerv-bloom -a "$USER" -w)
B=$(node -e 'console.log(require("./config/people.local.json").bloom.baseUrl)')
ID=<one report's FY27 id>
for p in "" /sections; do curl -s -H "Cookie: PHPSESSID=$S" -H 'Accept: application/json' "$B/performances/$ID$p" | jq -c '[paths | map(if type=="number" then "[]" else . end) | join(".")] | unique'; done
unset S
```

Compare key paths with `lib/people/fixtures/bloom.ts`. If they differ (e.g. an envelope other than `data`, `progressStatus` nested differently), update the fixture to the real **shape** (fictional values), update the mapper in `bloom.ts`, re-run `npm test`.

- [ ] **Step 6: Acceptance**

```bash
./bin/nerv people appraisal <report-id>
./bin/nerv people appraisal <report-without-fy-id> --json | jq .sources.bloom.status   # "not_applicable"
```

Ask the user to compare the first output with the Bloom browser view for that report. Then ask Claude (in a fresh session): "bring up <report>'s profile" — confirm `/people` triggers and all three sources report.

- [ ] **Step 7: Commit** (skill only — never the local roster)

```bash
git status --short   # config/people.local.json must NOT appear
git add skills/people/SKILL.md
git commit -m "Add /people profile skill"
```
