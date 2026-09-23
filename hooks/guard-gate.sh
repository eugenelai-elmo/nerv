#!/usr/bin/env bash
# NERV v2 — Laya Guard Gate (PreToolUse)
# Scans MCP tool input for prompt injection before it reaches the model.
# Non-blocking: outputs a warning, doesn't prevent execution.

set -eo pipefail

NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"

INPUT="$(cat /dev/stdin 2>/dev/null || true)"
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract text content from tool input JSON
TEXT="$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    parts = []
    for k, v in d.items():
        if isinstance(v, str) and len(v) > 20:
            parts.append(v)
    print(' '.join(parts)[:2000])
except:
    pass
" 2>/dev/null || true)"

if [ -z "$TEXT" ] || [ ${#TEXT} -lt 20 ]; then
  exit 0
fi

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/guard-gate.ts "$TEXT" 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
