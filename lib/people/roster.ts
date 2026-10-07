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
  // Every query word must prefix-match one of the person's id, aliases, or name words.
  const words = q.split(/\s+/).filter(Boolean)
  const partial = words.length
    ? roster.people.filter(p => {
        const tokens = [p.id, ...p.aliases, ...p.name.split(/\s+/)].map(t => t.toLowerCase())
        return words.every(w => tokens.some(t => t.startsWith(w)))
      })
    : []
  if (partial.length === 1) return { kind: 'found', person: partial[0] }
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial }
  return { kind: 'unknown', candidates: roster.people }
}
