#!/usr/bin/env bash
# --include-personal must add personal scope to the triage call,
# surfacing a personal-scope card that is otherwise filtered out.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

fixture_index="$(mktemp)"
trap 'rm -f "$fixture_index"' EXIT
jq -n '{
  generated_at: "2026-04-25T00:00:00Z",
  cards: {
    "repo-card":     { scope: "repo",     title: "Repo card",     tags: ["datetime"] },
    "personal-card": { scope: "personal", title: "Personal card", tags: ["datetime"] }
  },
  by_tag:   { datetime: ["repo-card", "personal-card"] },
  by_term:  { datetime: ["repo-card", "personal-card"] },
  by_scope: { repo: ["repo-card"], personal: ["personal-card"] }
}' > "$fixture_index"
export AI_KERNEL_INDEX="$fixture_index"

work="$(mktemp -d)/test-repo"; mkdir -p "$work"
cd "$work"
export AI_KERNEL_MEMORY_REPOS_ROOT="$ROOT/tests/fixtures/memory/repos"

# (1) Default: personal card must NOT appear.
default_out="$("$ROOT/bin/ai-kernel-suggest" --query datetime)"
if echo "$default_out" | grep -q "personal-card"; then
  echo "default run leaked personal-card: $default_out"; exit 1
fi
echo "$default_out" | grep -q "repo-card" || { echo "expected repo-card in default run"; exit 1; }

# (2) --include-personal: personal card MUST appear.
personal_out="$("$ROOT/bin/ai-kernel-suggest" --query datetime --include-personal)"
echo "$personal_out" | grep -q "personal-card" || { echo "expected personal-card with --include-personal"; exit 1; }

echo "OK"
