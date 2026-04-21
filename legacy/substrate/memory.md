<!-- substrate/memory.md -->
# Memory Protocol

## At Session Start

1. Check `~/.claude/handoff/session-handoff.md` — if it exists for this repo, READ it first
2. Run `mcp__serena__list_memories` — scan for relevant memories and read them

## When Making a Non-Obvious Decision

Record it immediately. A non-obvious decision is: architecture choice, library selection, pattern override, significant tradeoff.

How to record:
- Use the decision hook — it writes to `~/.claude/decisions/decisions.csv`:
  ```
  timestamp,repo,decision,why,alternatives_considered
  ```
- For project-scoped decisions: use `mcp__serena__write_memory`

## Before Ending a Session

Write `~/.claude/handoff/session-handoff.md` with:
- What was done
- Current state (branch, open PRs, blockers)
- What to do next

## When Asked "Why Is X the Way It Is?"

Query: `grep <topic> ~/.claude/decisions/decisions.csv`

## Serena vs decisions.csv

| Use | When |
|-----|------|
| Serena `write_memory` | Project-specific: patterns, gotchas, architecture decisions |
| decisions.csv | Cross-repo or "why" questions |
