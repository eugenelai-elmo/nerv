---
title: Deployment, Identity, Observability — Design
status: approved
owner: eugene.lai
date: 2026-04-25
supersedes: PLAN.md §5 (default scopes), §6 (component list), §8 (file layout host-side), §9 (Phase C wiring)
extends: PLAN.md (everything else stands)
---

# Deployment, Identity & Observability

This design layers four concerns on top of the existing MVP plan:

1. **Deployment topology** — how a host repo consumes the kernel.
2. **Repo identity** — how per-repo memory is namespaced.
3. **Scope-filtered surfacing** — which scopes feed a query by default.
4. **Observability** — measuring whether triage decisions paid off.

PLAN.md remains the authority on storage model, frontmatter spec, index format, triage contract, and phased execution. This document amends only the sections listed above.

## 1. Deployment topology — C-global

There is **one** kernel clone per machine, at `$AI_KERNEL_HOME` (default `~/Projects/ai-kernel`). Host repos do not contain a `.ai/` directory, submodule, or symlink. The kernel is invisible infrastructure.

Wiring lives entirely in `~/.claude/settings.json`:

```jsonc
{
  "hooks": {
    "SessionStart": [{ "command": "$AI_KERNEL_HOME/bin/ai-kernel-suggest --init" }],
    "PreToolUse":   [{ "command": "$AI_KERNEL_HOME/bin/ai-kernel-suggest" }]
  },
  "env": { "AI_KERNEL_HOME": "/Users/eugene.lai/Projects/ai-kernel" }
}
```

`ai-kernel-suggest` silently no-ops when `$AI_KERNEL_HOME/memory/repos/$(basename "$PWD")/` does not exist (or when `$PWD` is outside a git repo). Repos that don't use the kernel pay zero cost and see zero noise.

**Manual escape hatch — C-prompt.** For new machines (kernel not yet cloned) or for sharing context with a teammate, the kernel ships a paste-able snippet at `prompts/attach.md`. The agent can read it to learn where the kernel lives without an installer.

**Rejected:** submodules (UX wart), per-repo clones (duplication), `.ai/` symlinks (per-repo step we don't need).

## 2. Repo identity — basename(PWD)

Per-repo memory keys on `basename "$PWD"`. The kernel reads `$PWD` (or, when launched outside a repo, falls back to a `null` scope filter that excludes `repos/*` entirely).

Tradeoff accepted: two repos named `frontend` in different orgs collide. Resolution deferred until it actually bites — at which point a `.ai-kernel-name` file in the host repo root, falling back to basename, is the upgrade path. No code changes are needed in the index for this; only `ai-kernel-suggest` learns to read the override.

Explicitly **not** using `git remote get-url origin` — remotes change, repos may have none, and identity should be stable across forks.

## 3. Scope-filtered surfacing

The index walks all three scopes (`global`, `repos/<x>`, `personal`) — this is unchanged. **Surfacing** filters at query time using the `by_scope` map already in `index.json`.

Default policy when invoked from a host repo:

```
scopes = [global, repos/<basename $PWD>]
```

`personal/` is excluded by default and summoned by intent — e.g. a `/ai-kernel-private` slash command toggles inclusion for the session, or `ai-kernel-suggest --include personal` for a single call.

Implementation cost: one extra line in `bin/ai-kernel-triage` (case statement adds a `--scope` flag), one in `bin/ai-kernel-suggest` (computes default scopes from `$PWD`). No index format change.

Rationale: storage layout exists for *gitignore boundaries* and *human navigability*. The index is what makes things searchable. Filtering at the index layer is free and reversible — flat-dir restructures are not.

## 4. Observability — codeburn + decision log

Two thin additions:

**`decisions.jsonl`** — every `ai-kernel-triage` invocation appends one line: input task, output decision, timestamp. Append-only, gitignored, machine-local. ~5 lines added to `ai-kernel-triage`.

**`bin/ai-kernel-burn`** — wrapper around the [codeburn](https://github.com/agentseal/codeburn) CLI, scoped to the kernel's session data. Reports one-shot success rate and tool-use distribution per tier. Lets us cross-reference *kernel-decided tier* (from `decisions.jsonl`) against *codeburn-measured outcome* — the missing feedback loop on routing quality.

Codeburn runs locally, off the request path, no latency cost. Treated as a Phase C+ addition; `decisions.jsonl` lands in Phase B's tail since it's a 5-line change.

## 5. Caveman compression — deferred, scoped

Out of scope for this design. Recorded here so future-us doesn't relitigate:

- **Not at the user surface.** UX cost too high.
- **Not on memory cards.** Humans read them.
- **Yes at the `ai-kernel-agent` shim**, for tier-2+ machine-built prompts (e.g. "judge near-duplicate of cards X,Y"). Apply when Phase B has real traffic and a measurable token bill — earlier is premature optimization.

## 6. Component delta vs PLAN.md §6

| Script | Status | Note |
|---|---|---|
| `ai-kernel-index` | unchanged | — |
| `ai-kernel-triage` | +scope filter, +decision log | ~10 lines |
| `ai-kernel-agent` | unchanged | caveman lives here later |
| `ai-kernel-scan` | unchanged | Phase C |
| `ai-kernel-suggest` | computes scope from `$PWD` | Phase C |
| `ai-kernel-burn` | **new** | thin codeburn wrapper, Phase C+ |

## 7. File layout delta vs PLAN.md §8

Host repo: nothing. No `.ai/`. No `.envrc`. No installer.

Kernel repo adds:

```
~/Projects/ai-kernel/
  decisions.jsonl              # GITIGNORED, append-only triage log
  prompts/
    attach.md                  # paste-able bootstrap for new machines
  bin/
    ai-kernel-burn             # Phase C+
```

## 8. Phase C wiring delta vs PLAN.md §9

Step 12 changes from "wire hook in `~/.claude/settings.json` for one project" to:

> Wire SessionStart + PreToolUse hooks **globally** in `~/.claude/settings.json`, pointing at `$AI_KERNEL_HOME/bin/ai-kernel-suggest`. Verify silent no-op behavior in a repo with no namespace.

Exit criteria for Phase C are otherwise unchanged.

## 9. Success criteria (additive to PLAN.md §13)

- Opening any host repo on the laptop surfaces the right `repos/<basename>` cards with no per-repo install.
- A repo with no kernel namespace produces zero hook output.
- `decisions.jsonl` accumulates one entry per triage call.
- Codeburn report after a week of use shows ≥1 actionable signal about tier-routing accuracy.

## 10. Open questions (parked)

- **Repo-name collision.** If two repos share `basename`, the override file mechanism activates. Until then, accept the risk.
- **`personal/` opt-in UX.** Slash command vs flag vs both — pick on first real use.
- **Codeburn schema stability.** Pin a version when wrapping; revisit if the upstream tool churns.
