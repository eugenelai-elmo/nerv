# Phase C — Deployment & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the C-global deployment topology — host repos consume the kernel via a global Claude Code hook, surfacing per-repo memory automatically — plus deviation scanning, decision logging, and codeburn-based observability.

**Architecture:** Add three new bash scripts (`ai-kernel-suggest`, `ai-kernel-scan`, `ai-kernel-burn`), extend `ai-kernel-triage` with scope filtering and decision logging, ship a paste-able bootstrap snippet, and wire global SessionStart + PreToolUse hooks. No changes to storage model, frontmatter spec, or `index.json` format.

**Tech Stack:** Bash, `jq`, `yq`. No new dependencies for core scripts; `mmdc` and `codeburn` are optional external CLIs invoked by thin wrappers.

**Spec:** [`docs/superpowers/specs/2026-04-25-deployment-and-observability-design.md`](../specs/2026-04-25-deployment-and-observability-design.md)

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `bin/ai-kernel-triage` | modify | Add `--scope` flag (filter `surface_cards` to allowed scopes); append every decision to `decisions.jsonl`. |
| `bin/ai-kernel-suggest` | **create** | SessionStart + PreToolUse hook entry-point. Computes default scope from `$PWD`, builds `task.json`, pipes to triage, formats result as system-reminder. Silent no-op when no namespace exists. |
| `bin/ai-kernel-scan` | **create** | Walks `memory.shadow_sources`, diffs against canonical roots, emits `deviation-report.json` (duplicates, stale, conflicts). |
| `bin/ai-kernel-burn` | **create** | Thin wrapper around external `codeburn` CLI, joined with `decisions.jsonl` for tier-vs-outcome reporting. |
| `prompts/attach.md` | **create** | Paste-able snippet describing the kernel for non-CC harnesses or fresh machines. |
| `.gitignore` | modify | Add `decisions.jsonl` and `deviation-report.json`. |
| `tests/test-triage-scope.sh` | **create** | Smoke test for scope-filtered triage and decision-log emission. |
| `tests/test-suggest-noop.sh` | **create** | Smoke test that suggest returns nothing when no `repos/<x>/` namespace exists. |
| `tests/test-suggest-surface.sh` | **create** | Smoke test that suggest surfaces a card from a seeded namespace. |
| `tests/test-scan-deviation.sh` | **create** | Smoke test that scan reports a manufactured drift between shadow and canonical. |
| `tests/test-suggest-cc-hook.sh` | **create** | Smoke test for `--cc-prompt-hook` mode (UserPromptSubmit JSON → query → cards). |
| `tests/fixtures/` | **create** | Tiny fixture cards + shadow-source layout for tests. |

**Testing approach:** No bats / no framework. Each `tests/test-*.sh` is a standalone bash script that exits non-zero on failure. Matches existing codebase style (zero test deps). Run with `bash tests/test-*.sh`.

---

## Task 1: Add `--scope` filter to `ai-kernel-triage`

**Files:**
- Modify: `bin/ai-kernel-triage` (~10 line additions)
- Create: `tests/test-triage-scope.sh`
- Create: `tests/fixtures/index-with-scopes.json`

- [ ] **Step 1: Write the failing test**

Create `tests/fixtures/index-with-scopes.json`:

```json
{
  "generated_at": "2026-04-25T00:00:00Z",
  "cards": {
    "datetime-convention":   { "scope": "repo",     "title": "datetime", "tags": ["datetime"] },
    "private-scratch":        { "scope": "personal", "title": "datetime scratch", "tags": ["datetime"] },
    "global-doctrine":        { "scope": "global",   "title": "datetime doctrine", "tags": ["datetime"] }
  },
  "by_tag":   { "datetime": ["datetime-convention", "private-scratch", "global-doctrine"] },
  "by_term":  { "datetime": ["datetime-convention", "private-scratch", "global-doctrine"] },
  "by_scope": {
    "repo":     ["datetime-convention"],
    "personal": ["private-scratch"],
    "global":   ["global-doctrine"]
  }
}
```

