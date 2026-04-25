#!/usr/bin/env bash
# scan reports a duplicate when a shadow source contains a card whose
# frontmatter-stripped body matches a canonical card.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AI_KERNEL_ROOT="$ROOT"

# Build an isolated config + memory layout.
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/canonical/global" "$work/shadow"

cat > "$work/canonical/global/datetime.md" <<'EOF'
---
id: datetime
scope: global
title: datetime convention
---
Always store UTC. Convert at presentation.
EOF

cat > "$work/shadow/datetime.md" <<'EOF'
Always store UTC. Convert at presentation.
EOF

cat > "$work/canonical/global/expired-card.md" <<'EOF'
---
id: expired-card
scope: global
title: expired card fixture
expires: 2020-01-01
---
Body that won't match anything in shadow.
EOF

cat > "$work/config.yaml" <<EOF
memory:
  roots:
    - { path: $work/canonical/global, scope: global }
  shadow_sources:
    - $work/shadow
  index_path: $work/index.json
  archive_path: $work/archive
EOF

export AI_KERNEL_CONFIG="$work/config.yaml"
export AI_KERNEL_INDEX="$work/index.json"

# Index canonical first.
"$ROOT/bin/ai-kernel-index" >/dev/null

# Run scan.
report="$("$ROOT/bin/ai-kernel-scan")"
echo "$report" | jq -e '.deviations | length > 0' >/dev/null \
  || { echo "expected at least one deviation, got: $report"; exit 1; }
echo "$report" | jq -e '.deviations[] | select(.kind == "duplicate")' >/dev/null \
  || { echo "expected duplicate kind, got: $report"; exit 1; }
echo "$report" | jq -e '.deviations[] | select(.kind == "stale" and .id == "expired-card")' >/dev/null \
  || { echo "expected stale deviation for expired-card, got: $report"; exit 1; }
echo "OK"
