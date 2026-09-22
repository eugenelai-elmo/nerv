#!/usr/bin/env bash
# NERV v2 — Jev Skill Router Hook
# UserPromptSubmit hook: classifies the prompt and suggests relevant skills.
# Skips short prompts (<30 chars) and slash commands (already explicit).

set -eo pipefail

PROMPT="${CLAUDE_PROMPT:-}"
if [ -z "$PROMPT" ]; then
  PROMPT="$(cat /dev/stdin 2>/dev/null || true)"
fi
if [ -z "$PROMPT" ]; then
  exit 0
fi
NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"

# Skip short prompts
if [ ${#PROMPT} -lt 30 ]; then
  exit 0
fi

# Skip explicit slash commands
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

# Run the router via script file (not -e, which breaks ESM imports)
RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/route-prompt.ts "$PROMPT" 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