Create `tests/test-triage-scope.sh`:

```bash
#!/usr/bin/env bash
# Test: --scope filters surface_cards; decisions.jsonl is appended on every call.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_INDEX="$ROOT/tests/fixtures/index-with-scopes.json"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

LOG="$(mktemp)"
export AI_KERNEL_DECISIONS_LOG="$LOG"
trap 'rm -f "$LOG"' EXIT

# (1) Default scope (no flag) → all 3 cards eligible.
out_all="$(echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage")"
count_all="$(echo "$out_all" | jq '.surface_cards | length')"
[[ "$count_all" == "3" ]] || { echo "expected 3 cards default, got $count_all"; exit 1; }

# (2) --scope global,repo → 2 cards, no personal.
out_scoped="$(echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --scope global,repo)"
ids="$(echo "$out_scoped" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids" == "datetime-convention,global-doctrine," ]] || { echo "scoped ids wrong: $ids"; exit 1; }

# (3) Decision log appended once per call (2 calls so far).
lines="$(wc -l < "$LOG")"
[[ "$lines" == "2" ]] || { echo "expected 2 log lines, got $lines"; exit 1; }

# (4) Each log line is a valid JSON object with .tier and .surface_cards.
while IFS= read -r line; do
  echo "$line" | jq -e '.tier and (.surface_cards|type == "array")' >/dev/null \
    || { echo "bad log line: $line"; exit 1; }
done < "$LOG"

echo "OK"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-triage-scope.sh`
Expected: failure — current `ai-kernel-triage` ignores `--scope` (returns all 3) and does not write to `$AI_KERNEL_DECISIONS_LOG`.

- [ ] **Step 3: Implement `--scope` flag and decision log in `ai-kernel-triage`**

Add to `bin/ai-kernel-triage` directly after `source ".../config.sh"`:

```bash
# ── Optional scope filter: --scope a,b,c ────────────────────────────────────
allowed_scopes=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) allowed_scopes="$2"; shift 2 ;;
    *) ak_die "unknown flag: $1" ;;
  esac
done
```

After the existing `surface_cards` computation (just before the `action="dispatch"` line), filter by scope:

```bash
# ── Scope filter (if requested) ─────────────────────────────────────────────
if [[ -n "$allowed_scopes" && "$(jq -r 'length' <<<"$surface_cards")" -gt 0 && -f "$AI_KERNEL_INDEX" ]]; then
  surface_cards="$(
    jq --argjson cards "$surface_cards" --arg scopes "$allowed_scopes" '
      ($scopes | split(",")) as $allow
      | . as $idx
      | [ $cards[]
          | . as $id
          | select(($idx.cards[$id].scope // "") | IN($allow[])) ]
    ' "$AI_KERNEL_INDEX"
  )"
fi
```

After the `jq -n` block emits the decision, append to log. Replace the trailing `jq -n ...` invocation with:

```bash
decision="$(jq -n \
  --arg tier "$rule_tier" \
  --argjson cards "$surface_cards" \
  --arg action "$action" \
  --arg rationale "$rationale" \
  --arg max_self "$max_self" \
  '{ tier: $tier, surface_cards: $cards, action: $action, rationale: $rationale,
     _meta: { max_self_spend: $max_self } }')"

# Append to decisions log (path overridable for tests).
log="${AI_KERNEL_DECISIONS_LOG:-$AI_KERNEL_ROOT/decisions.jsonl}"
{
  jq -c --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson task "$task" \
        --argjson dec  "$decision" \
        '{ ts: $ts, task: $task, decision: $dec }' >> "$log"
} 2>/dev/null || true   # never fail triage on log write

printf '%s\n' "$decision"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/test-triage-scope.sh`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add bin/ai-kernel-triage tests/test-triage-scope.sh tests/fixtures/index-with-scopes.json
git commit -m "feat(triage): scope filter + decision log"
```

---

## Task 2: Add `decisions.jsonl` to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Edit `.gitignore`**

Append:

```
# Triage decision log — append-only, machine-local
/decisions.jsonl

