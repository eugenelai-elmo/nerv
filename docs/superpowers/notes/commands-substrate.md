---
title: Commands Substrate — Accumulating Notes
status: pre-brainstorm
last_updated: 2026-04-25
---

# Commands Substrate — Notes

Accumulator for design hints raised before the formal brainstorm opens. Will be harvested when the spec is written.

## Hard requirements raised so far

- **Commands DO NOT auto-write memory.** Memory writes are explicit, user-triggered. (See: memory-categories spec, "Resolved during brainstorm".)
- **`/remember` is the explicit memory-write entry point.** When the user says "remember this" or "commit to memory", `/remember` must:
  - Decide where the new card goes (which scope, which repo namespace).
  - Decide its `category` (one of the canonical four, or uncategorized).
  - Write a properly frontmattered markdown file in the right path.
  - **Trigger a re-index** so the new card is queryable in the same session.
  - Be idempotent if the user re-runs it on the same content (don't duplicate).

## Open questions for the brainstorm

- How does `/remember` infer scope + category from session context vs. require flags? (Pure inference is fragile; pure flags is friction. Hybrid: infer with confirmation.)
- Versioning protocol — when a card already exists for the topic, does `/remember` append, supersede, or refuse? See memory-categories spec parked Q2 (versioning axis: git history vs in-card history vs separate version cards).
- Other commands to ship in v1: `/ship`, `/issue`, `/implement`, `/decide`? Which earn their place vs. which are over-eager.
- Distribution: `$AI_KERNEL_HOME/commands/*.md` symlinked to `~/.claude/commands/ai-kernel/` for CC users; paste-equivalent for other harnesses.

## Expiry / lifecycle (raised 2026-04-25, parked)

Cards have an `expires` field but currently nothing acts on it (only `ai-kernel-scan` flags `expires < today` as a stale deviation). Three lifecycle actions on expiry, none implemented:

| Action | When | Effect |
|---|---|---|
| **Warm** | Work still active; expiry lapsed because we underestimated | Extend `expires`, keep in active surfacing |
| **Retire** | Work done but card worth keeping | Drop from default surfacing; opt-in via `--include-expired`; mark `[STALE]` when shown |
| **Archive** | Card no longer earns its index slot | Move to `archive/<YYYY-MM-DD>/`; remove from index; recoverable via git |

Likely commands: `/warm <id>`, `/retire <id>`, `/archive <id>`. Or one verb (`/expire <id> --action warm`) — TBD.

**Default behavior for triage when expiry detected:** lean toward **retire** (drop from surface_cards) with `--include-expired` opt-in. Cheap to implement, prevents stale data sneaking into agent context. To be specified together with the commands above.

Cross-references:
- Memory-categories spec deferred lifecycle policies per category to scope-(B). Connects here.
- Commands-substrate brainstorm should cover all three verbs together.

## Deferred

- **Agent topologies substrate** — also pending its own spec. Left until commands stabilises (commands inform what topologies need to invoke).
