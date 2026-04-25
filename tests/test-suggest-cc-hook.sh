#!/usr/bin/env bash
# --cc-prompt-hook reads CC's stdin JSON, extracts .prompt, surfaces cards.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"

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

work="$(mktemp -d)/test-repo"; mkdir -p "$work"
cd "$work"
export AI_KERNEL_MEMORY_REPOS_ROOT="$ROOT/tests/fixtures/memory/repos"

# (1) Hook input with prompt → surfaces card.
hook_in='{"session_id":"abc","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":"how do we handle datetime"}'
out="$(echo "$hook_in" | "$ROOT/bin/ai-kernel-suggest" --cc-prompt-hook)"
echo "$out" | grep -q "sample-card" || { echo "expected sample-card, got: $out"; exit 1; }
echo "$out" | grep -q "<system-reminder>" || { echo "expected <system-reminder>"; exit 1; }

# (2) Empty stdin → silent no-op.
out_empty="$("$ROOT/bin/ai-kernel-suggest" --cc-prompt-hook < /dev/null)"
[[ -z "$out_empty" ]] || { echo "expected silence on empty stdin, got: $out_empty"; exit 1; }

# (3) Empty .prompt field → silent no-op.
hook_empty='{"session_id":"abc","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":""}'
out_empty2="$(echo "$hook_empty" | "$ROOT/bin/ai-kernel-suggest" --cc-prompt-hook)"
[[ -z "$out_empty2" ]] || { echo "expected silence on empty prompt, got: $out_empty2"; exit 1; }

# (4) Malformed JSON → silent no-op (must not crash CC).
out_bad="$(echo 'not json' | "$ROOT/bin/ai-kernel-suggest" --cc-prompt-hook)"
[[ -z "$out_bad" ]] || { echo "expected silence on malformed JSON, got: $out_bad"; exit 1; }

echo "OK"
