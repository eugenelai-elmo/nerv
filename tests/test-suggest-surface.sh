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
  cards: { "sample-card": { scope: "repo", repo: "test-repo", title: "Sample", tags: ["datetime"] } },
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