# Scanner output — derived
/deviation-report.json
```

- [ ] **Step 2: Verify ignored**

Run: `touch decisions.jsonl deviation-report.json && git status --porcelain | grep -E 'decisions|deviation'`
Expected: no output (both ignored). Then: `rm decisions.jsonl deviation-report.json`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore decisions.jsonl and deviation-report.json"
```

---

## Task 3: Build `bin/ai-kernel-suggest`

**Files:**
- Create: `bin/ai-kernel-suggest`
- Create: `tests/test-suggest-noop.sh`
- Create: `tests/test-suggest-surface.sh`
- Create: `tests/fixtures/memory/repos/test-repo/sample.md`

- [ ] **Step 1: Write the failing tests**

Create `tests/fixtures/memory/repos/test-repo/sample.md`:

```markdown
---
id: sample-card
title: Sample card for suggest test
scope: repo
type: knowledge
tags: [datetime]
---

Datetime convention test fixture.
```

Create `tests/test-suggest-noop.sh`:

```bash
#!/usr/bin/env bash
# suggest must emit nothing when $PWD has no namespace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"
export AI_KERNEL_INDEX="$ROOT/tests/fixtures/index-with-scopes.json"

# Run from a tmp dir; point repos root at an empty dir to guarantee no namespace match.
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/empty-namespaces"
export AI_KERNEL_MEMORY_REPOS_ROOT="$work/empty-namespaces"
cd "$work"
out="$("$ROOT/bin/ai-kernel-suggest" --query datetime 2>&1)"
[[ -z "$out" ]] || { echo "expected silence, got: $out"; exit 1; }
echo "OK"
```

Create `tests/test-suggest-surface.sh`:

```bash
#!/usr/bin/env bash
# suggest emits a system-reminder when current $PWD basename matches a namespace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

# Build a one-off index that points at the fixture namespace.
fixture_index="$(mktemp)"
trap 'rm -f "$fixture_index"' EXIT
jq -n '{
  generated_at: "2026-04-25T00:00:00Z",
  cards: { "sample-card": { scope: "repo", title: "Sample", tags: ["datetime"] } },
  by_tag:   { datetime: ["sample-card"] },
  by_term:  { datetime: ["sample-card"] },
  by_scope: { repo: ["sample-card"] }
}' > "$fixture_index"
export AI_KERNEL_INDEX="$fixture_index"

# Simulate running inside a repo named "test-repo" (the fixture namespace).
work="$(mktemp -d)/test-repo"; mkdir -p "$work"
cd "$work"

# Override memory root to point at fixtures, so the namespace dir exists.
export AI_KERNEL_MEMORY_REPOS_ROOT="$ROOT/tests/fixtures/memory/repos"

out="$("$ROOT/bin/ai-kernel-suggest" --query datetime)"
echo "$out" | grep -q "sample-card" || { echo "expected sample-card in output, got: $out"; exit 1; }
echo "$out" | grep -q "<system-reminder>" || { echo "expected <system-reminder> wrapper"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/test-suggest-noop.sh; bash tests/test-suggest-surface.sh`
Expected: failures — `bin/ai-kernel-suggest` does not exist.

- [ ] **Step 3: Implement `bin/ai-kernel-suggest`**

Create `bin/ai-kernel-suggest`:

