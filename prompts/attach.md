---
id: attach
purpose: Bootstrap snippet for harnesses that don't auto-load the kernel.
---

# AI Kernel — manual attach

You have access to the AI Kernel — a persistent memory layer with per-repo
namespacing and a triage-driven retrieval contract. It lives at
`$AI_KERNEL_HOME` (default `~/Projects/ai-kernel`).

## How to use

Memory cards live as markdown + YAML at:

- `$AI_KERNEL_HOME/memory/global/` — cross-repo doctrine (committed)
- `$AI_KERNEL_HOME/memory/repos/<repo-name>/` — per-repo context (gitignored)
- `$AI_KERNEL_HOME/memory/personal/` — private, opt-in (gitignored)

The repo namespace key is `basename "$PWD"`.

## Querying

Build a `task.json` and pipe it through triage:

    echo '{"kind":"nudge-query","query":"<your question>"}' \
      | $AI_KERNEL_HOME/bin/ai-kernel-triage --scope global,repo

You will receive a `decision.json` with `surface_cards` (relevant card ids).
Read each card directly — they are plain markdown.

## Discovery

Tags and terms are indexed at `$AI_KERNEL_HOME/index.json`. To see all
available cards for the current repo:

    jq '.by_scope.repo[]' $AI_KERNEL_HOME/index.json

## Why this snippet exists

Claude Code instances pick up the kernel automatically via
`~/.claude/settings.json` hooks. Other harnesses (Codex, Cursor, Aider,
fresh machines without kernel installed) need this snippet pasted into
their context — typically into `AGENTS.md`, `.cursor/rules/`, or the
session's system prompt.
