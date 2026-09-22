#!/usr/bin/env bash
# NERV v2 — Laya service control
# Usage: laya-ctl.sh {start|stop|status|install|logs}

set -eo pipefail

NERV_DIR="${NERV_DIR:-$HOME/projects/nerv}"
LAYA_URL="${LAYA_URL:-http://127.0.0.1:8421}"
PLIST_SRC="$NERV_DIR/services/com.nerv.laya.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.nerv.laya.plist"
LOG_DIR="$HOME/.cache/nerv"
LOG_FILE="$LOG_DIR/laya.log"

mkdir -p "$LOG_DIR"

case "${1:-status}" in
  install)
    echo "Installing Laya dependencies into venv..."
    python3 -m venv "$NERV_DIR/services/.venv" 2>/dev/null || true
    "$NERV_DIR/services/.venv/bin/pip" install laya fastapi uvicorn 2>&1
    echo ""
    echo "Linking launchd plist..."
    ln -sf "$PLIST_SRC" "$PLIST_DST"
    echo "Installed. Run: laya-ctl.sh start"
    ;;

  start)
    if curl -sf "$LAYA_URL/health" >/dev/null 2>&1; then
      echo "Laya already running at $LAYA_URL"
      exit 0
    fi
    echo "Starting Laya server..."
    cd "$NERV_DIR"
    nohup "$NERV_DIR/services/.venv/bin/python" services/laya-server.py >> "$LOG_FILE" 2>&1 &
    LAYA_PID=$!
    echo "PID: $LAYA_PID"
    # Wait for health
    for i in $(seq 1 30); do
      if curl -sf "$LAYA_URL/health" >/dev/null 2>&1; then
        echo "Laya ready at $LAYA_URL (${i}s)"
        exit 0
      fi
      sleep 1
    done
    echo "Laya failed to start within 30s. Check: $LOG_FILE"
    exit 1
    ;;

  stop)
    PID=$(lsof -ti :8421 2>/dev/null || true)
    if [ -n "$PID" ]; then
      kill "$PID" 2>/dev/null || true
      echo "Stopped Laya (PID $PID)"
    else
      echo "Laya not running"
    fi
    ;;

  status)
    if curl -sf "$LAYA_URL/health" 2>/dev/null; then
      echo ""
      echo "Laya is running"
    else
      echo "Laya not running at $LAYA_URL"
    fi
    ;;

  logs)
    tail -f "$LOG_FILE"
    ;;

  *)
    echo "Usage: laya-ctl.sh {start|stop|status|install|logs}"
    exit 1
    ;;
esac