```bash
#!/usr/bin/env bash
# ai-kernel-suggest — SessionStart + PreToolUse hook entry-point.
#
# Computes the default scope from $PWD basename, builds a task.json,
# pipes it through ai-kernel-triage, and formats surfaced cards as a
# <system-reminder> block on stdout. Silent no-op when no per-repo
# namespace exists.
#
# Usage:
#   ai-kernel-suggest --init              # SessionStart
#   ai-kernel-suggest --query "<text>"    # PreToolUse
#
# Override (for tests):
#   AI_KERNEL_MEMORY_REPOS_ROOT — directory containing repos/<name>/ namespaces

set -euo pipefail
# shellcheck source=../config/config.sh
source "$(dirname "$0")/../config/config.sh"

mode="init"
query=""
include_personal="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --init)             mode="init";  shift ;;
    --query)            mode="query"; query="$2"; shift 2 ;;
    --include-personal) include_personal="true"; shift ;;
    *) ak_die "unknown flag: $1" ;;
  esac
done

# Resolve repo name and namespace dir.
repo_name="$(basename "$PWD")"
repos_root="${AI_KERNEL_MEMORY_REPOS_ROOT:-$AI_KERNEL_ROOT/memory/repos}"
namespace_dir="$repos_root/$repo_name"

# Silent no-op when no namespace.
[[ -d "$namespace_dir" ]] || exit 0

# Build scope list.
scopes="global,repo"
[[ "$include_personal" == "true" ]] && scopes="$scopes,personal"

# Build task.json.
task_kind="nudge-query"
[[ "$mode" == "init" ]] && task_kind="pre-tool-use"
task="$(jq -n --arg kind "$task_kind" --arg q "$query" --arg repo "$repo_name" \
  '{ kind: $kind, query: $q, context: { source: "suggest", repo: $repo } }')"

# Triage.
decision="$(printf '%s' "$task" | "$AI_KERNEL_ROOT/bin/ai-kernel-triage" --scope "$scopes")"

# Format surface_cards as <system-reminder>.
card_count="$(jq -r '.surface_cards | length' <<<"$decision")"
[[ "$card_count" == "0" ]] && exit 0

ids="$(jq -r '.surface_cards[]' <<<"$decision")"
{
  printf '<system-reminder>\n'
  printf 'AI Kernel — relevant memory cards for repo "%s"%s:\n' "$repo_name" \
    "$([[ -n "$query" ]] && printf ' (query: %s)' "$query")"
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    title="$(jq -r --arg id "$id" '.cards[$id].title // $id' "$AI_KERNEL_INDEX" 2>/dev/null || echo "$id")"
    scope="$(jq -r --arg id "$id" '.cards[$id].scope // "?"' "$AI_KERNEL_INDEX" 2>/dev/null || echo "?")"
    printf '  - %s [%s] — %s\n' "$id" "$scope" "$title"
  done <<<"$ids"
  printf 'Query via: %s/bin/ai-kernel-triage\n' "$AI_KERNEL_ROOT"
  printf '</system-reminder>\n'
}
```

Make executable:

```bash
chmod +x bin/ai-kernel-suggest
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/test-suggest-noop.sh && bash tests/test-suggest-surface.sh`
Expected: `OK` from both.

- [ ] **Step 5: Commit**

```bash
git add bin/ai-kernel-suggest tests/test-suggest-noop.sh tests/test-suggest-surface.sh tests/fixtures/memory/
git commit -m "feat(suggest): SessionStart + PreToolUse hook"
```

---

## Task 4: Build `bin/ai-kernel-scan`

**Files:**
- Create: `bin/ai-kernel-scan`
- Create: `tests/test-scan-deviation.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/test-scan-deviation.sh`:

```bash
#!/usr/bin/env bash
# scan reports a duplicate when a shadow source contains a card whose
# frontmatter-stripped body matches a canonical card.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"

# Build an isolated config + memory layout.
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/canonical/global" "$work/shadow"

cat > "$work/canonical/global/datetime.md" <<'EOF'
---
id: datetime
scope: global
title: datetime convention
---
Always store UTC. Convert at presentation.
EOF

cat > "$work/shadow/datetime.md" <<'EOF'
# datetime convention
Always store UTC. Convert at presentation.
EOF

cat > "$work/config.yaml" <<EOF
memory:
  roots:
    - { path: $work/canonical/global, scope: global }
  shadow_sources:
    - $work/shadow
  index_path: $work/index.json
EOF

export AI_KERNEL_CONFIG="$work/config.yaml"
export AI_KERNEL_INDEX="$work/index.json"

# Index canonical first.
"$ROOT/bin/ai-kernel-index" >/dev/null

# Run scan.
report="$("$ROOT/bin/ai-kernel-scan")"
echo "$report" | jq -e '.deviations | length > 0' >/dev/null \
  || { echo "expected at least one deviation, got: $report"; exit 1; }
echo "$report" | jq -e '.deviations[] | select(.kind == "duplicate")' >/dev/null \
  || { echo "expected duplicate kind, got: $report"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-scan-deviation.sh`
