---
title: Memory Categories — Design
status: approved
owner: eugene.lai
date: 2026-04-25
extends: PLAN.md (frontmatter spec, indexer, triage)
related: docs/superpowers/specs/2026-04-25-deployment-and-observability-design.md
---

# Memory Categories

Adds a `category` field to memory cards as a top-level classification axis, extends the indexer with linting discipline across all canonical-valued frontmatter fields, and adds a `--category` filter to triage. No surfacing-logic changes (lazy retrieval via UserPromptSubmit unchanged).

## Why

Existing `type: knowledge | work` collapses two ideas: lifecycle (does it expire?) and content role (what is it?). The new `category` separates **role**:

- **decision** — why we chose X over Y. ADRs, one-way doors.
- **architecture** — where things live, how they fit. Module boundaries, data flow, deployment topology.
- **initiative** — what's being worked on now. Tickets, in-flight work; usually `type: work` with `expires`.
- **convention** — the rule for how to do X. Code style, naming, datetime handling, test patterns.

Categories are **roles**, not sources. A meeting that produced a decision is a `decision` card whose body draws from the meeting; the category is not "meeting-notes". This framing prevents drift.

`type` (knowledge | work) stays as the lifecycle axis. The two are orthogonal but correlated — initiatives are usually `type: work`, the others are usually `type: knowledge`. Auto-derivation of `type` from `category` is deferred to a future scope-(B) round.

## Decisions locked

| Knob | Decision |
|---|---|
| Field name | `category` |
| Canonical values (v1) | `decision`, `architecture`, `initiative`, `convention` |
| Presence | **Optional** — cards without `category` index as "uncategorized" and behave normally; they just don't match `--category` filters. |
| Value | **Strict** — indexer rejects non-canonical values. |
| Canonical list home | `config.local.yaml` under `memory.category.canonical`, falling back to `config/config.example.yaml`. Adding a 5th category is a deliberate config edit + re-index, not a code change. |
| Lint scope | Extends to **all canonical-valued fields**: `scope`, `confidence`, `type`, `category`. One linting pass, four fields. |
| Surfacing default | Unchanged — `ai-kernel-suggest` does not pass `--category` by default. The filter is for explicit narrowing only. |
| Migration | **Backfill the 13 pilot cards** as part of the implementation. Not opportunistic. |

## Indexer changes

1. New input: `memory.category.canonical: [...]` from config.
2. Per-card linting at the point each card is parsed:
   - `scope` ∈ canonical scopes (`global`, `repo`, `personal`) — already implied; now enforced.
   - `confidence` ∈ canonical confidences (`extracted`, `inferred`, `ambiguous`) — already implied; now enforced.
   - `type` ∈ canonical types (`knowledge`, `work`) — already implied; now enforced.
   - `category` ∈ `memory.category.canonical` if present.
   - **Missing** values default per existing rules (`type: knowledge`, `confidence: extracted`); `category` defaults to absent (uncategorized).
   - **Bad** values cause that card to be **skipped** (with an error line printed: `[reject] <path>: category="meting" not in canonical`). The whole run continues.
3. New per-card output field: `category` (string, may be `""` for uncategorized).
4. New top-level inverted map: `by_category: { decision: [id, …], architecture: [...], ... }`.
5. End-of-run summary line gains: `· N rejected` (alongside indexed/tags/terms).

## Triage changes

Adds `--category a,b,c` flag, mirror of `--scope`:

```bash
ai-kernel-triage --scope global,repo --category decision,architecture
```

When set, filters `surface_cards` to those whose `.category` is in the allow-list. Uncategorized cards are excluded by an active `--category` filter (you opted into category narrowing, so we honor it). Without the flag, no filtering.

## Suggest changes

None. The hook continues to pass `--scope global,repo --repo <name>` only. Category narrowing is for explicit invocation (slash command, future routing logic).

## Backfill (one-time)

Add `category:` to the 13 pilot cards already in `memory/`:

- All `memory/global/*.md` and `memory/repos/*/conventions/*.md` → `category: convention`
- Architecture-style cards (module-federation tracker, etc.) → `category: architecture`
- Per-ticket WIP trackers (e.g., `ESL-3648/*.md`) → `category: initiative` (with appropriate `expires`)
- Genuine decisions (if any in the seed set) → `category: decision`

Authored as a single commit. The categorisation is a judgment call per card — review during implementation.

## Frontmatter spec delta

Add to `docs/frontmatter-spec.md` (will be formalised in Phase D):

```yaml
---
id: ...
title: ...
scope: repo | global | personal
type: knowledge | work
category: decision | architecture | initiative | convention   # optional, strict
confidence: extracted | inferred | ambiguous
tags: [...]
related: [...]
expires: 2026-05-05
---
```

## Out of scope (deferred to scope-(B) round)

- Lifecycle policies per category (decision = immortal, initiative = auto-flag on expiry, etc.).
- Auto-deriving `type` from `category`.
- Retrieval weighting by category (e.g., always prefer decisions for "why" queries).
- Per-category `expires` defaults.

## Test plan

- Unit-style: indexer rejects a fixture card with `category: notarealthing` (one card rejected, others still indexed).
- Unit-style: indexer rejects a fixture card with `confidence: foo`.
- Triage: `--category decision,architecture` against a fixture index returns only matching cards; uncategorized excluded.
- Triage: no `--category` flag → all cards, including uncategorized, eligible.
- End-to-end: re-index the real `memory/` after backfill; assert all 13 pilot cards have a non-empty `category`; assert `by_category` populated for all four canonical values.

## Success criteria

- All 13 existing pilot cards carry a canonical `category` after backfill.
- A typo'd `category` value fails the card and prints a clear error.
- A non-canonical `category` value can be promoted to canonical by a single `config.local.yaml` edit + re-index.
- `ai-kernel-triage --category decision` returns only decision-category cards.
- The lint extension catches typo'd `scope`, `confidence`, and `type` values too (incidental wins).

## Resolved during brainstorm

- **No `category: scratch`.** Personal scope already covers partial ideas / ideation. Adding a category would duplicate intent.
- **Decision cards are an append-only audit trail.** Decisions don't get edited; new decisions supersede old ones. Implies `decision`-category cards are immortal in the kernel and rely on `related`/`supersedes` links to track evolution. Lifecycle policy formalisation deferred to scope-(B).
- **Commands DO NOT auto-emit memory.** Memory writes are explicit, user-triggered ("remember this", "commit to memory"). Default command behavior produces output, takes actions — does not silently mutate the memory layer. Token-efficient + intent-driven. To be encoded in the commands substrate spec.

## Open questions (parked)

1. Should the indexer's `[reject]` lines also accumulate into `deviation-report.json` so the scanner sees them? (Cheap, but conflates two reports.)
2. **Versioning / supersession axis** — when an initiative or architecture card "advances" (v1 → v2), how does the kernel represent it? Three patterns to evaluate:
   (a) **Git history is enough** — the file's git log IS the version history; no schema change. Simplest.
   (b) **In-card history** — a `history: [...]` array appended on each material change. Inline, but bloats the card.
   (c) **Separate version cards** — each version is its own card linked via `supersedes:` / `superseded_by:`. Best when versions need to coexist as query targets.
   Likely lean (a) + (c) for high-value evolutions (architecture, decisions). To be specified alongside the **commands substrate** — the user's hint was that commands should *know* how to advance the current state of a plan/doctrine/initiative when the user says "v2 this", which means commands need a versioning protocol they trust.
3. When commands substrate ships, the explicit user trigger ("remember this" / "commit to memory") will need a defined entry-point — likely a single `/remember` command that infers category + scope from context, or accepts them as flags.
