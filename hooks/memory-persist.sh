#!/usr/bin/env bash
# NERV v2 — Memory Persist (Stop)
# Extracts research findings from the session handoff and saves to Layer 4.
# Runs on session stop — captures session knowledge for future recall.

set -eo pipefail

NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"
HANDOFF="$HOME/.claude/handoff/session-handoff.md"

# Skip if no handoff exists
if [ ! -f "$HANDOFF" ]; then
  exit 0
fi

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/memory-persist.ts 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
