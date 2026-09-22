#!/usr/bin/env bash
# NERV v2 — Memory Recall (UserPromptSubmit)
# Injects relevant knowledge from Layer 4 into session context.
# Keyword-matches prompt against knowledge/ entries, injects at L1 tier.

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
if [ ${#PROMPT} -lt 30 ]; then
  exit 0
fi
if [[ "$PROMPT" =~ ^/ ]]; then
  exit 0
fi

# Skip if no knowledge files exist
if [ ! -d "$NERV_DIR/knowledge" ] || [ -z "$(find "$NERV_DIR/knowledge" -name '*.md' -type f 2>/dev/null | head -1)" ]; then
  exit 0
fi

RESULT=$(cd "$NERV_DIR" && npx --quiet tsx hooks/memory-recall.ts "$PROMPT" 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
