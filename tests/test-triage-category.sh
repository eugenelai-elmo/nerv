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
out_all="$(echo '{"kind":"nudge-query","query":"xyz"}' | "$ROOT/bin/ai-kernel-triage")"
count_all="$(echo "$out_all" | jq '.surface_cards | length')"
[[ "$count_all" == "5" ]] || { echo "no-category expected 5, got $count_all"; exit 1; }

# (2) --category decision → only decision-card.
out_d="$(echo '{"kind":"nudge-query","query":"xyz"}' | "$ROOT/bin/ai-kernel-triage" --category decision)"
ids_d="$(echo "$out_d" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_d" == "decision-card," ]] || { echo "single-category wrong: $ids_d"; exit 1; }

# (3) --category decision,architecture → both.
out_da="$(echo '{"kind":"nudge-query","query":"xyz"}' | "$ROOT/bin/ai-kernel-triage" --category decision,architecture)"
ids_da="$(echo "$out_da" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_da" == "architecture-card,decision-card," ]] || { echo "two-category wrong: $ids_da"; exit 1; }

# (4) --category filter excludes uncategorized.
out_excl="$(echo '{"kind":"nudge-query","query":"xyz"}' | "$ROOT/bin/ai-kernel-triage" --category convention)"
if echo "$out_excl" | jq -r '.surface_cards[]' | grep -q "uncategorized"; then
  echo "uncategorized leaked under --category convention"; exit 1
fi

# (5) Empty --category rejected.
if echo '{"kind":"nudge-query","query":"xyz"}' | "$ROOT/bin/ai-kernel-triage" --category "" 2>/dev/null; then
  echo "expected --category '' to fail"; exit 1
fi

echo "OK"