Expected: failure — `bin/ai-kernel-scan` does not exist.

- [ ] **Step 3: Implement `bin/ai-kernel-scan`**

Create `bin/ai-kernel-scan`:

```bash
#!/usr/bin/env bash
# ai-kernel-scan — diff canonical roots against shadow sources.
# Emits a deviation-report.json on stdout (also written to AI_KERNEL_ROOT
# unless overridden).
#
# v1 deviations detected:
#   - duplicate: shadow card body hash matches a canonical card body hash
#   - stale:     canonical card has expires < today
# (conflict detection deferred to v2.)

set -euo pipefail
# shellcheck source=../config/config.sh
source "$(dirname "$0")/../config/config.sh"

[[ -f "$AI_KERNEL_INDEX" ]] || ak_die "no index — run ai-kernel-index first"

# Frontmatter-stripped body hash.
hash_body() {
  awk '
    BEGIN { in_fm=0; past_fm=0 }
    NR==1 && /^---[[:space:]]*$/ { in_fm=1; next }
    in_fm && /^---[[:space:]]*$/ { in_fm=0; past_fm=1; next }
    !in_fm && past_fm { print }
    !in_fm && !past_fm && NR==1 { print; past_fm=1 }
    !in_fm && past_fm == 0 && NR > 1 { print }
  ' "$1" | shasum -a 256 | awk '{print $1}'
}

today="$(date -u +%Y-%m-%d)"
deviations='[]'

# (1) Duplicates: shadow file body hash == any canonical card hash from index.
shadow_count="$(yq -r '.memory.shadow_sources | length' "$AI_KERNEL_CONFIG")"
for ((i=0; i<shadow_count; i++)); do
  shadow_root="$(yq -r ".memory.shadow_sources[$i]" "$AI_KERNEL_CONFIG")"
  shadow_root="$(eval echo "$shadow_root")"   # expand $HOME etc
  [[ -d "$shadow_root" ]] || continue
  while IFS= read -r -d '' shadow_file; do
    sh="$(hash_body "$shadow_file")"
    matches="$(jq -r --arg h "$sh" '
      [ .cards | to_entries[] | select(.value.hash == $h) | .key ]
    ' "$AI_KERNEL_INDEX")"
    if [[ "$(jq -r 'length' <<<"$matches")" -gt 0 ]]; then
      deviations="$(jq --argjson m "$matches" --arg path "$shadow_file" \
        '. + [{ kind: "duplicate", shadow: $path, canonical_ids: $m }]' <<<"$deviations")"
    fi
  done < <(find "$shadow_root" -type f -name '*.md' -print0)
done

# (2) Stale: cards with expires < today.
stale="$(jq -r --arg today "$today" '
  [ .cards | to_entries[]
    | select(.value.expires != null and .value.expires < $today)
    | { kind: "stale", id: .key, expires_was: .value.expires } ]
' "$AI_KERNEL_INDEX")"
deviations="$(jq --argjson s "$stale" '. + $s' <<<"$deviations")"

report="$(jq -n \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson dev "$deviations" \
  '{ generated_at: $ts, deviations: $dev }')"

out="${AI_KERNEL_DEVIATION_REPORT:-$AI_KERNEL_ROOT/deviation-report.json}"
printf '%s\n' "$report" | tee "$out"
```

Make executable:

