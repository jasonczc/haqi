#!/usr/bin/env bash
# Self-test for lint-tokens.sh. Asserts the lint catches bad patterns
# and lets good patterns through.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fake component directory structure matching the real one
mkdir -p "$TMP/src/components/AssistantChat/messages"
BAD="$TMP/src/components/AssistantChat/messages/UserMessage.tsx"
GOOD="$TMP/src/components/AssistantChat/messages/AssistantMessage.tsx"

cat >"$BAD" <<'EOF'
export function Bad() {
  return <div className="min-h-[60px] rounded-[20px] bg-[#ff0000]">x</div>
}
EOF

cat >"$GOOD" <<'EOF'
export function Good() {
  return <div className="min-h-[var(--navbar-height)] rounded-[var(--composer-radius)] bg-[var(--bg-editor)]">x</div>
}
EOF

if "$SCRIPT_DIR/lint-tokens.sh" "$TMP"; then
  echo "FAIL: lint-tokens should have returned non-zero on BAD file"
  exit 1
fi

# Now remove the BAD and re-run — should pass
rm "$BAD"
if ! "$SCRIPT_DIR/lint-tokens.sh" "$TMP"; then
  echo "FAIL: lint-tokens should have returned zero on GOOD-only"
  exit 1
fi

echo "lint-tokens self-test passed"
