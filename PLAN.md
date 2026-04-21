---
title: AI Kernel Memory Layer — MVP Plan
status: draft
owner: eugene.lai
last_updated: 2026-04-21
---

# AI Kernel Memory Layer — MVP Plan

## Goal

Build a durable, token-efficient, progressively-disclosed, cross-sectionally-navigable memory substrate for LLM agents, decoupled from any specific agent harness. The kernel is the OS; the agent (Claude / Qwen / Codex) is a swappable engine.

## Non-goals (v1)

- General-purpose request orchestrator across all LLM calls (seam only — see Triage §5).
- Graph database, Leiden clustering, hyperedges, embeddings (see §12 "Rejected from graphify").
- Migrating all 46+ Serena memories in one pass (pilot 3–5 cards, iterate).
- Rewriting / deleting the existing Go CLI (parked under `legacy/`; see §11).

## 1. Storage model — single repo, namespaced by scope

All memory lives inside the kernel repo under `memory/`, organised by scope directory. No per-app-repo `.ai/memory/`. No separate data repo.

| Path | Scope | Git status | Purpose |
|---|---|---|---|
| `memory/global/`   | `global`   | committed  | Cross-cutting personal context, doctrine, syncs across your machines |
| `memory/repos/<name>/` | `repo` | **gitignored** | Per-repo context. Namespace lives in git; contents stay local to avoid leaking internal work. |
| `memory/personal/` | `personal` | **gitignored** | Truly private notes |

Memory format is plain markdown + YAML frontmatter — OS-agnostic. Any agent can consume `memory/*.md` without the kernel. Cross-machine sync for committed content = `git pull`.

## 2. Frontmatter spec (canonical card format)

```yaml
---
id: datetime-convention           # stable slug, filename without .md
title: LocalDate & timezone rules
scope: repo | global | personal
type: knowledge | work            # work requires expires
confidence: extracted | inferred | ambiguous   # from graphify
tags: [convention, datetime]
related: [effective-dating, timezone-provider]
expires: 2026-05-05               # required if type: work
source: conventions/datetime      # optional; migration breadcrumb
---

One-line summary for card preview (first paragraph of body).

Full body in markdown. Agents load this only on drill-down.
```

**Confidence semantics:**
- `extracted` — authored by human OR copied verbatim from authoritative source (code, docs). High trust.
- `inferred` — agent-deduced from context. Medium trust. Expires sooner by default.
- `ambiguous` — flagged by scanner as conflicting with another card. Needs proposer action.

## 3. Index format (`$AI_KERNEL_HOME/index.json`)

Flat + inverted. Not a graph database.

```json
{
  "generated_at": "2026-04-21T...",
  "cards": {
    "datetime-convention": {
      "path": "<repo>/.ai/memory/conventions/datetime.md",
      "title": "...",
      "scope": "repo",
      "type": "knowledge",
      "confidence": "extracted",
      "tags": ["convention", "datetime"],
      "related": ["effective-dating"],
      "hash": "sha256-of-frontmatter-stripped-body",
      "mtime": "...",
      "expires": null
    }
  },
  "by_tag":   { "convention": ["datetime-convention", ...] },
  "by_term":  { "localdate": ["datetime-convention", ...] },
  "by_scope": { "repo": [...], "global": [...] }
}
```

Relationships expressed via `related:` in frontmatter. Not stored as a separate graph. If graph queries emerge, derive on demand.

## 4. Config (`$AI_KERNEL_ROOT/config.local.yaml`, falling back to `config/config.example.yaml`)

All paths resolve against `AI_KERNEL_ROOT` (the repo) unless absolute. No `AI_KERNEL_HOME` env var.

```yaml
memory:
  roots:
    - { path: memory/global,   scope: global }
    - { path: memory/repos,    scope: repo }      # nested: memory/repos/<name>/...
    - { path: memory/personal, scope: personal }
  shadow_sources:                    # read for deviation, not canonical
    - $HOME/.serena/memories
    - $HOME/Projects/elmo-application/.serena/memories
  index_path:   index.json
  archive_path: archive

agents:
  tier0: { kind: bash }                                          # deterministic, no LLM
  tier1: { kind: local,  cmd: "curl http://localhost:11434/...", model: nomic-embed-text }
  tier2: { kind: cli,    cmd: "claude -p",                       model: haiku-4-5 }
  tier3: { kind: cli,    cmd: "claude -p",                       model: sonnet-4-6 }
  tier4: { kind: cli,    cmd: "claude -p",                       model: opus-4-7 }

triage:
  rules:
    - when: "task.kind == 'hash-check'"      → tier0
    - when: "task.kind == 'near-duplicate'"  → tier1
    - when: "task.kind == 'propose-merge'"   → tier2
    - when: "task.kind == 'architectural'"   → tier3
    - default: tier2
  max_self_spend: tier1              # triage itself may never exceed this

hooks:
  post_serena_write: bin/ai-kernel-scan
  pre_tool_use:      bin/ai-kernel-suggest   # nudge, don't gate
  interval_scan_minutes: 60
```