```bash
chmod +x bin/ai-kernel-scan
```

Note: `bin/ai-kernel-index` already records `hash` per card (visible in PLAN.md §3); the scan above relies on that. If the current index does not include `.cards.<id>.hash`, treat that as a bug to fix in `bin/ai-kernel-index` before this task can pass.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/test-scan-deviation.sh`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add bin/ai-kernel-scan tests/test-scan-deviation.sh
git commit -m "feat(scan): shadow-source deviation report (duplicate, stale)"
```

---

## Task 5: Build `bin/ai-kernel-burn` (codeburn wrapper)

**Files:**
- Create: `bin/ai-kernel-burn`

No automated test — depends on external `codeburn` CLI presence and real session data. Manual smoke test only.

- [ ] **Step 1: Implement `bin/ai-kernel-burn`**

Create `bin/ai-kernel-burn`:

```bash
#!/usr/bin/env bash
# ai-kernel-burn — observability wrapper around codeburn.
#
# Reports one-shot success rate joined against decisions.jsonl (which tier
# was chosen vs how the session actually went). codeburn must be on PATH;
# install with `npm i -g @agentseal/codeburn` or per upstream README.
#
# Usage:
#   ai-kernel-burn                         # full report (all sessions)
#   ai-kernel-burn --since 7d              # last 7 days
#   ai-kernel-burn --tier tier2            # filter to a specific tier
#
# Output: human-readable summary + machine-readable JSON tail.

set -euo pipefail
# shellcheck source=../config/config.sh
source "$(dirname "$0")/../config/config.sh"

ak_require codeburn

since=""
tier_filter=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) since="$2"; shift 2 ;;
    --tier)  tier_filter="$2"; shift 2 ;;
    *) ak_die "unknown flag: $1" ;;
  esac
done

log="${AI_KERNEL_DECISIONS_LOG:-$AI_KERNEL_ROOT/decisions.jsonl}"
[[ -f "$log" ]] || ak_die "no decisions.jsonl yet at $log"

# (1) codeburn raw report.
cb_args=()
[[ -n "$since" ]] && cb_args+=(--since "$since")
echo "── codeburn report ──"
codeburn "${cb_args[@]}"

# (2) Triage tier histogram from our log.
echo
echo "── kernel triage tiers ──"
filter='.[]'
[[ -n "$tier_filter" ]] && filter="$filter | select(.decision.tier == \"$tier_filter\")"
jq -s "[ $filter | .decision.tier ] | group_by(.) | map({ tier: .[0], count: length })" "$log"
```

Make executable:

```bash
chmod +x bin/ai-kernel-burn
```

- [ ] **Step 2: Manual smoke test**

If `codeburn` is on PATH and `decisions.jsonl` has at least one entry:

```bash
bin/ai-kernel-burn --since 1d
```

Expected: section headed `── codeburn report ──` followed by `── kernel triage tiers ──` with a JSON histogram. If `codeburn` is missing, expect `ai-kernel: missing dependency: codeburn` — this is correct behavior; install if desired.

- [ ] **Step 3: Commit**

```bash
git add bin/ai-kernel-burn
git commit -m "feat(burn): codeburn wrapper joined with decisions.jsonl"
```

---

## Task 6: Write `prompts/attach.md` (paste-able bootstrap)

**Files:**
- Create: `prompts/attach.md`

- [ ] **Step 1: Write `prompts/attach.md`**

Create `prompts/attach.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add prompts/attach.md
git commit -m "feat(prompts): paste-able bootstrap for non-CC harnesses"
```

---

## Task 7: Wire global UserPromptSubmit hook in `~/.claude/settings.json`

**Files:**
- Modify: `~/.claude/settings.json` (machine-local; not in repo)
- Pre-req (already landed): `bin/ai-kernel-suggest --cc-prompt-hook` mode and `tests/test-suggest-cc-hook.sh`.

This step is intentionally manual — `~/.claude/settings.json` is per-machine and not committed to the kernel repo.

