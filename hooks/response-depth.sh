#!/usr/bin/env bash
# NERV v2 — Response Depth (UserPromptSubmit)
# Scores response depth via Jev so the session calibrates effort.
# Non-blocking: outputs a hint, doesn't alter behavior.

set -eo pipefail

NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"

PROMPT="${CLAUDE_PROMPT:-}"
if [ -z "$PROMPT" ]; then
  PROMPT="$(cat /dev/stdin 2>/dev/null || true)"
fi
if [ -z "$PROMPT" ]; then
  exit 0
fi

# Skip short prompts and slash commands
if [ ${#PROMPT} -lt 20 ]; then
  exit 0
fi
if [[ "$PROMPT" =~ ^/ ]]; then
  exit 0
fi

# Load API key
if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  if [ -f "$NERV_DIR/.env.local" ]; then
    export $(grep TYPESAFE_API_KEY "$NERV_DIR/.env.local" | xargs) 2>/dev/null || true
  fi
  if [ -z "${TYPESAFE_API_KEY:-}" ]; then
    exit 0
  fi
fi

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/decide.ts response-depth "$PROMPT" 2>/dev/null) || true

if [ -z "$RESULT" ]; then
  exit 0
fi

DEPTH=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'depth':
        print(s['answer'])
        break
" 2>/dev/null || echo "")

NEEDS_CODE=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'needs_code':
        print('yes' if s['answer'] == True else 'no')
        break
" 2>/dev/null || echo "")

NEEDS_CONTEXT=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'needs_context':
        print('yes' if s['answer'] == True else 'no')
        break
" 2>/dev/null || echo "")

LATENCY=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('latencyMs','?'))" 2>/dev/null || echo "?")

if [ -n "$DEPTH" ]; then
  echo "Depth hint: ${DEPTH}, code=${NEEDS_CODE}, context=${NEEDS_CONTEXT} [${LATENCY}ms via jev]"
fi