Swap Claude → Qwen = edit `agents.tier2.cmd`. No code change.

## 5. Triage — the unified decider

Single primitive, three call sites, one contract.

**Contract:**

```
Input  (task.json)       → Output (decision.json)
{                          {
  "kind": "...",             "tier": "tier0|tier1|tier2|tier3",
  "query": "...",            "surface_cards": ["id", "id"],
  "context": {...}           "action": "nudge|dispatch|skip",
}                            "rationale": "..."
                           }
```

**Call sites:**
1. **Scanner** — each deviation work-item routed to a tier.
2. **PreToolUse hook** — agent query → which cards to surface.
3. **Future request orchestrator** — seam preserved; case statement today, LLM router v3+.

**Tiering invariant:** triage may never spend more than one tier below the decision it's making. A triage costing tier 3 to dispatch tier 3 is malpractice.

- v1: bash + case + inverted-index lookup. Tier 0. Cost ≈ free.
- v2: ambiguous cases fall through to Haiku. Tier 1. Cost ≈ cents.
- v3+: fallback becomes purpose-built routing model. Still capped.

## 6. Components

| Script | Role | LOC target | Tier |
|---|---|---|---|
| `bin/ai-kernel-index` | Walk roots, emit `index.json`. Frontmatter-stripped hashing. | ~150 | 0 |
| `bin/ai-kernel-triage` | `task.json` → `decision.json`. Case statement + index lookup. | ~80 | 0 |
| `bin/ai-kernel-agent` | `tier → shell out` to configured CLI. Engine swap-point. | ~30 | passthrough |
| `bin/ai-kernel-scan` | Diff canonical roots vs. shadow sources. Read-only deviation report. | ~120 | 0 |
| `bin/ai-kernel-suggest` | PreToolUse hook. Inverted-index lookup → system-reminder. | ~40 | 0 |
| `bin/ai-kernel-archive` *(v2)* | Move stale cards to archive with dated subdir + git commit. | ~60 | 0 |
| `bin/ai-kernel-propose` *(v2)* | Read deviation report → markdown proposal for human approval. | — | 2 |

Everything reads `$AI_KERNEL_CONFIG`. Everything respects `max_self_spend`.

## 7. Data contracts

**task.json** (scanner emits, hook emits, orchestrator emits):

```json
{
  "kind": "near-duplicate | propose-merge | architectural | hash-check | nudge-query | ...",
  "query": "free text or structured",
  "context": { "source": "scanner|hook|orchestrator", "target_ids": ["..."] }
}
```

**decision.json** (triage emits):

```json
{
  "tier": "tier0|tier1|tier2|tier3",
  "surface_cards": ["id"],
  "action": "nudge|dispatch|skip",
  "rationale": "matched tags: [datetime]; confidence:inferred downgraded to tier2"
}
```

**deviation-report.json** (scanner emits for proposer):

```json
{
  "generated_at": "...",
  "deviations": [
    { "kind": "duplicate", "ids": ["a", "b"], "similarity": 0.92 },
    { "kind": "stale", "id": "c", "expires_was": "2026-04-01" },
    { "kind": "conflict", "ids": ["d", "e"], "field": "body" }
  ]
}
```

## 8. File layout — single repo

```
~/Projects/ai-kernel/                       # everything lives here
  bin/
    ai-kernel-index
    ai-kernel-triage          (Phase B)
    ai-kernel-agent           (Phase B)
    ai-kernel-scan            (Phase C)
    ai-kernel-suggest         (Phase C)
  config/
    config.example.yaml                     # template, committed
    config.sh                               # shim sourced by every script
  config.local.yaml                         # your active config · GITIGNORED
  memory/
    global/                                 # committed (doctrine, cross-machine personal)
    repos/                                  # GITIGNORED (per-repo context, no leaks)
      elmo-application/
        conventions/datetime.md
        ESL-3648/module-federation-wip.md
      platform-common/
    personal/                               # GITIGNORED (truly private)
  archive/                                  # committed (archived cards)
  index.json                                # GITIGNORED (derived)
  prompts/                                  # tier-2+ agent prompts (Phase B+)
  docs/
    frontmatter-spec.md
    config-reference.md
    triage-contract.md
    migration-from-serena.md
  legacy/                                   # parked Go CLI (see §11)
  PLAN.md                                   # this file
  README.md
```

## 9. Phased execution

### Phase A — Scaffold & index (MVP foundation)

