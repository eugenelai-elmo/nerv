#!/usr/bin/env bash
# --repo restricts repo-scoped cards to a single namespace.
# Global / personal scopes pass through unchanged.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

fixture_index="$(mktemp)"
trap 'rm -f "$fixture_index"' EXIT
jq -n '{
  generated_at: "2026-04-25T00:00:00Z",
  cards: {
    "alpha-card":  { scope: "repo",   repo: "alpha", title: "Alpha repo card", tags: ["datetime"] },
    "beta-card":   { scope: "repo",   repo: "beta",  title: "Beta repo card",  tags: ["datetime"] },
    "global-card": { scope: "global", repo: "",      title: "Global card",     tags: ["datetime"] }
  },
  by_tag:   { datetime: ["alpha-card", "beta-card", "global-card"] },
  by_term:  { datetime: ["alpha-card", "beta-card", "global-card"] },
  by_scope: { repo: ["alpha-card", "beta-card"], global: ["global-card"] }
}' > "$fixture_index"
export AI_KERNEL_INDEX="$fixture_index"

LOG="$(mktemp)"; export AI_KERNEL_DECISIONS_LOG="$LOG"
trap 'rm -f "$LOG" "$fixture_index"' EXIT

# (1) --repo alpha → alpha-card + global-card; beta-card filtered out.
out_a="$(echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --scope global,repo --repo alpha)"
ids_a="$(echo "$out_a" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_a" == "alpha-card,global-card," ]] || { echo "alpha filter wrong: $ids_a"; exit 1; }

# (2) --repo beta → beta-card + global-card.
out_b="$(echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --scope global,repo --repo beta)"
ids_b="$(echo "$out_b" | jq -r '.surface_cards[]' | sort | tr '\n' ',')"
[[ "$ids_b" == "beta-card,global-card," ]] || { echo "beta filter wrong: $ids_b"; exit 1; }

# (3) No --repo → all three cards (back-compat).
out_n="$(echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --scope global,repo)"
count_n="$(echo "$out_n" | jq '.surface_cards | length')"
[[ "$count_n" == "3" ]] || { echo "no-repo filter expected 3, got: $count_n"; exit 1; }

# (4) Empty --repo rejected.
if echo '{"kind":"nudge-query","query":"datetime"}' | "$ROOT/bin/ai-kernel-triage" --repo "" 2>/dev/null; then
  echo "expected --repo '' to fail"; exit 1
fi

echo "OK"
