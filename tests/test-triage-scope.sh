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
lines="$(wc -l < "$LOG" | tr -d ' ')"
[[ "$lines" == "2" ]] || { echo "expected 2 log lines, got $lines"; exit 1; }

# Line 2 corresponds to the --scope global,repo call → exactly 2 surface_cards.
scoped_count="$(sed -n '2p' "$LOG" | jq '.decision.surface_cards | length')"
[[ "$scoped_count" == "2" ]] || { echo "scoped log line expected 2 surface_cards, got $scoped_count"; exit 1; }

# (4) Each log line is a valid JSON object with .tier and .surface_cards.
while IFS= read -r line; do
  echo "$line" | jq -e '.decision.tier and (.decision.surface_cards|type == "array")' >/dev/null \
    || { echo "bad log line: $line"; exit 1; }
done < "$LOG"

# (5) Empty --scope value is rejected.
if echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --scope "" 2>/dev/null; then
  echo "expected --scope '' to fail"; exit 1
fi

echo "OK"
