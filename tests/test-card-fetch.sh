#!/usr/bin/env bash
# ai-kernel-card retrieves card content by id. Four modes; clear errors on miss.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cat > "$work/sample.md" <<'EOF'
---
id: sample-card
title: Sample Card
scope: global
category: convention
---

The body content lives here. Multiple lines.
Second line of body.
EOF

# Build a one-card index pointing at the sample file.
fixture_index="$work/index.json"
jq -n --arg path "$work/sample.md" '{
  generated_at: "2026-04-25T00:00:00Z",
  cards: { "sample-card": { path: $path, scope: "global", category: "convention", title: "Sample Card" } },
  by_scope: { global: ["sample-card"] },
  by_category: { convention: ["sample-card"] }
}' > "$fixture_index"
export AI_KERNEL_INDEX="$fixture_index"

# (1) --path emits exactly the path.
out_path="$("$ROOT/bin/ai-kernel-card" sample-card --path)"
[[ "$out_path" == "$work/sample.md" ]] || { echo "path wrong: $out_path"; exit 1; }

# (2) --json emits the index entry.
out_json="$("$ROOT/bin/ai-kernel-card" sample-card --json)"
echo "$out_json" | jq -e '.title == "Sample Card" and .category == "convention"' >/dev/null \
  || { echo "json wrong: $out_json"; exit 1; }

# (3) full mode emits frontmatter + body.
out_full="$("$ROOT/bin/ai-kernel-card" sample-card)"
echo "$out_full" | grep -q "^---$"               || { echo "full missing frontmatter"; exit 1; }
echo "$out_full" | grep -q "id: sample-card"     || { echo "full missing id"; exit 1; }
echo "$out_full" | grep -q "The body content"    || { echo "full missing body"; exit 1; }

# (4) --body emits body only, no frontmatter delimiters.
out_body="$("$ROOT/bin/ai-kernel-card" sample-card --body)"
if echo "$out_body" | grep -q "id: sample-card"; then
  echo "body leaked frontmatter"; exit 1
fi
echo "$out_body" | grep -q "The body content"    || { echo "body missing actual body"; exit 1; }
echo "$out_body" | grep -q "Second line of body" || { echo "body truncated"; exit 1; }

# (5) Unknown id → non-zero exit, clear error.
if "$ROOT/bin/ai-kernel-card" no-such-card 2>/dev/null; then
  echo "expected unknown id to fail"; exit 1
fi

# (6) Missing file → non-zero exit.
rm "$work/sample.md"
if "$ROOT/bin/ai-kernel-card" sample-card 2>/dev/null; then
  echo "expected missing-file to fail"; exit 1
fi

echo "OK"
