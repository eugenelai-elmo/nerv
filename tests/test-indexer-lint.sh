#!/usr/bin/env bash
# Indexer rejects cards with non-canonical values for category/confidence;
# valid cards still indexed; rejection count appears in summary.
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

# (3) Reject lines printed.
echo "$out" | grep -q "bad-category-card\|notarealthing" \
  || { echo "expected reject line for bad category, got: $out"; exit 1; }
echo "$out" | grep -q "bad-confidence-card\|kindof-sure" \
  || { echo "expected reject line for bad confidence, got: $out"; exit 1; }

# (4) End-of-run summary mentions rejected count.
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
