# Memory Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `category` frontmatter field with strict-on-value, optional-on-presence semantics, plus a lint pass that validates `scope`, `type`, `confidence`, `category` against config-driven canonical lists. Indexer gains `by_category` map. Triage gains `--category` filter. Backfill the 3 existing pilot cards.

**Architecture:** Config-driven canonical lists (no code changes when adding a 5th category). Indexer rejects cards with non-canonical values for any of the four fields and continues the run. Triage's existing scope filter pattern is mirrored for category. Suggest is unchanged — surfacing default does not narrow by category.

**Tech Stack:** Bash, jq, yq. Same patterns as Phase C (`set -euo pipefail`, `source config/config.sh`, standalone bash tests).

**Spec:** [`docs/superpowers/specs/2026-04-25-memory-categories-design.md`](../specs/2026-04-25-memory-categories-design.md)

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `config/config.example.yaml` | modify | Add `memory.category.canonical: [decision, architecture, initiative, convention]` and the existing canonical sets for the lint pass: `memory.scope.canonical`, `memory.type.canonical`, `memory.confidence.canonical`. |
| `config/config.sh` | modify | New helper `ak_canonical <field>` returning the canonical list for the given frontmatter field. Used by indexer for linting. |
| `bin/ai-kernel-index` | modify | Add per-card lint pass. Add `category` to upserted card record. Add `by_category` inverted map. Extend end-of-run summary. |
| `bin/ai-kernel-triage` | modify | Add `--category a,b,c` filter (mirror of `--scope`). |
| `memory/global/bitbucket-api-access.md` | modify | Backfill `category: convention`. |
| `memory/repos/elmo-application/conventions/datetime.md` | modify | Backfill `category: convention`. |
| `memory/repos/elmo-application/ESL-3648/module-federation-wip.md` | modify | Backfill `category: initiative`. |
| `tests/test-indexer-lint.sh` | **create** | Smoke test: card with `category: notarealthing` rejected; card with `confidence: foo` rejected; valid cards still indexed; rejection counted. |
| `tests/test-triage-category.sh` | **create** | Smoke test: `--category` filter narrows surface_cards by canonical value; uncategorized excluded under filter. |
| `tests/fixtures/index-with-categories.json` | **create** | Tiny fixture index for triage filter test (no real cards). |

---

## Task 1: Canonical lists in config + config.sh helper

**Files:**
- Modify: `config/config.example.yaml`
- Modify: `config/config.sh`

- [ ] **Step 1: Extend `config/config.example.yaml`**

Add a new top-level subsection under `memory:`. Place it after `shadow_sources:` and before `index_path:`:

```yaml
memory:
  # ... existing keys above ...

  # Canonical values for lint-validated frontmatter fields. The indexer rejects
  # cards whose value for any of these fields is set but not in the canonical list.
  # Adding a new value is a config edit + re-index, no code change.
  scope:
    canonical: [global, repo, personal]
  type:
    canonical: [knowledge, work]
  confidence:
    canonical: [extracted, inferred, ambiguous]
  category:
    canonical: [decision, architecture, initiative, convention]

  # ... existing keys below ...
```

(Preserve all other config keys exactly. Insert these four blocks once.)

- [ ] **Step 2: Add `ak_canonical` helper to `config/config.sh`**

After `ak_hash_body`, add:

```bash
# ak_canonical <field>
#   Emit one canonical value per line for the given lint-validated field.
#   Reads memory.<field>.canonical from $AI_KERNEL_CONFIG.
#   Returns 0 always; emits empty if not configured.
ak_canonical() {
  local field="$1"
  AK_FIELD="$field" yq -r ".memory[strenv(AK_FIELD)].canonical[]? // empty" "$AI_KERNEL_CONFIG" 2>/dev/null
}
```

- [ ] **Step 3: Sanity-check the helper**

```bash
cd /Users/eugene.lai/Projects/ai-kernel
source config/config.sh
ak_canonical category
# Expected output (one per line):
# decision
# architecture
# initiative
# convention
```

- [ ] **Step 4: Commit**

```bash
git add config/config.example.yaml config/config.sh
git commit -m "feat(config): canonical value lists + ak_canonical helper"
```

---

## Task 2: Lint pass + `category` field + `by_category` map in indexer

**Files:**
- Modify: `bin/ai-kernel-index`
- Create: `tests/test-indexer-lint.sh`
- Create: fixture cards inside the test (inline `cat <<EOF`).

