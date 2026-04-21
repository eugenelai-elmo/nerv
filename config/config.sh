#!/usr/bin/env bash
# config.sh — resolve AI Kernel config + environment.
# Sourced by every bin/ai-kernel-* script.
#
# Exports:
#   AI_KERNEL_ROOT        — this repo (scripts live under $AI_KERNEL_ROOT/bin)
#   AI_KERNEL_HOME        — data root (default: ~/.config/ai-kernel)
#   AI_KERNEL_CONFIG      — config file path (default: $AI_KERNEL_HOME/config.yaml)
#   AI_KERNEL_INDEX       — index.json path (from config)
#   AI_KERNEL_ARCHIVE     — archive path (from config)
#
# Helper functions:
#   ak_config <yq-path>   — read a value from config.yaml with env-var expansion
#   ak_die <message>      — print error to stderr and exit 1
#   ak_require <cmd>      — ensure a binary exists on PATH

set -euo pipefail

ak_die() { printf 'ai-kernel: %s\n' "$*" >&2; exit 1; }
ak_require() { command -v "$1" >/dev/null 2>&1 || ak_die "missing dependency: $1"; }

ak_require yq
ak_require jq

# AI_KERNEL_ROOT = parent of this script's directory
if [[ -z "${AI_KERNEL_ROOT:-}" ]]; then
  _self="${BASH_SOURCE[0]}"
  AI_KERNEL_ROOT="$(cd "$(dirname "$_self")/.." && pwd)"
  export AI_KERNEL_ROOT
fi

: "${AI_KERNEL_HOME:=$HOME/.config/ai-kernel}"
: "${AI_KERNEL_CONFIG:=$AI_KERNEL_HOME/config.yaml}"
export AI_KERNEL_HOME AI_KERNEL_CONFIG

if [[ ! -f "$AI_KERNEL_CONFIG" ]]; then
  ak_die "config not found at $AI_KERNEL_CONFIG — copy $AI_KERNEL_ROOT/config/config.example.yaml there and edit"
fi

# Read a config value, expanding $HOME and $AI_KERNEL_HOME.
ak_config() {
  local path="$1"
  local raw
  raw="$(yq -r "$path // \"\"" "$AI_KERNEL_CONFIG")"
  # shellcheck disable=SC2016
  raw="${raw//\$HOME/$HOME}"
  raw="${raw//\$AI_KERNEL_HOME/$AI_KERNEL_HOME}"
  printf '%s' "$raw"
}

AI_KERNEL_INDEX="$(ak_config '.memory.index_path')"
AI_KERNEL_ARCHIVE="$(ak_config '.memory.archive_path')"
export AI_KERNEL_INDEX AI_KERNEL_ARCHIVE
