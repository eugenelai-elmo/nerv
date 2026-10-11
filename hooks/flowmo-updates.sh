#!/bin/bash
# flowmo-updates.sh — once per day, fetch flowmo and REPORT new upstream commits. Never pulls:
# NERV reads targets/paths/config from flowmo, so upstream changes must be applied deliberately.
# Wired as a UserPromptSubmit hook. Fetch is capped at 10s so a stalled network can't hang a prompt.
set -uo pipefail

FLOWMO_DIR="${HOME}/Projects/flowmo"
STAMP_FILE="${HOME}/.flowmo-last-fetch"
FAIL_STAMP="${HOME}/.flowmo-last-fetch-failure"
TODAY=$(date +%Y-%m-%d)

[[ -d "$FLOWMO_DIR/.git" ]] || exit 0
[[ -f "$STAMP_FILE" && "$(cat "$STAMP_FILE" 2>/dev/null)" == "$TODAY" ]] && exit 0

branch=$(git -C "$FLOWMO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
[[ "$branch" == "master" || "$branch" == "main" ]] || exit 0

git -C "$FLOWMO_DIR" fetch --quiet origin "$branch" 2>/dev/null &
fetch_pid=$!
( sleep 10; kill "$fetch_pid" 2>/dev/null ) &
watcher_pid=$!
wait "$fetch_pid"
rc=$?
kill "$watcher_pid" 2>/dev/null
wait "$watcher_pid" 2>/dev/null

if [[ $rc -ne 0 ]]; then
  # Retry on the next prompt, but only mention the failure once a day.
  if [[ "$(cat "$FAIL_STAMP" 2>/dev/null)" != "$TODAY" ]]; then
    echo "$TODAY" > "$FAIL_STAMP"
    echo "flowmo: couldn't check for updates (fetch failed or timed out) — will retry next prompt"
  fi
  exit 0
fi

echo "$TODAY" > "$STAMP_FILE"
behind=$(git -C "$FLOWMO_DIR" rev-list --count "HEAD..origin/$branch" 2>/dev/null || echo 0)
if [[ "$behind" -gt 0 ]]; then
  echo "flowmo: ${behind} new upstream commit(s) on origin/${branch} — review with: git -C ~/Projects/flowmo log --oneline HEAD..origin/${branch} · apply with: git -C ~/Projects/flowmo pull --ff-only"
fi
