#!/usr/bin/env bash
# config.sh — resolve AI Kernel config + environment.
# Sourced by every bin/ai-kernel-* script.
#
# Exports:
#   AI_KERNEL_ROOT    — this repo (scripts live under $AI_KERNEL_ROOT/bin)
#   AI_KERNEL_CONFIG  — active config file (AI_KERNEL_ROOT/config.local.yaml,
#                       falling back to config/config.example.yaml)
#   AI_KERNEL_INDEX   — absolute path to index.json (from config)
#   AI_KERNEL_ARCHIVE — absolute path to archive dir (from config)
#
# Helpers:
#   ak_config <yq-path>  read a config value, expanding $HOME and relative paths
#   ak_abs <path>        resolve a possibly-relative path against AI_KERNEL_ROOT
#   ak_die <msg>         print to stderr and exit 1
#   ak_require <cmd>     ensure binary on PATH

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

# Active config: config.local.yaml if present, else the example (for first-run / CI)
if [[ -z "${AI_KERNEL_CONFIG:-}" ]]; then
  if [[ -f "$AI_KERNEL_ROOT/config.local.yaml" ]]; then
    AI_KERNEL_CONFIG="$AI_KERNEL_ROOT/config.local.yaml"
  else
    AI_KERNEL_CONFIG="$AI_KERNEL_ROOT/config/config.example.yaml"
  fi
  export AI_KERNEL_CONFIG
fi

# Resolve a path: if relative, rebase on AI_KERNEL_ROOT; otherwise leave absolute.
ak_abs() {
  local p="$1"
  case "$p" in
    /*) printf '%s' "$p" ;;
    *)  printf '%s/%s' "$AI_KERNEL_ROOT" "$p" ;;
  esac
}

# Read a config value, expanding $HOME.
ak_config() {
  local path="$1"
  local raw
  raw="$(yq -r "$path // \"\"" "$AI_KERNEL_CONFIG")"
  # shellcheck disable=SC2016
  raw="${raw//\$HOME/$HOME}"
  printf '%s' "$raw"
}

: "${AI_KERNEL_INDEX:=$(ak_abs "$(ak_config '.memory.index_path')")}"
: "${AI_KERNEL_ARCHIVE:=$(ak_abs "$(ak_config '.memory.archive_path')")}"
export AI_KERNEL_INDEX AI_KERNEL_ARCHIVE
