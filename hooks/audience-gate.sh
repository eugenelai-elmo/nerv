#!/usr/bin/env bash
# NERV v2 — Audience Detection (UserPromptSubmit)
# Detects outward-facing text and reinforces skill invocation (tone-of-voice).
# Silent for solo/technical work. Speaks up when output will be read by others.

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

# Fast local pre-screen: only call Jev for prompts that smell like outward-facing text
OUTWARD_PATTERNS="slack|message|email|draft|write|pr desc|pull request|jira|ticket|update|status|reply|respond|meeting|notes|doc|announce|summary for|tell |send |post "
if ! echo "$PROMPT" | grep -qiE "$OUTWARD_PATTERNS"; then
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

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/decide.ts audience-detection "$PROMPT" 2>/dev/null) || true

if [ -z "$RESULT" ]; then
  exit 0
fi

AUDIENCE=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'audience':
        print(s['answer'])
        break
" 2>/dev/null || echo "")

IS_OUTWARD=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'is_outward_facing':
        print('true' if s['answer'] == True else 'false')
        break
" 2>/dev/null || echo "false")

FORMALITY=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('scores', []):
    if s['name'] == 'formality':
        print(s['answer'])
        break
" 2>/dev/null || echo "")

LATENCY=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('latencyMs','?'))" 2>/dev/null || echo "?")

# Only emit for outward-facing text
if [ "$IS_OUTWARD" = "true" ]; then
  echo "Audience: ${AUDIENCE}, tone=${FORMALITY} → use tone-of-voice skill [${LATENCY}ms via jev]"
fi
