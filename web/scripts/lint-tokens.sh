#!/usr/bin/env bash
# Scan the 7 cursor-rewrite component files/directories for hardcoded
# sizes and colors. Fail non-zero if any violations are found.
#
# Usage: lint-tokens.sh [<root>]   (defaults to <web package dir>)
#
# Targets are relative to the root passed in, or to web/ when none.
set -euo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

TARGETS=(
  "$ROOT/src/components/SessionHeader.tsx"
  "$ROOT/src/components/SessionList.tsx"
  "$ROOT/src/components/AssistantChat/messages"
  "$ROOT/src/components/AssistantChat/HappyThread.tsx"
  "$ROOT/src/components/AssistantChat/BriefTurnList.tsx"
  "$ROOT/src/components/AssistantChat/HappyComposer.tsx"
  "$ROOT/src/components/AssistantChat/StatusBar.tsx"
  "$ROOT/src/components/AssistantChat/ComposerButtons.tsx"
  "$ROOT/src/components/assistant-ui/reasoning.tsx"
  "$ROOT/src/components/RunWorkbench/RunWorkbench.tsx"
)

# Filter to only existing paths (tolerate missing in tests)
EXISTING=()
for t in "${TARGETS[@]}"; do
  [[ -e "$t" ]] && EXISTING+=("$t")
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  echo "lint-tokens: no target files found under $ROOT"
  exit 0
fi

VIOLATIONS=0

# Pattern 1: arbitrary-value Tailwind with px/rem numeric
#   min-h-[60px], h-[4rem], p-[12px], gap-[8px], rounded-[20px]
# Allow var(--*) inside brackets.
BAD_SIZE='\[[0-9]+(\.[0-9]+)?(px|rem)\]'

# Pattern 2: hex colors embedded in className
BAD_HEX='#([0-9a-fA-F]{3}){1,2}\b'

while IFS= read -r match; do
  echo "HARDCODED SIZE: $match"
  VIOLATIONS=$((VIOLATIONS+1))
done < <(grep -REn --include='*.tsx' --include='*.ts' "className[^\"']*[\"'][^\"']*$BAD_SIZE" "${EXISTING[@]}" || true)

while IFS= read -r match; do
  echo "HARDCODED HEX:  $match"
  VIOLATIONS=$((VIOLATIONS+1))
done < <(grep -REn --include='*.tsx' --include='*.ts' "className[^\"']*[\"'][^\"']*$BAD_HEX" "${EXISTING[@]}" || true)

if [[ $VIOLATIONS -gt 0 ]]; then
  echo ""
  echo "lint-tokens: $VIOLATIONS violation(s). Use cursor-theme.css tokens instead."
  exit 1
fi

echo "lint-tokens: OK (${#EXISTING[@]} target(s) clean)"