- [ ] **Step 1: Write the failing test**

Create `tests/test-indexer-lint.sh`:

```bash
#!/usr/bin/env bash
# Indexer rejects cards with non-canonical values for category/confidence;
# valid cards are still indexed; rejection count appears in summary.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/canonical/global"

cat > "$work/canonical/global/good.md" <<'EOF'
---
id: good-card
scope: global
type: knowledge
confidence: extracted
category: decision
title: Good Card
---
Body.
EOF

cat > "$work/canonical/global/bad-category.md" <<'EOF'
---
id: bad-category-card
scope: global
type: knowledge
confidence: extracted
category: notarealthing
title: Bad Category Card
---
Body.
EOF

cat > "$work/canonical/global/bad-confidence.md" <<'EOF'
---
id: bad-confidence-card
scope: global
type: knowledge
confidence: kindof-sure
title: Bad Confidence Card
---
Body.
EOF

cat > "$work/canonical/global/uncategorized.md" <<'EOF'
---
id: uncategorized-card
scope: global
type: knowledge
confidence: extracted
title: Uncategorized Card
---
Body — category field omitted; should still index.
EOF

cat > "$work/config.yaml" <<EOF
memory:
  roots:
    - { path: $work/canonical/global, scope: global }
  shadow_sources: []
  scope:      { canonical: [global, repo, personal] }
  type:       { canonical: [knowledge, work] }
  confidence: { canonical: [extracted, inferred, ambiguous] }
  category:   { canonical: [decision, architecture, initiative, convention] }
  index_path: $work/index.json
  archive_path: $work/archive
EOF

export AI_KERNEL_CONFIG="$work/config.yaml"
export AI_KERNEL_INDEX="$work/index.json"

# Run indexer; capture stderr too.
out="$("$ROOT/bin/ai-kernel-index" 2>&1)"

# (1) Good card and uncategorized card are indexed.
jq -e '.cards["good-card"]'         "$AI_KERNEL_INDEX" >/dev/null \
  || { echo "good-card not indexed"; exit 1; }
jq -e '.cards["uncategorized-card"]' "$AI_KERNEL_INDEX" >/dev/null \
  || { echo "uncategorized-card not indexed"; exit 1; }

# (2) Bad-value cards are NOT indexed.
if jq -e '.cards["bad-category-card"]' "$AI_KERNEL_INDEX" >/dev/null 2>&1; then
  echo "bad-category-card was incorrectly indexed"; exit 1
fi
if jq -e '.cards["bad-confidence-card"]' "$AI_KERNEL_INDEX" >/dev/null 2>&1; then
  echo "bad-confidence-card was incorrectly indexed"; exit 1
fi

# (3) Reject lines printed to stderr/stdout.
echo "$out" | grep -q "bad-category-card\|notarealthing" \
  || { echo "expected reject line for bad category, got: $out"; exit 1; }
echo "$out" | grep -q "bad-confidence-card\|kindof-sure" \
  || { echo "expected reject line for bad confidence, got: $out"; exit 1; }

# (4) End-of-run summary mentions rejected count >= 2.
echo "$out" | grep -E "rejected" \
  || { echo "expected 'rejected' in summary, got: $out"; exit 1; }

# (5) good-card has category populated; uncategorized has empty category.
[[ "$(jq -r '.cards["good-card"].category' "$AI_KERNEL_INDEX")" == "decision" ]] \
  || { echo "good-card category wrong"; exit 1; }
[[ "$(jq -r '.cards["uncategorized-card"].category' "$AI_KERNEL_INDEX")" == "" ]] \
  || { echo "uncategorized-card category should be empty string"; exit 1; }

# (6) by_category map populated.
[[ "$(jq -r '.by_category.decision[0]' "$AI_KERNEL_INDEX")" == "good-card" ]] \
  || { echo "by_category.decision[0] wrong"; exit 1; }

echo "OK"
```

Make executable: `chmod +x tests/test-indexer-lint.sh`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-indexer-lint.sh`
Expected: failure (current indexer doesn't lint, doesn't write `category`, doesn't emit `by_category`).

- [ ] **Step 3: Implement the lint pass + new fields in `bin/ai-kernel-index`**

Edit `bin/ai-kernel-index`:

(a) Near the top of the script, after `source ".../config.sh"`, declare a counter and a generic lint helper:

```bash
total_rejected=0

