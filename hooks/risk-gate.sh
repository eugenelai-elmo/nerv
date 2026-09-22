#!/usr/bin/env bash
# NERV v2 — Risk Gate (PreToolUse:Bash)
# Scores destructive risk via Jev before Bash commands execute.
# Non-blocking: outputs a warning, doesn't prevent execution.

set -eo pipefail

NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"

# Read tool input from stdin
INPUT="$(cat /dev/stdin 2>/dev/null || true)"
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract the command from the JSON tool input
COMMAND="$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || true)"
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Fast local pre-screen: skip obviously safe commands
# Only call Jev for commands that contain risky-looking patterns
RISKY_PATTERNS="rm |rm$|force|--hard|reset|drop |delete|push |deploy|kill |pkill|chmod|chown|truncate|> /|>> /|mv /|sudo "
if ! echo "$COMMAND" | grep -qiE "$RISKY_PATTERNS"; then
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

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/decide.ts risk-gate "$COMMAND" 2>/dev/null) || true

if [ -z "$RESULT" ]; then
  exit 0
fi

# Parse the result
IS_DESTRUCTIVE=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'is_destructive':
        print('true' if s['answer'] == True else 'false')
        break
" 2>/dev/null || echo "false")

BLAST_RADIUS=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'blast_radius':
        a = s['answer']
        # Score type returns the label string
        print(a)
        break
" 2>/dev/null || echo "")

IS_REVERSIBLE=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'is_reversible':
        print('true' if s['answer'] == True else 'false')
        break
" 2>/dev/null || echo "true")

LATENCY=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('latencyMs','?'))" 2>/dev/null || echo "?")

# Only emit if Jev flagged it as destructive or high blast radius
if [ "$IS_DESTRUCTIVE" = "true" ]; then
  WARNING="⚠ RISK GATE: destructive=${IS_DESTRUCTIVE}, blast_radius=${BLAST_RADIUS}, reversible=${IS_REVERSIBLE} [${LATENCY}ms via jev]"
  echo "$WARNING"
fi
