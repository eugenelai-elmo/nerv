#!/bin/bash
# flowmo-sync.sh — pull latest flowmo once per day on session start.
# Wired as a UserPromptSubmit hook; skips if already pulled today.
set -uo pipefail

FLOWMO_DIR="${HOME}/Projects/flowmo"
STAMP_FILE="${HOME}/.flowmo-last-pull"
TODAY=$(date +%Y-%m-%d)

[[ -d "$FLOWMO_DIR/.git" ]] || exit 0

if [[ -f "$STAMP_FILE" ]] && [[ "$(cat "$STAMP_FILE" 2>/dev/null)" == "$TODAY" ]]; then
  exit 0
fi

branch=$(git -C "$FLOWMO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
if [[ "$branch" != "master" && "$branch" != "main" ]]; then
  exit 0
fi

before=$(git -C "$FLOWMO_DIR" rev-parse HEAD 2>/dev/null)
git -C "$FLOWMO_DIR" fetch --quiet origin 2>/dev/null
git -C "$FLOWMO_DIR" pull --ff-only --quiet 2>/dev/null
after=$(git -C "$FLOWMO_DIR" rev-parse HEAD 2>/dev/null)

echo "$TODAY" > "$STAMP_FILE"

if [[ "$before" != "$after" ]]; then
  count=$(git -C "$FLOWMO_DIR" log --oneline "${before}..${after}" 2>/dev/null | wc -l | tr -d ' ')
  echo "Flowmo updated: ${count} new commit(s) pulled"
fi