# ak_lint_field <field-name> <value-from-frontmatter>
#   Returns 0 if value is empty (will be defaulted) or in canonical list,
#   1 otherwise. Stderr line printed for non-canonical values.
ak_lint_field() {
  local field="$1" value="$2"
  [[ -z "$value" ]] && return 0
  while IFS= read -r ok; do
    [[ "$value" == "$ok" ]] && return 0
  done < <(ak_canonical "$field")
  return 1
}
```

(b) Inside the per-card loop, AFTER the existing field reads (`scope`, `mtype`, `confidence`, `expires_val`, etc.) and BEFORE the `hash="$(ak_hash_body "$md")"` line, also read `category`:

```bash
category="$(jq -r '.category // ""' <<<"$fm_json")"
```

Then add the lint block right after:

```bash
# Lint canonical-valued fields. A non-canonical value rejects this card
# but the run continues. Empty values default per existing rules.
reject_reason=""
for f in scope type confidence category; do
  case "$f" in
    scope)      v="$scope" ;;
    type)       v="$mtype" ;;
    confidence) v="$confidence" ;;
    category)   v="$category" ;;
  esac
  if ! ak_lint_field "$f" "$v"; then
    reject_reason="$f=\"$v\" not in canonical"
    break
  fi
done

if [[ -n "$reject_reason" ]]; then
  printf '  [reject] %s: %s\n' "$md" "$reject_reason" >&2
  total_rejected=$((total_rejected+1))
  continue
fi
```

(c) In the `jq` upsert block, add `--arg category "$category"` and the `category:$category` field:

```bash
    jq \
      --arg id "$id" \
      --arg path "$md" \
      --arg title "$title" \
      --arg scope "$scope" \
      --arg repo "$repo_ns" \
      --arg category "$category" \
      --arg mtype "$mtype" \
      --arg confidence "$confidence" \
      --arg hash "$hash" \
      --arg mtime "$mtime" \
      --argjson expires "$expires_val" \
      --argjson tags "$tags_json" \
      --argjson related "$related_json" \
      '.cards[$id] = {
          path:$path, title:$title, scope:$scope, repo:$repo, category:$category,
          type:$mtype, confidence:$confidence,
          tags:$tags, related:$related, hash:$hash, mtime:$mtime, expires:$expires
       }' "$TMP_INDEX" > "$TMP_INDEX.1" && mv "$TMP_INDEX.1" "$TMP_INDEX"
```

(d) After the existing `by_scope` upsert block (and before `by_term`), add `by_category` upsert (only if category is non-empty):

```bash
# by_category (skip when uncategorized)
if [[ -n "$category" ]]; then
  jq --arg id "$id" --arg cat "$category" \
    '.by_category[$cat] = ((.by_category[$cat] // []) + [$id] | unique)' \
    "$TMP_INDEX" > "$TMP_INDEX.1" && mv "$TMP_INDEX.1" "$TMP_INDEX"