**Hook choice:** `UserPromptSubmit` only. Originally specced as SessionStart + PreToolUse; revised after token-cost analysis (see spec §1). UserPromptSubmit is the only hook that fires with real user intent (the prompt text itself), making it the natural query carrier.

- [ ] **Step 1: Verify path resolution**

Run: `realpath "$(pwd)"`
Expected: `/Users/eugene.lai/Projects/ai-kernel` (or wherever the kernel actually lives).

Set this as `AI_KERNEL_HOME` in the next step.

- [ ] **Step 2: Edit `~/.claude/settings.json`**

Merge (do not overwrite) the existing settings file with:

```jsonc
{
  "env": {
    "AI_KERNEL_HOME": "/Users/eugene.lai/Projects/ai-kernel"
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command",
            "command": "$AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook" }
        ]
      }
    ]
  }
}
```

The `--cc-prompt-hook` mode reads CC's UserPromptSubmit JSON from stdin, extracts the `.prompt` field, and surfaces relevant cards. Silent no-op on empty prompt, malformed JSON, missing namespace, or zero matches.

- [ ] **Step 3: Smoke-test the hook with manual stdin injection**

```bash
mkdir -p $AI_KERNEL_HOME/memory/repos/scratch-test
cat > $AI_KERNEL_HOME/memory/repos/scratch-test/sample.md <<'EOF'
---
id: scratch-sample
title: scratch namespace test card
scope: repo
type: knowledge
tags: [datetime, smoke-test]
---
Datetime convention smoke test.
EOF
$AI_KERNEL_HOME/bin/ai-kernel-index >/dev/null

mkdir -p /tmp/scratch-test && cd /tmp/scratch-test
echo '{"hook_event_name":"UserPromptSubmit","prompt":"how do we handle datetime"}' \
  | $AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook
```

Expected: a `<system-reminder>` block listing `scratch-sample [repo]`.

- [ ] **Step 4: Smoke-test silent no-op in a repo without a namespace**

```bash
mkdir -p /tmp/no-namespace-here && cd /tmp/no-namespace-here
out="$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"datetime"}' \
  | $AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook)"
[[ -z "$out" ]] && echo "OK silent" || echo "FAIL: got $out"
```

Expected: `OK silent`.

- [ ] **Step 5: Open a fresh Claude Code session in `/tmp/scratch-test`**

Submit a prompt mentioning "datetime". Verify the system-reminder block appears as additional context in the agent's view of the turn.

- [ ] **Step 6: Cleanup scratch fixtures**

```bash
rm -rf $AI_KERNEL_HOME/memory/repos/scratch-test /tmp/scratch-test /tmp/no-namespace-here
$AI_KERNEL_HOME/bin/ai-kernel-index >/dev/null
```

No commit required — `~/.claude/settings.json` is machine-local.

---

## Task 8: Run all tests + final commit

- [ ] **Step 1: Run the full test suite**

```bash
for t in tests/test-*.sh; do
  echo "── $t ──"
  bash "$t"
done
```

Expected: every test prints `OK`.

- [ ] **Step 2: Verify Phase C exit criteria**

From `PLAN.md §9 Phase C` (amended by the spec):

- [ ] Scanner reports ≥1 real deviation between `.serena/memories/` and the pilot cards.
  Run: `bin/ai-kernel-scan | jq '.deviations | length'`
  Expected: > 0 if the user has any Serena memories overlapping the seeded cards.

- [ ] Suggest hook surfaces matching cards when greping for "datetime".
  Run from a repo with namespace seeded: `bin/ai-kernel-suggest --query datetime`
  Expected: a `<system-reminder>` block listing the datetime card.

- [ ] Global hook wired in `~/.claude/settings.json`; silent no-op verified.

- [ ] **Step 3: Final commit**

```bash
git status
git log --oneline -10
```

Expected: clean working tree, recent commits cover Tasks 1–6 (Task 7 has no commits — it's machine-local config).