1. Park existing Go CLI under `legacy/` with a README note.
2. Create `bin/`, `config/`, `prompts/`, `memory/`, `docs/` skeleton.
3. Write `config/config.example.yaml` + `config/config.sh` (yq shim).
4. Write `bin/ai-kernel-index` — walks roots, emits `index.json`.
5. Seed 3 pilot cards in-repo:
   - `memory/repos/elmo-application/conventions/datetime.md` (was Serena `conventions/datetime`)
   - `memory/repos/elmo-application/ESL-3648/module-federation-wip.md` (was `module_federation_wip_tracker`)
   - `memory/global/bitbucket-api-access.md` (was `global/bitbucket_api_access`)
6. Run indexer. Verify `index.json` shape. Commit.

**Exit criteria:** `ai-kernel-index` emits a valid index over 3 cards across 2 scopes. ✅ **DONE**

### Phase B — Triage & agent abstraction

7. Write `bin/ai-kernel-triage` — case statement + index lookup.
8. Write `bin/ai-kernel-agent` — reads `agents.<tier>` config, shells out.
9. Smoke test: `echo '{"kind":"propose-merge",...}' | ai-kernel-triage | ai-kernel-agent`.

**Exit criteria:** round-trip from task → decision → agent invocation works with Claude CLI. Swap `agents.tier2.cmd` to a stub `cat` command; still works.

### Phase C — Scanner & PreToolUse hook

10. Write `bin/ai-kernel-scan` — diff canonical vs. shadow sources, emit `deviation-report.json`.
11. Write `bin/ai-kernel-suggest` — PreToolUse shim; query → cards → system-reminder.
12. Wire hook in `~/.claude/settings.json` for one project (elmo-application).

**Exit criteria:** scanner reports ≥1 real deviation between `.serena/memories/` and the 3 pilot cards. Suggest hook surfaces matching cards when greping for "datetime" or "module federation".

### Phase D — Documentation & pilot broadening

13. Write `docs/frontmatter-spec.md`, `docs/config-reference.md`, `docs/triage-contract.md`, `docs/migration-from-serena.md`.
14. Port another 10 Serena memories. Iterate on frontmatter/spec based on friction.

**Exit criteria:** migration doc is followable by someone other than the author. 13 pilot cards indexed.

### Phase E *(v2, not this round)*

Archiver, proposer, Ollama Tier 1, PR-based review flow for `.ai/memory/`, LLM fallback inside triage.

## 10. Graphify absorption summary

| Graphify idea | Status |
|---|---|
| Confidence tag on every record | ✅ Adopted in frontmatter |
| PreToolUse hook nudging agent toward memory | ✅ Adopted (`ai-kernel-suggest`) |
| Frontmatter-stripped hashing | ✅ Adopted in indexer |
| `skill.md` as agent-agnostic orchestration template | 📖 Read before writing `prompts/*.md` |
| NetworkX graph file | ❌ Rejected (authored-flat, not derived) |
| Leiden clustering, hyperedges, god nodes | ❌ Rejected (wrong scale) |
| Tree-sitter AST extraction | ❌ Rejected (we index markdown, not code) |
| Embeddings as first-class | ⏸ Deferred to v3 (graphify validates they're optional) |

Full report: `/tmp/graphify-research.md`.

## 11. Existing Go CLI disposition

`cmd/` (init, detect, check, update) + `internal/detectors/` → **park under `legacy/`** with a README pointer. Different product (submodule-overlay scaffolder), not opposed to this MVP. `install.sh`, `VERSION`, release workflow reusable later for bash script distribution. `loops/*.md`, `substrate/*.md`, `templates/` markdown reusable as tier-2+ prompts.

## 12. Open questions (parked, non-blocking)

1. **`expires:` default window** — `type: work` cards default to 14d? 30d? Match existing convention in `docs/conventions/serena-memory-lifecycle.md`.
2. **Team sharing of `memory/repos/<name>/`** — currently gitignored to avoid leaking internal context. If/when a team wants shared repo-scoped memory, options: (a) unignore a specific subdir case-by-case, (b) fork the kernel repo as `ai-kernel-elmo-team`, (c) promote to a separate shared memory repo. Decide when the need is real, not before.
3. **Migration of 7 ambiguous Serena memories** (flagged in session-handoff.md) — revisit when porting in Phase D.
4. **`related:` as free text vs. validated refs** — if `related: [foo]` but `foo.md` doesn't exist, does index fail or warn? Start with warn.
5. **Router B (general request orchestrator)** — explicitly deferred; seam lives in triage contract.

## 13. Success criteria (for the whole MVP, post-Phase D)

- A new agent session, starting from scratch, surfaces the datetime convention card *before* grepping the codebase, when the user asks a datetime-related question.
- Swapping `agents.tier2.cmd` from `claude -p` to `codex exec` keeps everything working, zero code change.
- Indexer runs in <1 second over 50 cards.
- A deviation between Serena memory and `.ai/memory/` is detected within one scan cycle and surfaced in `deviation-report.json`.
- Any team member can author a new memory card by reading `docs/frontmatter-spec.md` alone.