fi
```

(e) In the index initialization line near the top of the script, also include `by_category`:

```bash
echo '{"generated_at":"","cards":{},"by_tag":{},"by_term":{},"by_scope":{},"by_category":{}}' > "$TMP_INDEX"
```

(f) Update the final summary line:

```bash
printf 'indexed %d cards · %d tags · %d terms · %d rejected → %s\n' \
  "$card_count" "$tag_count" "$term_count" "$total_rejected" "$AI_KERNEL_INDEX"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/test-indexer-lint.sh`
Expected: `OK`

- [ ] **Step 5: Sanity-check existing real index still works**

Run: `cd /Users/eugene.lai/Projects/ai-kernel && bin/ai-kernel-index`
Expected: indexes the 3 real pilot cards. They'll all be uncategorized at this point (Task 5 will backfill). Summary should show `0 rejected`.

- [ ] **Step 6: Commit**

```bash
git add config/config.example.yaml config/config.sh bin/ai-kernel-index tests/test-indexer-lint.sh
git commit -m "feat(index): canonical-value lint + category + by_category"
```

(If you also committed Task 1 separately, this commit only includes the new test + indexer changes — adjust accordingly.)

---

## Task 3: `--category` filter in triage

**Files:**
- Modify: `bin/ai-kernel-triage`
- Create: `tests/test-triage-category.sh`
- Create: `tests/fixtures/index-with-categories.json`

- [ ] **Step 1: Write the failing test**

Create `tests/fixtures/index-with-categories.json`:

```json
{
  "generated_at": "2026-04-25T00:00:00Z",
  "cards": {
    "decision-card":     { "scope": "global", "category": "decision",     "title": "D", "tags": ["x"] },
    "architecture-card": { "scope": "global", "category": "architecture", "title": "A", "tags": ["x"] },
    "initiative-card":   { "scope": "global", "category": "initiative",   "title": "I", "tags": ["x"] },
    "convention-card":   { "scope": "global", "category": "convention",   "title": "C", "tags": ["x"] },
    "uncategorized":     { "scope": "global", "category": "",             "title": "U", "tags": ["x"] }
  },
  "by_tag":      { "x": ["decision-card", "architecture-card", "initiative-card", "convention-card", "uncategorized"] },
  "by_term":     { "x": ["decision-card", "architecture-card", "initiative-card", "convention-card", "uncategorized"] },
  "by_scope":    { "global": ["decision-card", "architecture-card", "initiative-card", "convention-card", "uncategorized"] },
  "by_category": {
    "decision":     ["decision-card"],
    "architecture": ["architecture-card"],
    "initiative":   ["initiative-card"],
    "convention":   ["convention-card"]
  }
}
```

Create `tests/test-triage-category.sh`:

```bash
#!/usr/bin/env bash
# --category narrows surface_cards by canonical value; uncategorized excluded.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_INDEX="$ROOT/tests/fixtures/index-with-categories.json"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

LOG="$(mktemp)"; export AI_KERNEL_DECISIONS_LOG="$LOG"
trap 'rm -f "$LOG"' EXIT

# (1) No --category → all 5 cards eligible.
out_all="$(echo '{"kind":"nudge-query","query":"x"}' | "$ROOT/bin/ai-kernel-triage")"
count_all="$(echo "$out_all" | jq '.surface_cards | length')"
[[ "$count_all" == "5" ]] || { echo "no-category expected 5, got $count_all"; exit 1; }

# (2) --category decision → only decision-card.
out_d="$(echo '{"kind":"nudge-query","query":"x"}' | "$ROOT/bin/ai-kernel-triage" --category decision)"
ids_d="$(echo "$out_d" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_d" == "decision-card," ]] || { echo "single-category wrong: $ids_d"; exit 1; }

# (3) --category decision,architecture → both.
out_da="$(echo '{"kind":"nudge-query","query":"x"}' | "$ROOT/bin/ai-kernel-triage" --category decision,architecture)"
ids_da="$(echo "$out_da" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_da" == "architecture-card,decision-card," ]] || { echo "two-category wrong: $ids_da"; exit 1; }

# (4) --category filter excludes uncategorized.
out_excl="$(echo '{"kind":"nudge-query","query":"x"}' | "$ROOT/bin/ai-kernel-triage" --category convention)"
if echo "$out_excl" | jq -r '.surface_cards[]' | grep -q "uncategorized"; then
  echo "uncategorized leaked under --category convention"; exit 1
fi

# (5) Empty --category rejected.
if echo '{"kind":"nudge-query","query":"x"}' | "$ROOT/bin/ai-kernel-triage" --category "" 2>/dev/null; then
  echo "expected --category '' to fail"; exit 1
fi

