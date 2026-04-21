<!-- CLAUDE.md -->
# Kernel Boot

## Session Start — Do This Now

1. Read `substrate/memory.md` — decision recording + context restoration
2. Read `substrate/navigation.md` — how to explore code efficiently
3. Read `substrate/agents.md` — when and how to use subagents

## Check for Active Work

After reading substrate, check for in-progress work:
```
.ai/artifacts/active/<any-dir>/state.json  where phase != "done"
```

- **Found active work** → read state.json, report: "Found existing work for <ID> in <phase>. Resuming from <next step>." Then continue from the next incomplete step in `.ai/base/loops/execution.md`.
- **No active work** → greet the user and ask what to work on.

## Loops

Entry loop: `.ai/loops/execution.md` (project overlay — read this when starting work)

On-demand loops (load only when triggered by a gate in execution.md):
- `.ai/base/loops/quality.md` — gate: code changes complete
- `.ai/base/loops/security.md` — gate: auth/input/API touched
- `.ai/base/loops/performance.md` — gate: perf concern raised
- `.ai/base/loops/reliability.md` — gate: infra/prod/deploy changes
- `.ai/base/loops/strategic.md` — gate: direction/arch decision needed

## Tool Resolution

Check `.ai/tool-overrides.md` first, then `.ai/base/tool-defaults.md`. Override wins.
