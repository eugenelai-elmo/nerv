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

## Deferred

- **Agent topologies substrate** — also pending its own spec. Left until commands stabilises (commands inform what topologies need to invoke).