echo "OK"
```

Make executable: `chmod +x tests/test-triage-category.sh`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-triage-category.sh`
Expected: failure (current triage doesn't have `--category`).

- [ ] **Step 3: Implement `--category` flag in `bin/ai-kernel-triage`**

In the existing flag-parsing while loop, add a `--category` arm next to `--scope` and `--repo`:

```bash
allowed_scopes=""
repo_filter=""
allowed_categories=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      [[ $# -ge 2 ]] || ak_die "--scope requires a value"
      [[ -n "$2" ]]  || ak_die "--scope value cannot be empty"
      allowed_scopes="$2"; shift 2 ;;
    --repo)
      [[ $# -ge 2 ]] || ak_die "--repo requires a value"
      [[ -n "$2" ]]  || ak_die "--repo value cannot be empty"
      repo_filter="$2"; shift 2 ;;
    --category)
      [[ $# -ge 2 ]] || ak_die "--category requires a value"
      [[ -n "$2" ]]  || ak_die "--category value cannot be empty"
      allowed_categories="$2"; shift 2 ;;
    --) shift; break ;;
    *) ak_die "unknown flag: $1" ;;
  esac
done
```

After the existing scope filter and repo filter blocks, add the category filter:

```bash
# ── Category filter (if requested) ──────────────────────────────────────────
# When --category is set, drops cards whose category is empty (uncategorized)
# OR not in the allow-list. Without the flag, no filtering.
if [[ -n "$allowed_categories" && "$(jq -r 'length' <<<"$surface_cards")" -gt 0 && -f "$AI_KERNEL_INDEX" ]]; then
  surface_cards="$(
    jq --argjson cards "$surface_cards" --arg cats "$allowed_categories" '
      ($cats | split(",")) as $allow
      | . as $idx
      | [ $cards[]
          | . as $id
          | select(($idx.cards[$id].category // "") | IN($allow[])) ]
    ' "$AI_KERNEL_INDEX"
  )"
fi
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/test-triage-category.sh`
Expected: `OK`

- [ ] **Step 5: Run all tests to verify no regression**

```bash
for t in tests/test-*.sh; do echo "── $t ──"; bash "$t" || exit 1; done
```

Expected: all `OK`.

- [ ] **Step 6: Commit**

```bash
git add bin/ai-kernel-triage tests/test-triage-category.sh tests/fixtures/index-with-categories.json
git commit -m "feat(triage): --category filter mirroring --scope"
```

---

## Task 4: Backfill the 3 pilot cards

**Files:**
- Modify: `memory/global/bitbucket-api-access.md`
- Modify: `memory/repos/elmo-application/conventions/datetime.md`
- Modify: `memory/repos/elmo-application/ESL-3648/module-federation-wip.md`

- [ ] **Step 1: Backfill `bitbucket-api-access.md`**

Add `category: convention` to its frontmatter (it documents how to access the Bitbucket API — that's a convention, not a decision/architecture/initiative).

- [ ] **Step 2: Backfill `datetime.md`**

Add `category: convention` to its frontmatter (literally a datetime convention).

- [ ] **Step 3: Backfill `module-federation-wip.md`**

Add `category: initiative` to its frontmatter (it's per-ticket WIP tracking — the canonical "initiative" shape).

- [ ] **Step 4: Re-index and verify**

```bash
cd /Users/eugene.lai/Projects/ai-kernel
bin/ai-kernel-index
```

Expected summary: `indexed 3 cards · ... · 0 rejected`.

```bash
jq -r '.cards | to_entries[] | "\(.key): \(.value.category)"' index.json
```

Expected: every card shows a non-empty category.

```bash
jq '.by_category' index.json
```

Expected: `{ "convention": ["bitbucket-api-access", "datetime-convention"], "initiative": ["module-federation-wip"] }` (order may vary).

- [ ] **Step 5: Commit**

```bash
git add memory/
git commit -m "memory: backfill category on 3 pilot cards"
```

(Note: `memory/global/` is committed; `memory/repos/elmo-application/` is gitignored, so only the global card lands in the commit. Document this in the commit body if desired.)

---

## Task 5: Final verification + push

- [ ] **Step 1: Run the full test suite**

```bash
for t in tests/test-*.sh; do echo "── $t ──"; bash "$t" || exit 1; done
```

Expected: every test prints `OK`.

- [ ] **Step 2: Verify spec success criteria**

From the spec:

- [ ] All existing pilot cards carry a canonical `category` after backfill.
  Run: `jq -r '.cards | to_entries[] | select(.value.category == "") | .key' index.json`
  Expected: empty output (no uncategorized real cards).

- [ ] Typo'd category fails the card with a clear error.
  Run: temporarily edit a memory card with `category: foo`, run indexer, observe `[reject]` line, revert.

- [ ] Non-canonical value can be promoted via config edit.
  Run: temporarily add `playbook` to `memory.category.canonical` in `config.local.yaml` (create if needed), index a card with `category: playbook`, see it accepted.

- [ ] `ai-kernel-triage --category decision` returns only decision-category cards (covered by Task 3 test).

- [ ] Lint extension catches typo'd `scope`, `confidence`, `type` (covered by Task 2 test for confidence; analogous logic catches the others).

- [ ] **Step 3: Push**

```bash
git log --oneline origin/main..HEAD
git push origin main
```
