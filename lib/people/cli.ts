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

const VERBS = ['ls', 'resolve', 'appraisal', 'login']
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
  if (!VERBS.includes(verb)) { io.stderr(`Unknown verb "${verb}".\n\n${HELP.main}`); return 1 }
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
