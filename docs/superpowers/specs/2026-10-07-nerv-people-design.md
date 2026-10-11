# `nerv people` — Design

**Date:** 2026-10-07
**Status:** Draft — awaiting review
**Branch:** `feat/nerv-people` (from `main`; `feat/decision-accuracy` also touches `bin/nerv` — expect a one-line merge)

## 1. Problem

People-management context is scattered and duplicated:

- Five skills each carry their own team roster (`team-stats`, `team-goals`, `goal-alerts`, `dev-radar`, and the vault `inbox` skill's `graph-model.md`). They have already drifted — different members in each.
- Two entry points both claim "1:1 prep for X" (`/dev-radar`, `/inbox team`).
- Performance appraisal data (Bloom TMS) is only reachable by hand in the browser. The proposed workaround — Claude running ~40 `curl` calls with a pasted session cookie — is slow, non-deterministic, and token-heavy.

## 2. Goals

1. **One owner per fact.** Roster identity lives in exactly one file. Every consumer asks NERV at runtime; none copies.
2. **Independent sources.** A failing source (expired Bloom session, `gh` unauthenticated) degrades its section only, never the whole result.
3. **Usable by Claude first.** Predictable grammar, self-describing help, clean JSON on stdout, actionable hints, never blocks on input.
4. **Private by default.** Appraisal content and the session cookie never reach git, disk caches, trace logs, or shared surfaces.

### Non-goals

- Writing to Bloom (strictly read-only — GET endpoints only).
- Jira or vault access from the CLI (stays skill-side via the Atlassian MCP and file reads).
- Caching. Revisit only if latency becomes a real problem.

## 3. Architecture

```
config/people.local.json  (identity only, gitignored)
          │
          ▼
  nerv people <verb> <who> ──► adapters/bloom   ─┐
                            ──► adapters/github ─┼─► Profile { person, sources{status,data,hint} }
                                                 │
  /people skill ── consumes --json ──► + Jira (MCP) + vault Team Status ──► 1:1 brief
```

### Principles

1. **Consumers ask, never copy.** Skills resolve people with `nerv people ls --json` / `nerv people resolve <q> --json`. Skills contain zero roster data. If `nerv` is unavailable, the skill fails loudly; it never falls back to an inline list.
2. **Store what changes slower than you'd update it; fetch what changes faster.**

   | Fact | Changes | Decision |
   |---|---|---|
   | GitHub login, Jira display name | ~never | store |
   | Bloom performance ID | yearly | store, keyed by FY |
   | Appraisal content, PR metrics, tickets | constantly | fetch live |

   Deriving Bloom IDs from an undocumented "list my team's performances" endpoint was considered and rejected — it adds a runtime call and a dependency on an unconfirmed API to save editing a handful of numbers once a year.
3. **Adapters are isolated.** Each adapter takes a `Person` and returns a `SourceResult`. Adapters never call each other. The renderer never assumes success.
4. **The `--json` output is the only contract.** Consumers depend on its schema, never on adapter internals, the Bloom API, or `gh` output shapes. `schemaVersion` lets consumers detect breaking changes.

## 4. Data model

### Roster — `config/people.local.json` (gitignored)

```jsonc
{
  "schemaVersion": 1,
  "bloom": { "baseUrl": "https://<tenant>/cobra/api/tms/api/performance/v1" },
  "people": [
    {
      "id": "alex",                    // stable key used by all consumers
      "name": "Alex Example",
      "aliases": ["alex", "al"],
      "relationship": "report",        // report | team
      "squads": ["mobfe"],             // optional; used by team-* skills
      "github": "alexexample-org",     // or null
      "jira": "Alex Example",          // or null
      "bloom": { "FY27": 1234 }        // optional; reports only
    }
  ]
}
```

- `config/people.example.json` — committed, fictional people only, documents the shape.
- Validated on every load: unknown fields, duplicate `id`/alias, invalid `relationship`, non-integer Bloom IDs → error naming the field, exit 3.
- The Bloom base URL lives here, not in code, so no tenant host is committed.

### Source result

```ts
type SourceStatus = 'ok' | 'auth_expired' | 'unavailable' | 'not_applicable'

interface SourceResult<T> {
  status: SourceStatus
  data?: T
  hint?: string   // actionable next step; prefixed "interactive:" when the user must act
}
```

### Profile (`--json` output)

```jsonc
{
  "schemaVersion": 1,
  "person": { "id": "alex", "name": "Alex Example", "relationship": "report" },
  "sources": {
    "bloom":  { "status": "auth_expired", "hint": "interactive: ask user to run '! nerv people login'" },
    "github": { "status": "ok", "data": { /* radar metrics */ } }
  }
}
```

### Normalised appraisal

```ts
interface Appraisal {
  fy: string                     // "FY27"
  performanceId: number
  title: string
  progressStatus: string
  period: { start: string; end: string }
  goals: Item[]                  // question section: Individual Goals & Objectives
  career: Item[]                 // question section: aspirations / strengths / development areas
  idp: DevelopmentItem[]         // development section
  final: SummarySection | null   // summary section
  recognition: unknown | null    // recommendation section
  notes: Record<string, Note[]>  // keyed by itemId; fetched only when --section notes or show
}
```

Section → endpoint mapping (by `type` from `GET /performances/{id}/sections`):

| type | endpoint |
|---|---|
| `question` | `/performances/{id}/question-sections/{sectionId}` |
| `development` | `/performances/{id}/development-sections/{sectionId}` |
| `summary` | `/performances/{id}/summary-sections/{sectionId}` |
| `recommendation` | `/performances/{id}/recommendation-sections/{sectionId}` |
| notes | `/performances/{id}/sections/{sectionId}/items/{itemId}/notes` |

Question sections are distinguished by title (goals vs career). Unknown section types are passed through under `other` rather than dropped.

## 5. Command surface

Grammar is always `nerv people <verb> [<who>] [flags]`. Verbs are reserved words; names never occupy the verb slot.

```
nerv people                                   = ls
nerv people ls [--squad <s>] [--json]         identity only, no network
nerv people resolve <query> [--json]          alias → one person
nerv people show <who> [--json]               appraisal + radar
nerv people appraisal <who>|--all [--section goals|career|idp|final|notes] [--fy FY27] [--json]
nerv people radar <who>|--all [--period 7d|14d|30d] [--json]
nerv people set <who> <field> <value>         e.g. bloom.FY28 6123 | github <login> | squads mobfe,platform
nerv people doctor [--json]                   roster, keychain, Bloom reachability, gh auth, missing FY IDs
nerv people login                             interactive: hidden prompt → Keychain
nerv people logout                            remove Keychain entry
```

### Claude-usability rules

- `nerv people --help` and `nerv people <verb> --help` show grammar, flags, one example. The help text is the single source for the command surface — skills point at it instead of copying it.
- With `--json`: stdout is JSON only; all diagnostics go to stderr.
- `--section`, `--period`, and separate `appraisal`/`radar` verbs keep output small.
- Every non-`ok` source carries a `hint`. `interactive:` prefix means Claude must hand the step to the user.
- `resolve` failure returns candidates (exit 2) so the caller can disambiguate.
- Only `login` reads stdin. Without a TTY it exits 1 immediately with the interactive hint.
- Default FY: the current Australian financial year (1 Jul–30 Jun). `--fy` overrides.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | ok (including partial — check `sources`) |
| 1 | usage error / non-TTY `login` |
| 2 | person not resolved (candidates on stderr / in JSON) |
| 3 | roster missing or invalid |

## 6. Components

| File | Responsibility |
|---|---|
| `lib/people/roster.ts` | load, validate, resolve, `set` (validated write) |
| `lib/people/credentials.ts` | Keychain via `security` (service `nerv-bloom`); `BLOOM_SESSION` env override |
| `lib/people/fy.ts` | current AU FY, FY label parsing |
| `lib/people/adapters/bloom.ts` | Bloom API → `Appraisal`; session-expiry detection |
| `lib/people/adapters/github.ts` | `gh` → radar metrics (port of `dev-radar` formulas) |
| `lib/people/profile.ts` | run adapters via `Promise.allSettled`, assemble `Profile` |
| `lib/people/render.ts` | `Profile` / `Appraisal` → terminal markdown |
| `commands/people.ts` | argv parsing + dispatch only |
| `bin/nerv` | add `people)` case + usage line |

No new runtime dependencies (Node `fetch`, `child_process`, `node:test`).

### Bloom adapter details

- Request: `Cookie: PHPSESSID=<value>`, `Accept: application/json`, `redirect: 'manual'`.
- Session expiry detected by any of: 401, 403, 3xx, or a non-JSON `content-type` on a 2xx. → `auth_expired`.
- No FY ID for the person → `not_applicable`, hint `run 'nerv people set <id> bloom.<FY> <performanceId>'`.
- Network error / 5xx → `unavailable`.
- Section detail requests run in parallel per person; notes fetched only when requested.

### Credentials

- `login`: hidden TTY prompt → `security add-generic-password -U -s nerv-bloom -a $USER -w <value>`. The value is passed via argv to `security` only; never echoed, never written to a file.
- Lookup order: `BLOOM_SESSION` env → Keychain → `auth_expired`.
- `doctor` reports `present | absent` only.

## 7. Privacy

- Only two places persist anything: `config/people.local.json` (identity) and the Keychain entry (cookie).
- No `lib/trace` call includes names, IDs, or appraisal content — at most `people.<verb>` and latency.
- Error messages never include the cookie or response bodies.
- `.gitignore` gains `config/people.local.json`.
- The `/people` skill keeps appraisal content in the terminal: never into Artifacts, Glean, Slack drafts, or NERV memory unless the user explicitly asks in that turn.

## 8. `/people` skill

`nerv/skills/people/SKILL.md`, symlinked into `~/.claude/skills/people` (same as `sitrep`).

Behaviour:

1. `nerv people --help` (learn grammar), `nerv people resolve <q> --json`.
2. `nerv people show <id> --json`.
3. Add Jira (Atlassian MCP, by `jira` name: unresolved assigned tickets) and the vault Team Status entry.
4. Synthesise the 1:1 brief using `references/conversation-guide.md` (moved from `dev-radar`; its only home).
5. List every non-`ok` source with its `hint`; never silently omit a section.

The skill contains no roster, no command list, no API details.

## 9. Consumer migration (phase 3)

| Consumer | Change |
|---|---|
| `team-stats`, `team-goals`, `goal-alerts` | Delete inline `MOBFE_MEMBERS`; use `nerv people ls --squad mobfe --json`; stop with the error on failure |
| `dev-radar` | Becomes a redirect to `/people <name>` |
| vault `inbox` (`graph-model.md`, team mode) | Roster table → "resolve via `nerv people ls --json`"; team mode delegates to `/people` |
| NERV `CLAUDE.md` | Fix stale `elmo-application` → `elmo-frontend` paths |

These skills are local (gitignored `nerv/.claude/skills/` and the vault), so migration touches no other repo.

## 10. Testing

`node:test` via `npx tsx --test`, following existing `lib/*.test.ts`. Fixtures use fictional names.

| Test file | Covers |
|---|---|
| `lib/people/roster.test.ts` | each validation error; resolve exact / case-insensitive / ambiguous / unknown; `set` round-trip and rejection |
| `lib/people/fy.test.ts` | FY boundaries (30 Jun / 1 Jul) |
| `lib/people/adapters/bloom.test.ts` | section-type mapping from fixtures; expiry detection (401, 403, 302, HTML 200); missing FY → `not_applicable`; 5xx → `unavailable` |
| `lib/people/adapters/github.test.ts` | radar metrics against fixed PR data, matching `dev-radar` formulas |
| `lib/people/profile.test.ts` | one adapter throws → others still return; statuses populated |
| `lib/people/cli.test.ts` | exit codes 0/1/2/3; `--json` stdout parses as JSON only; non-TTY `login` exits fast with hint; `--help` lists every verb |
| `lib/people/privacy.test.ts` | cookie value and fixture names never appear in trace output or rendered errors |

`package.json` `test` script extends to `lib/**/*.test.ts`.

**Manual acceptance (phase 1):** `nerv people appraisal <report>` against live Bloom matches the browser view.

## 11. Scope — v1 (YAGNI)

The driving use case: "Claude, bring up <report>'s profile." v1 builds only what that needs.

**In v1:**

- `config/people.local.json` + `config/people.example.json` + validation
- `nerv people` / `ls`, `resolve`, `appraisal <who> [--section] [--fy] [--json]`, `login`
- Bloom adapter, credentials (Keychain + env override), FY helper, renderer
- `/people` skill: resolve → `appraisal --json` → GitHub signals via the existing `/dev-radar` procedure → Jira via MCP → profile brief, with per-source status
- Tests: roster, fy, bloom adapter, cli, privacy

**Deferred until a concrete need appears** (design above still applies):

- `set`, `logout`, `doctor`, `show`, `radar`, `--all`, `--squad`
- Porting radar maths into a TS GitHub adapter
- Migrating `team-stats` / `team-goals` / `goal-alerts` / `dev-radar` / `inbox` off inline rosters

Until `set` exists, the roster is edited by hand; validation on load keeps that safe.

## 12. Open items

- One team member has no GitHub login found in the org; another's login is inferred and unconfirmed. Resolve via `nerv people set` once confirmed.
- One report has no current-FY appraisal; expected to render as `not_applicable`.
