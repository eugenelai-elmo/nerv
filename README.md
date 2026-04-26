# AI Kernel

> **Status: paused (2026-04-26).** Superseded in practice by CLAUDE.md (auto-loaded index) + Serena MCP (memory store). Repo preserved for reference.

An experiment in building a multi-substrate "OS" for agentic harnesses — durable memory, procedural commands, and tactical agent topologies — independent of any specific harness (Claude Code, Codex, Cursor).

## What was built

| Substrate | Status | What shipped |
|---|---|---|
| **memory** | ✅ shipped | Cards as markdown + YAML, flat + inverted index (`index.json`), triage with `--scope` / `--repo` / `--category` filters, lazy retrieval via Claude Code `UserPromptSubmit` hook, deviation scanner, decision log, codeburn observability wrapper, retrieval primitive (`ai-kernel-card`). |
| **memory categories** | ✅ shipped | Four canonical values (`decision`, `architecture`, `initiative`, `convention`), strict-on-value, optional-on-presence, config-driven canonical lists, lint pass extending to `scope` / `type` / `confidence` / `category`. |
| **commands** | 🟡 spec-paused | `/remember` brainstorm complete through Q6; spec not written. Notes at `docs/superpowers/notes/commands-substrate.md`. |
| **topologies** | ⏸ unspecced | Tactical multi-agent team shapes (pair-prog, researcher+synth, tech-lead+team). |

## Why it's paused

Real-world testing surfaced that Claude Code already provides:
- `CLAUDE.md` as an auto-loaded project index → covers the surfacing role.
- Serena MCP server with native memory storage and retrieval → covers the durable store role.

The kernel duplicated both, while adding a per-turn hook that injected `<system-reminder>` blocks the agent could (and largely did) get from the existing systems. Net value to weekly workflow: low. Net token cost: real per turn.

**What didn't duplicate (and may earn revival later):**
- The category taxonomy + lint discipline (Serena has no enforced schema).
- `decisions.jsonl` — append-only log of router decisions, useful for tier-routing analysis.
- The shadow-source deviation scanner (canonical vs Serena drift detection).
- The kernel-vs-repo-doc *pattern* — working ground vs published artifact.

These ideas live on as patterns even if this specific implementation rests.

## Layout

```
PLAN.md                           # full design history, phased plan, success criteria status
docs/architecture.md              # Mermaid component / sequence / deployment diagrams
docs/superpowers/specs/           # signed-off design docs (deployment, categories)
docs/superpowers/plans/           # implementation plans
docs/superpowers/notes/           # pre-spec accumulators (commands substrate)
bin/                              # executable verbs (index, triage, agent, suggest, scan, burn, card)
config/                           # config.example.yaml + config.sh shim
memory/                           # cards (global committed; repos/* and personal/ gitignored)
prompts/                          # paste-able snippets (attach.md, onboard.md)
tests/                            # standalone bash smoke tests (10 of them; `bash tests/test-*.sh`)
legacy/                           # parked Go CLI from earlier scaffolder iteration
```

## If you ever revive it

1. Re-add the hook to `~/.claude/settings.json`:
   ```jsonc
   "env": { "AI_KERNEL_HOME": "/Users/eugene.lai/Projects/ai-kernel" },
   "hooks": {
     "UserPromptSubmit": [{
       "matcher": "*",
       "hooks": [{ "type": "command",
                   "command": "$AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook" }]
     }]
   }
   ```
2. Run `bin/ai-kernel-index` to rebuild `index.json`.
3. Smoke-test with `bash tests/test-*.sh`.
4. Read `memory/repos/ai-kernel/*.md` (gitignored, local) for the design rationale captured during the build.

## License / attribution

Personal exploration repo. No license; not for distribution.
