#!/usr/bin/env bash
# suggest must emit nothing when $PWD has no namespace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"
export AI_KERNEL_CONFIG="$ROOT/config/config.example.yaml"
export AI_KERNEL_INDEX="$ROOT/tests/fixtures/index-with-scopes.json"

# Run from a tmp dir; point repos root at an empty dir to guarantee no namespace match.
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/empty-namespaces"
export AI_KERNEL_MEMORY_REPOS_ROOT="$work/empty-namespaces"
cd "$work"
out="$("$ROOT/bin/ai-kernel-suggest" --query datetime 2>&1)"
[[ -z "$out" ]] || { echo "expected silence, got: $out"; exit 1; }
echo "OK"
