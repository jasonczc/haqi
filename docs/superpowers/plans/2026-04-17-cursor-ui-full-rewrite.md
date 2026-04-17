# Cursor UI Full Component Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite 7 chat-path components to strictly follow `cursor-clone/` design tokens and agent presentation patterns while preserving 100% of existing functionality (43 features).

**Architecture:** Token-first rewrite. All layout/spacing/typography routes through `cursor-theme.css` variables. `.chat-round` grouping uses pure CSS sibling selectors (no DOM wrappers / no JS grouping). A `lint:tokens` shell script catches hardcoded `px`/`rem` and hex colors in the 7 target component files to prevent future drift.

**Tech Stack:** React 19, `@assistant-ui/react`, Tailwind (arbitrary-value classes banned in scope), vanilla CSS variables, bun + vitest + vite.

**Related spec:** `docs/superpowers/specs/2026-04-17-cursor-ui-full-rewrite-design.md`

**Reference files (read first):**
- `cursor-clone/chat.html` — target HTML structure
- `cursor-clone/styles.css` — exact cursor CSS values (sizes, radii, shadows)
- `web/src/styles/cursor-theme.css` — existing token file (to extend, not replace)

---

## File Structure

**Modify** (10 files):
- `web/src/styles/cursor-theme.css` — add semantic layout tokens
- `web/src/components/SessionHeader.tsx` — 44px navbar rewrite
- `web/src/components/AssistantChat/messages/UserMessage.tsx` — full-width card
- `web/src/components/AssistantChat/messages/AssistantMessage.tsx` — 13/18 prose
- `web/src/components/AssistantChat/messages/ToolMessage.tsx` — cursor-density re-skin
- `web/src/components/assistant-ui/reasoning.tsx` — cursor-density re-skin
- `web/src/components/AssistantChat/HappyComposer.tsx` — white card + fade
- `web/src/components/AssistantChat/StatusBar.tsx` — embedded into composer header
- `web/src/components/AssistantChat/ComposerButtons.tsx` — chip row layout
- `web/src/components/AssistantChat/HappyThread.tsx` — `.chat-round` CSS grouping
- `web/src/components/AssistantChat/BriefTurnList.tsx` — token replacement
- `web/src/components/RunWorkbench/RunWorkbench.tsx` — `.context-header` + Maximize
- `web/src/components/SessionList.tsx` — git icons + hover archive
- `web/package.json` — add `lint:tokens` script

**Create** (2 files):
- `web/scripts/lint-tokens.sh` — shell-based lint guard
- `web/scripts/lint-tokens.test.sh` — self-test for the lint script

**Do NOT touch:**
- `web/src/chat/**` (data layer)
- `web/src/lib/assistant-runtime.ts` (message adapter)
- `web/src/components/ui/*` (shared primitives)
- `web/src/components/RunWorkbench/{Terminal,Files,Preview,Plan,Setup,Secrets,Git,Desktop}Panel.tsx` internals (only the workbench shell changes)

---

## Task 1: Extend cursor-theme.css with Layout Tokens

**Files:**
- Modify: `web/src/styles/cursor-theme.css`

- [ ] **Step 1: Read the file to locate insertion point**

Run: `grep -n "Layout\|sidebar-width\|workbench-width" web/src/styles/cursor-theme.css`
Expected output: line numbers around `--sidebar-width`, `--workbench-width`, `--navbar-height` (already present).

- [ ] **Step 2: Append the semantic layout tokens below existing Layout block**

Insert after the existing `--navbar-height: 2.75rem;` line:

```css
  /* ── Chat layout (cursor-clone parity) ────────── */
  --chat-timeline-padding-y: 16px;
  --chat-timeline-padding-x: 24px;
  --chat-round-gap: 40px;
  --chat-round-gap-internal: 24px;
  --chat-message-gap: 12px;
  --chat-content-max: 720px;

  /* ── User prompt card ─────────────────────────── */
  --user-card-radius: 12px;
  --user-card-padding-y: 12px;
  --user-card-padding-x: 16px;
  --user-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);

  /* ── Composer ─────────────────────────────────── */
  --composer-radius: 16px;
  --composer-padding-top: 12px;
  --composer-padding-right: 12px;
  --composer-padding-bottom: 8px;
  --composer-padding-left: 16px;
  --composer-fade-height: 80px;

  /* ── Context panel ────────────────────────────── */
  --context-panel-width: 440px;
  --context-tab-gap: 16px;
```

- [ ] **Step 3: Add the `.chat-round` sibling-selector rules at the bottom of the file**

Append to `web/src/styles/cursor-theme.css`:

```css
/* ── Chat round grouping (CSS-only, no DOM wrappers) ─────────────
   Every user message starts a new round (40px top gap).
   Agent/tool/reasoning blocks inside a round get 24px top gap. */
.chat-timeline-inner > .chat-message-user + *,
.chat-timeline-inner > * + .chat-message-user {
  margin-top: 0;
}
.chat-timeline-inner > .chat-message-user {
  margin-top: var(--chat-round-gap);
}
.chat-timeline-inner > .chat-message-user:first-child {
  margin-top: 0;
}
.chat-timeline-inner > *:not(.chat-message-user):not(:first-child) {
  margin-top: var(--chat-round-gap-internal);
}
```

- [ ] **Step 4: Verify CSS parses cleanly**

Run: `cd web && bun run dev` (in background), open browser at the printed localhost URL, confirm no CSS parse errors in DevTools console.

Stop dev server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add web/src/styles/cursor-theme.css
git commit -m "feat(web): add cursor-clone layout tokens and .chat-round CSS"
```

---

## Task 2: Add `lint:tokens` Guard Script

**Files:**
- Create: `web/scripts/lint-tokens.sh`
- Create: `web/scripts/lint-tokens.test.sh`
- Modify: `web/package.json`

- [ ] **Step 1: Write the self-test first (TDD)**

Create `web/scripts/lint-tokens.test.sh`:

```bash
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
```

- [ ] **Step 2: Make the self-test executable and run it — expect failure (script doesn't exist)**

Run:
```bash
chmod +x web/scripts/lint-tokens.test.sh
web/scripts/lint-tokens.test.sh
```
Expected: script fails because `lint-tokens.sh` doesn't exist yet.

- [ ] **Step 3: Create `web/scripts/lint-tokens.sh`**

```bash
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
```

- [ ] **Step 4: Make lint script executable and run the self-test — expect pass**

```bash
chmod +x web/scripts/lint-tokens.sh
web/scripts/lint-tokens.test.sh
```
Expected: `lint-tokens self-test passed`

- [ ] **Step 5: Add `lint:tokens` to `web/package.json` scripts**

Modify the `"scripts"` block in `web/package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build && cp dist/index.html dist/404.html",
  "typecheck": "tsc --noEmit",
  "preview": "vite preview",
  "test": "vitest run",
  "lint:tokens": "scripts/lint-tokens.sh",
  "lint:tokens:test": "scripts/lint-tokens.test.sh"
}
```

- [ ] **Step 6: Run `lint:tokens` against the current (pre-rewrite) tree**

Run: `cd web && bun run lint:tokens || true`
Expected: many violations (this is the baseline). Record the count in your notes — the target by end of plan is **0**.

- [ ] **Step 7: Commit**

```bash
git add web/scripts/lint-tokens.sh web/scripts/lint-tokens.test.sh web/package.json
git commit -m "feat(web): lint:tokens guard against hardcoded sizes/colors in cursor components"
```

---

## Task 3: Rewrite SessionHeader to 44px Navbar

**Files:**
- Modify: `web/src/components/SessionHeader.tsx`

- [ ] **Step 1: Read the current file to identify all features that must be preserved**

Run: `wc -l web/src/components/SessionHeader.tsx`
Read the file and list in your notes: back button, StatusDot, title+repo, Save checkpoint (conditional), Workbench toggle (conditional), More menu, SessionActionMenu anchoring, RenameSessionDialog, ConfirmDialog for archive/delete, telegram-app early return.

- [ ] **Step 2: Baseline screenshot**

Run: `cd web && bun run dev`
In browser, navigate to any session. Screenshot the header into `/tmp/before-session-header.png`. Stop dev server.

- [ ] **Step 3: Rewrite the visible header block** (lines ~165-241 in current file)

Replace the outer `<div className="chat-header bg-[var(--bg-editor)] pt-[env(safe-area-inset-top)]">` and its inner `<div className="flex min-h-[60px] items-center gap-2 border-b border-[var(--border-tertiary)] px-4">` wrapper with:

```tsx
<div className="chat-header bg-[var(--chrome)] pt-[env(safe-area-inset-top)]">
    <div
        className="flex items-center gap-[var(--context-tab-gap)] border-b border-[var(--border-tertiary)] px-4"
        style={{ height: 'var(--navbar-height)' }}
    >
        {/* Back button — 28x28 icon-btn */}
        <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={props.onBack}
            aria-label="Back"
            leadingIcon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            }
        />

        <StatusDot
            tone={session.metadata?.containerId ? 'success' : 'idle'}
            size={8}
            title={session.metadata?.containerId ? 'Running' : 'Idle'}
        />

        {/* Title row: session title + repo in a single line */}
        <div className="chat-title flex min-w-0 flex-1 items-baseline gap-2">
            <h2 className="truncate text-[length:var(--font-size-base)] font-[var(--font-weight-semibold)] text-[var(--text-primary)]">
                {title}
            </h2>
            {session.metadata?.repositoryUrl ? (
                <span className="chat-repo truncate text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                    {extractRepoShortName(session.metadata.repositoryUrl)}
                </span>
            ) : null}
        </div>

        {/* Right-side icon cluster */}
        <div className="chat-header-controls flex items-center gap-1">
            {session.metadata?.containerId ? (
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => setCheckpointDialogOpen(true)}
                    title="Save checkpoint"
                    leadingIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l7-3 7 3z"/></svg>}
                />
            ) : null}

            {props.onToggleWorkbench ? (
                <Button
                    variant={props.workbenchOpen ? 'default' : 'ghost'}
                    size="sm"
                    iconOnly
                    onClick={props.onToggleWorkbench}
                    title="Toggle workbench"
                    aria-label="Toggle workbench"
                    leadingIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>}
                />
            ) : null}

            <Button
                ref={menuAnchorRef}
                variant="ghost"
                size="sm"
                iconOnly
                onClick={handleMenuToggle}
                onPointerDown={(e) => e.stopPropagation()}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                title={t('session.more')}
                leadingIcon={<MoreVerticalIcon />}
            />
        </div>
    </div>
</div>
```

Key changes from current:
- Outer bg: `--bg-editor` → `--chrome` (cursor chat-main bg)
- Height: `min-h-[60px]` → `var(--navbar-height)` (44px)
- Back icon size 20 → 16 (cursor icon-btn scale)
- Title+repo: stacked vertically → single row with baseline alignment (cursor style)
- Inner gap: `gap-2` → `var(--context-tab-gap)` (16px)

- [ ] **Step 4: Remove the `Save` text span (cursor header is icon-only)**

Delete this span that previously appeared next to the checkpoint icon:
```tsx
<span className="hidden sm:inline">Save</span>
```
Saved-state feedback comes from the tooltip + dialog (already wired).

- [ ] **Step 5: Run typecheck**

Run: `cd web && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Run existing tests**

Run: `cd web && bun run test`
Expected: all tests green.

- [ ] **Step 7: Visual check**

Run: `cd web && bun run dev`
In browser, open a session. Measure header height with DevTools (should be 44px, not 60px). Screenshot `/tmp/after-session-header.png`.

Side-by-side with `cursor-clone/chat.html` (open both locally): back button + status dot + title + repo should be on one row, icon cluster on the right.

- [ ] **Step 8: Run `lint:tokens` on SessionHeader**

Run: `cd web && bun run lint:tokens 2>&1 | grep SessionHeader || echo 'SessionHeader clean'`
Expected: `SessionHeader clean`. If violations remain, fix them before commit.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/SessionHeader.tsx
git commit -m "refactor(web): SessionHeader on cursor 44px navbar tokens"
```

---

## Task 4: Rewrite UserMessage as Full-Width White Card

**Files:**
- Modify: `web/src/components/AssistantChat/messages/UserMessage.tsx`

- [ ] **Step 1: Add "Worked for Xs" duration helper**

The component needs a way to show turn duration. `ConversationTurn` has `createdAt`/`updatedAt`/`status`, but UserMessage gets message-level metadata, not turn-level. We'll read the duration from an agent event (`turn-duration`) that the reducer already produces, routed through `HappyChatMessageMetadata`.

First, extend `HappyChatMessageMetadata` in `web/src/lib/assistant-runtime.ts`:

Find the existing type definition:
```ts
export type HappyChatMessageMetadata = {
    kind: 'user' | 'assistant' | 'tool' | 'event' | 'cli-output'
    status?: HappyMessageStatus
    localId?: string | null
    originalText?: string
    toolCallId?: string
    event?: AgentEvent
    source?: CliOutputBlock['source']
    attachments?: AttachmentMetadata[]
}
```

Add one field:
```ts
    /** For user messages: duration (ms) of the agent turn that followed this prompt.
     *  null when the turn is still open (live-count on the client). */
    turnDurationMs?: number | null
```

- [ ] **Step 2: Populate `turnDurationMs` in the adapter**

In the same file, find `toThreadMessageLike` for `block.kind === 'user-text'`. We need to compute the duration from the `turn-duration` agent-event block that follows this user-text in the `ChatBlock[]`. The cleanest path: scan `blocks` at a higher level.

Locate where `toThreadMessageLike` is called (expected: the hook `useHappyRuntime` at the bottom of this file). Before mapping blocks, build an index:

```ts
function indexTurnDurations(blocks: ChatBlock[]): Map<string, number | null> {
    const out = new Map<string, number | null>()
    let lastUserId: string | null = null
    let lastUserClosed = false
    for (const b of blocks) {
        if (b.kind === 'user-text') {
            if (lastUserId !== null && !lastUserClosed) {
                out.set(lastUserId, null) // still open
            }
            lastUserId = b.id
            lastUserClosed = false
            continue
        }
        if (b.kind === 'agent-event' && b.event.type === 'turn-duration' && lastUserId) {
            const ms = (b.event as { durationMs?: number }).durationMs ?? null
            out.set(lastUserId, ms)
            lastUserClosed = true
        }
    }
    if (lastUserId !== null && !out.has(lastUserId)) {
        out.set(lastUserId, null)
    }
    return out
}
```

Then pass the index through. In `useHappyRuntime`, before calling `useExternalMessageConverter(...)`, build the index and attach to each block via closure:

```ts
const turnDurations = useMemo(() => indexTurnDurations(blocks), [blocks])
```

Update `toThreadMessageLike` signature to take `turnDurations: Map<string, number | null>` and for `user-text`:
```ts
metadata: {
    custom: {
        kind: 'user',
        status: block.status,
        localId: block.localId,
        originalText: block.originalText,
        attachments: block.attachments,
        turnDurationMs: turnDurations.get(block.id) ?? null,
    } satisfies HappyChatMessageMetadata
}
```

Wire the new arg everywhere `toThreadMessageLike` is called.

- [ ] **Step 3: Rewrite `UserMessage.tsx` body**

Replace the current body from line ~42 to end with:

```tsx
    if (role !== 'user') return null
    const canRetry = status === 'failed' && typeof localId === 'string' && Boolean(ctx.onRetryMessage)
    const onRetry = canRetry ? () => ctx.onRetryMessage!(localId) : undefined

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="chat-message-user px-1 min-w-0 max-w-full overflow-x-hidden" data-happy-message-id={messageId}>
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    const hasText = text.length > 0
    const hasAttachments = attachments && attachments.length > 0

    return (
        <MessagePrimitive.Root
            className="chat-message-user flex flex-col gap-[var(--chat-message-gap)]"
            data-happy-message-id={messageId}
        >
            <div
                className="user-prompt relative bg-[var(--editor)] text-[length:var(--font-size-base)] text-[var(--text-primary)]"
                style={{
                    border: '1px solid var(--border-tertiary)',
                    borderRadius: 'var(--user-card-radius)',
                    padding: 'var(--user-card-padding-y) var(--user-card-padding-x)',
                    boxShadow: 'var(--user-card-shadow)',
                }}
            >
                <div className="user-prompt-body flex-1 min-w-0">
                    {hasText && <LazyRainbowText text={text} />}
                    {hasAttachments && <MessageAttachments attachments={attachments} />}
                </div>
                {onRetry ? (
                    <div className="user-prompt-retry absolute right-2 top-2">
                        <MessageStatusIndicator status={status!} onRetry={onRetry} />
                    </div>
                ) : null}
            </div>
            <UserPromptStatusLine status={status} turnDurationMs={turnDurationMs} />
        </MessagePrimitive.Root>
    )
```

Add `turnDurationMs` read near the other `useAssistantState` calls:
```tsx
    const turnDurationMs = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.turnDurationMs ?? null
    })
```

- [ ] **Step 4: Add the `UserPromptStatusLine` subcomponent at the top of the file**

```tsx
function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    if (totalSec < 60) return `${totalSec}s`
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function UserPromptStatusLine(props: {
    status: HappyMessageStatus | undefined
    turnDurationMs: number | null
}) {
    const { status, turnDurationMs } = props
    const [liveMs, setLiveMs] = useState<number | null>(null)
    const openStart = turnDurationMs === null && (status === 'sent' || status === undefined) ? Date.now() : null

    useEffect(() => {
        if (openStart === null) return
        const id = setInterval(() => setLiveMs(Date.now() - openStart), 1000)
        return () => clearInterval(id)
    }, [openStart])

    let text = ''
    if (status === 'sending') text = 'Sending…'
    else if (status === 'queued') text = 'Queued'
    else if (status === 'failed') text = 'Failed'
    else if (turnDurationMs !== null) text = `Worked for ${formatDuration(turnDurationMs)}`
    else if (liveMs !== null) text = `Working for ${formatDuration(liveMs)}`

    if (!text) return null
    return (
        <div className="agent-status pl-1 text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
            {text}
        </div>
    )
}
```

Add imports at top of file:
```tsx
import { useEffect, useState } from 'react'
import type { MessageStatus as HappyMessageStatus } from '@/types/api'
```

- [ ] **Step 5: Run typecheck**

Run: `cd web && bun run typecheck`
Expected: no errors. If `turnDurationMs` type mismatch appears, confirm the `HappyChatMessageMetadata` change from Step 1 landed.

- [ ] **Step 6: Run vitest (BriefTurnList + reducer tests exercise this path)**

Run: `cd web && bun run test`
Expected: green.

- [ ] **Step 7: Visual check**

Run: `cd web && bun run dev`
Open session with past turns: each user prompt is now an integer-width white card with a subtitle "Worked for Xs" underneath. For an in-flight turn, subtitle ticks "Working for Xs".

- [ ] **Step 8: lint:tokens**

Run: `cd web && bun run lint:tokens 2>&1 | grep UserMessage || echo 'UserMessage clean'`
Expected: `UserMessage clean`.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/assistant-runtime.ts web/src/components/AssistantChat/messages/UserMessage.tsx
git commit -m "refactor(web): UserMessage as full-width card with 'Worked for Xs' line"
```

---

## Task 5: Rewrite AssistantMessage Body

**Files:**
- Modify: `web/src/components/AssistantChat/messages/AssistantMessage.tsx`

- [ ] **Step 1: Replace root class strings**

In `AssistantMessage.tsx`, replace `rootClass` computation:

```tsx
    const rootClass = toolOnly
        ? 'chat-message-agent-tools min-w-0 max-w-full overflow-x-hidden'
        : 'chat-message-agent-body min-w-0 max-w-full overflow-x-hidden'
```

Drop `py-1` and `px-1` — these are replaced by `.chat-message-agent` CSS (set in Task 1's theme file).

- [ ] **Step 2: Add the shared `.chat-message-agent` style to `cursor-theme.css`**

Append to `web/src/styles/cursor-theme.css`:

```css
.chat-message-agent {
  font-size: var(--font-size-base);   /* 13px */
  line-height: var(--line-height-base); /* 18px */
  color: var(--text-primary);
  padding-left: 4px;  /* cursor's visual inset */
}
.chat-message-agent p { margin: 0 0 16px 0; }
.chat-message-agent h3 { font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin: 24px 0 12px 0; }
.chat-message-agent strong { font-weight: var(--font-weight-semibold); }
.chat-message-agent ul { padding-left: 20px; margin-bottom: 16px; }
.chat-message-agent li { margin-bottom: 6px; }
.chat-message-agent code {
  background: var(--bg-quiet, var(--cursor-bg-hover));
  padding: 2px 4px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.agent-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 24px;
  font-size: var(--font-size-base);
}
.agent-table th, .agent-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-tertiary);
  text-align: left;
}
.agent-table th { font-weight: var(--font-weight-medium); color: var(--text-secondary); }
.agent-table td { vertical-align: top; }
.agent-table td a { color: var(--accent); text-decoration: none; }
```

- [ ] **Step 3: Wire markdown tables to `.agent-table`**

Open `web/src/components/assistant-ui/markdown-text.tsx` (the MarkdownText implementation). Find where HTML `<table>` elements are rendered. If a `components` map is passed to the markdown renderer, add:

```tsx
table: (props: React.HTMLAttributes<HTMLTableElement>) => <table {...props} className="agent-table" />
```

If no such map exists yet, follow the existing renderer's API to add a `table` override.

- [ ] **Step 4: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: all green.

- [ ] **Step 5: Visual check**

Run dev server. Open a session with a long assistant reply. Text should be 13px (DevTools computed style). Tables should be styled per cursor. No background on assistant messages.

- [ ] **Step 6: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep AssistantMessage || echo 'AssistantMessage clean'
```

- [ ] **Step 7: Commit**

```bash
git add web/src/components/AssistantChat/messages/AssistantMessage.tsx web/src/styles/cursor-theme.css web/src/components/assistant-ui/markdown-text.tsx
git commit -m "refactor(web): AssistantMessage prose on cursor 13/18 tokens"
```

---

## Task 6: Re-skin Reasoning and ToolMessage

**Files:**
- Modify: `web/src/components/assistant-ui/reasoning.tsx`
- Modify: `web/src/components/AssistantChat/messages/ToolMessage.tsx`

- [ ] **Step 1: Inspect Reasoning component for its current container class**

Run: `grep -n "className" web/src/components/assistant-ui/reasoning.tsx | head -20`
Identify the outer container div for single `Reasoning` and for `ReasoningGroup`.

- [ ] **Step 2: Replace hardcoded sizes with tokens in reasoning.tsx**

For every arbitrary-value Tailwind class in this file (e.g. `rounded-[8px]`, `p-[12px]`, `border-[#E0E0E0]`), replace with:
- `rounded-[8px]` → `rounded-[6px]` (kept as token is not present — OR use inline `style={{ borderRadius: 'var(--user-card-radius)' }}` if 6/12/16 tokens used; pick 6 for secondary blocks via a new `--secondary-card-radius: 6px` token if needed — see Step 3)
- Padding/margin → `var(--chat-message-gap)` or `var(--chat-content-max)` equivalents via inline styles
- Colors → `var(--border-tertiary)`, `var(--text-secondary)`

Actually before changing, add a new token to `cursor-theme.css` at the bottom of the `:root.cursor-theme` block:

```css
  --secondary-card-radius: 6px;
  --secondary-card-padding: 8px 10px;
```

Then in reasoning.tsx, every bordered outer container uses:
```tsx
<div
  style={{
    borderRadius: 'var(--secondary-card-radius)',
    padding: 'var(--secondary-card-padding)',
    border: '1px solid var(--border-tertiary)',
    background: 'var(--bg-quiet, transparent)',
    fontSize: 'var(--font-size-base)',
    lineHeight: 'var(--line-height-base)',
  }}
  className="reasoning-block text-[var(--text-secondary)]"
>
```

- [ ] **Step 3: Repeat the same re-skin for ToolMessage**

In `web/src/components/AssistantChat/messages/ToolMessage.tsx`:
- Outer card: use `--secondary-card-radius`, `--secondary-card-padding`, `border: 1px solid var(--border-tertiary)`
- Header row: 13px base, `--text-secondary` for the tool name chip
- Expand/collapse chevron: 14px icon
- Code/output preview inside: keep monospace via `var(--font-mono)` + `var(--font-size-sm)`

Keep all existing behavior (expand state, subtype-specific rendering, QuestionToolOverlay integration). Change only the wrapping classes/styles.

- [ ] **Step 4: Preserve current fold/unfold UX**

Do NOT change default expanded state. Do NOT force collapse. The spec explicitly decided against forced folding because current density is already acceptable.

- [ ] **Step 5: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: green. Tests for tool rendering (if any) should pass unchanged.

- [ ] **Step 6: Visual check — expand each tool subtype**

Dev server on. Exercise each: Bash, Read, Edit, Glob, Grep, Task, TodoWrite. Confirm:
- Tool header 13px with `text-secondary` name
- Border radius 6px
- No visual "chunking" from mismatched paddings

- [ ] **Step 7: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep -E 'reasoning|ToolMessage' || echo 'reasoning+tool clean'
```

- [ ] **Step 8: Commit**

```bash
git add web/src/components/assistant-ui/reasoning.tsx web/src/components/AssistantChat/messages/ToolMessage.tsx web/src/styles/cursor-theme.css
git commit -m "refactor(web): Reasoning + ToolMessage re-skin on cursor tokens"
```

---

## Task 7: Rewrite HappyComposer with White Card + Fade

**Files:**
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`
- Modify: `web/src/components/AssistantChat/StatusBar.tsx`
- Modify: `web/src/components/AssistantChat/ComposerButtons.tsx`

- [ ] **Step 1: Update the outer `chat-input-wrapper` to use absolute positioning + fade**

In `HappyComposer.tsx`, find the top-level return (~line 1270):

```tsx
<div className={`chat-input-wrapper px-3 ${bottomPaddingClass} pt-2 bg-[var(--cursor-bg-card)] ${cliMode ? 'cli-composer' : ''}`}>
```

Replace with:

```tsx
<div
    className={`chat-input-wrapper ${cliMode ? 'cli-composer' : ''}`}
    style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: `0 var(--chat-timeline-padding-x) var(--chat-timeline-padding-x)`,
        background: `linear-gradient(to top, var(--chrome) 70%, transparent)`,
        pointerEvents: 'none',
    }}
>
```

The fade-out comes from the linear-gradient. Make sure inner `.chat-input-shell` has `pointer-events: auto`:

In the next `<div className="chat-input-shell ...">`, replace with:
```tsx
<div
    className="chat-input-shell mx-auto w-full"
    style={{ pointerEvents: 'auto', maxWidth: 'var(--chat-content-max)' }}
>
```

- [ ] **Step 2: Replace the chat-input-box classes**

Find the `ComposerPrimitive.AttachmentDropzone` containing `<div className={`chat-input-box ...`}>`:

```tsx
<div className={`chat-input-box overflow-hidden transition-[box-shadow] ... ${cliMode ? 'rounded border border-[var(--cursor-stroke-primary)] bg-transparent' : 'rounded-[20px] bg-[var(--cursor-bg-quiet)]'}`}>
```

Replace with:
```tsx
<div
    className="chat-input-box overflow-hidden transition-[box-shadow] data-[dragging=true]:ring-2 data-[dragging=true]:ring-inset data-[dragging=true]:ring-[var(--focus)]"
    style={{
        background: cliMode ? 'transparent' : 'var(--editor)',
        border: `1px solid var(--border-tertiary)`,
        borderRadius: cliMode ? '4px' : 'var(--composer-radius)',
        padding: `var(--composer-padding-top) var(--composer-padding-right) var(--composer-padding-bottom) var(--composer-padding-left)`,
        boxShadow: cliMode ? 'none' : '0 4px 12px rgba(0,0,0,0.05)',
    }}
>
```

- [ ] **Step 3: Move StatusBar into the card as a thin header row**

Currently StatusBar is OUTSIDE `.chat-input-box`. Move it INSIDE, as the first child, styled as a thin 11px secondary row.

In `StatusBar.tsx`, update the outer class + style to:
```tsx
<div
    className="composer-statusbar flex items-center gap-2 overflow-x-auto"
    style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        marginBottom: '6px',
    }}
>
```

Remove any explicit `padding` / `height` classes from StatusBar outer div.

- [ ] **Step 4: Restructure the composer footer: chips left, icons right**

In `HappyComposer.tsx`, locate the existing footer that wraps `ComposerButtons` + send/mic/attachment icons. Replace with a 2-column flex:

```tsx
<div
    className="chat-input-footer flex items-center justify-between gap-2"
    style={{ marginTop: '4px' }}
>
    <div className="footer-left flex items-center gap-1">
        <ComposerButtons
            {/* existing props unchanged */}
        />
    </div>
    <div className="footer-right flex items-center gap-1">
        {/* attachment button */}
        {/* mic/voice button */}
        {/* send button */}
    </div>
</div>
```

In `ComposerButtons.tsx`, each dropdown (permission/model/think/service) becomes a small 11px chip:
```tsx
<button
    className="composer-chip"
    style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        background: 'transparent',
        border: 'none',
        padding: '2px 6px',
        borderRadius: '4px',
    }}
>
    {label}
</button>
```

Keep all existing click handlers, dropdown popovers, and keyboard interactions unchanged.

- [ ] **Step 5: Inline queue panel placement**

The inline queue currently sits INSIDE the chat-input-box at the top. Keep it there but update its border-bottom to use `var(--border-tertiary)` and remove any `bg-[var(--cursor-bg-quiet)]` — replace with transparent (it's inside the white card now).

- [ ] **Step 6: typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: green.

- [ ] **Step 7: Visual check — composer parity**

Dev server. Compare composer with `cursor-clone/chat.html`:
- White card, 16px radius
- Textarea on top
- Chip row left, icon row right in footer
- Top fade from the chat-main background bleeding up through transparent edges
- Inline queue (if active) shows inside card with bottom border separator

Exercise: type text, paste an image, trigger suggestions, switch permission mode, switch model, toggle voice. All must work unchanged.

- [ ] **Step 8: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep -E 'HappyComposer|StatusBar|ComposerButtons' || echo 'composer clean'
```

- [ ] **Step 9: Commit**

```bash
git add web/src/components/AssistantChat/HappyComposer.tsx web/src/components/AssistantChat/StatusBar.tsx web/src/components/AssistantChat/ComposerButtons.tsx
git commit -m "refactor(web): HappyComposer as cursor white card + fade + chip row"
```

---

## Task 8: Rewrite HappyThread with `.chat-round` Spacing

**Files:**
- Modify: `web/src/components/AssistantChat/HappyThread.tsx`
- Modify: `web/src/components/AssistantChat/BriefTurnList.tsx`

- [ ] **Step 1: Update HappyThread outer wrappers to use tokens**

In `HappyThread.tsx`, find the current `ThreadPrimitive.Viewport` block:

```tsx
<div className={`chat-timeline-inner mx-auto w-full max-w-content min-w-0 ${isCompact ? 'p-2' : 'p-3'}`}>
```

Replace with:
```tsx
<div
    className="chat-timeline-inner mx-auto w-full min-w-0"
    style={{
        maxWidth: 'var(--chat-content-max)',
        padding: `var(--chat-timeline-padding-y) var(--chat-timeline-padding-x)`,
    }}
>
```

Drop the `isCompact ? 'p-2' : 'p-3'` conditional — density is now token-controlled. `isCompact` still decides other per-item sizes (e.g., skeleton rows) — leave those.

- [ ] **Step 2: Remove the old `chat-rounds gap-*` wrapper**

Find:
```tsx
<div className={`chat-rounds flex flex-col ${isCompact ? 'gap-2' : 'gap-3'}`}>
    <ThreadMessagesList />
</div>
```

Replace with:
```tsx
<ThreadMessagesList />
```

Reason: round spacing now comes from the CSS sibling selectors in `cursor-theme.css` (Task 1, Step 3), which require messages to be direct children of `.chat-timeline-inner`.

- [ ] **Step 3: Add a chat-timeline-spacer at the end**

Below `<ThreadMessagesList />`, replace the existing `<div className="chat-timeline-spacer" />` with:
```tsx
<div className="chat-timeline-spacer" style={{ height: '120px' }} />
```

(The fixed spacer ensures scroll content isn't hidden behind the absolute-positioned composer.)

- [ ] **Step 4: Wire the outer Root background**

Change the `ThreadPrimitive.Root` class:
```tsx
<ThreadPrimitive.Root className="chat-timeline relative flex min-h-0 min-w-0 w-full flex-1 flex-col">
```
Add background inline style so the fade-gradient in composer has something to blend into:
```tsx
<ThreadPrimitive.Root
    className="chat-timeline relative flex min-h-0 min-w-0 w-full flex-1 flex-col"
    style={{ background: 'var(--chrome)' }}
>
```

- [ ] **Step 5: Repeat token sweep in BriefTurnList**

Open `BriefTurnList.tsx`. Find every arbitrary-value class (`p-\d`, `gap-\d`, `rounded-\[\d+px\]`, `h-\[\d+px\]`) and replace with tokenized values:
- Outer list container: `padding: var(--chat-timeline-padding-y) var(--chat-timeline-padding-x)`
- Between items: rely on the same `.chat-round` CSS sibling rules if the brief list renders with `.chat-message-user`/`.chat-message-agent` classes; otherwise add per-item `margin-top: var(--chat-round-gap-internal)`

Do NOT change the mobile query-param-driven navigation logic — purely visual.

- [ ] **Step 6: typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: green. `BriefTurnList` tests must pass.

- [ ] **Step 7: Visual check — round spacing**

Dev server. Open session with 3+ turns. Measure with DevTools:
- Between round N and round N+1 (i.e., between assistant tail and next user card): 40px top margin on the user card
- Between user card and first assistant block in same round: 24px
- Between assistant blocks (assistant text → tool → another assistant text) in same round: 24px

- [ ] **Step 8: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep -E 'HappyThread|BriefTurnList' || echo 'thread clean'
```

- [ ] **Step 9: Commit**

```bash
git add web/src/components/AssistantChat/HappyThread.tsx web/src/components/AssistantChat/BriefTurnList.tsx
git commit -m "refactor(web): chat timeline uses cursor round-gap CSS sibling rules"
```

---

## Task 9: Rewrite RunWorkbench with `.context-header` + Maximize

**Files:**
- Modify: `web/src/components/RunWorkbench/RunWorkbench.tsx`

- [ ] **Step 1: Read current workbench shell structure**

Run: `grep -n "WorkbenchTabBar\|className\|return (" web/src/components/RunWorkbench/RunWorkbench.tsx | head -30`
Identify the root wrapper + tab bar + panel-container.

- [ ] **Step 2: Replace root wrapper to match cursor `.context-panel`**

Find the outermost div inside the `RunWorkbench` function's return. Replace its classes with:

```tsx
<aside
    className="context-panel flex flex-col flex-shrink-0 z-10"
    style={{
        width: maximized ? '100vw' : 'var(--context-panel-width)',
        background: 'var(--editor)',
        borderLeft: maximized ? 'none' : '1px solid var(--border-tertiary)',
        transition: 'width 0.2s',
    }}
>
```

Add local state at top of the function:
```tsx
const [maximized, setMaximized] = useState(false)
```

- [ ] **Step 3: Rewrite the tab bar to `.context-header`**

In `WorkbenchTabBar`, restructure the return to match cursor:

```tsx
<div
    className="context-header flex items-center justify-between"
    style={{
        padding: '8px 12px 8px 16px',
        borderBottom: '1px solid var(--border-tertiary)',
    }}
>
    <div
        className="context-tabs flex"
        style={{ gap: 'var(--context-tab-gap)' }}
    >
        {tabs.filter(t => t.available).map(t => (
            <button
                key={t.key}
                className={`context-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => props.onTabChange(t.key)}
                style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    fontSize: 'var(--font-size-base)',
                    color: activeTab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === t.key ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                    borderBottom: activeTab === t.key ? '2px solid var(--text-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                }}
            >
                {t.label}
            </button>
        ))}
    </div>
    <div className="context-controls flex items-center gap-1">
        <Button variant="ghost" size="sm" iconOnly onClick={() => setMenuOpen(v => !v)} title="More actions" leadingIcon={<MoreHorizontalIcon />} />
        <Button variant="ghost" size="sm" iconOnly onClick={props.onFullscreen} title={maximized ? 'Restore' : 'Expand panel'} leadingIcon={<MaximizeIcon />} />
        <Button variant="ghost" size="sm" iconOnly onClick={props.onClose} title="Toggle panel" leadingIcon={<SidebarIcon />} />
    </div>
</div>
```

Declare the three SVG icon components inline at top of file (MoreHorizontal / Maximize / Sidebar) if not already imported from `components/icons`.

- [ ] **Step 4: Wire `onFullscreen` to toggle maximize state**

In `RunWorkbench` function body, define:
```tsx
const handleFullscreen = useCallback(() => setMaximized(v => !v), [])
```

Pass `onFullscreen={handleFullscreen}` into `WorkbenchTabBar`.

- [ ] **Step 5: Add `.layout-maximized` side-effect on the root app container**

When `maximized` flips true, the sidebar + chat-main must hide. Use `useEffect` to toggle a class on `document.body`:

```tsx
useEffect(() => {
    if (maximized) {
        document.body.classList.add('layout-maximized')
        return () => document.body.classList.remove('layout-maximized')
    }
    return
}, [maximized])
```

And add to `cursor-theme.css`:

```css
body.layout-maximized .app-sidebar,
body.layout-maximized .chat-main {
  display: none !important;
}
```

(The exact selectors should match the existing app shell — confirm with `grep -n "app-sidebar\|chat-main" web/src/components`.)

- [ ] **Step 6: typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: green.

- [ ] **Step 7: Visual check — tabs + maximize**

Dev server. Open a session, toggle the workbench on. Verify:
- Tabs on left (current active tab underlined 2px)
- More / Expand / Toggle icons on right
- Click Expand → sidebar + chat-main hide; workbench fills viewport; icon title becomes "Restore"
- Click Restore → everything back

Exercise Terminal, Files, Preview tabs — all content should work unchanged.

- [ ] **Step 8: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep RunWorkbench || echo 'RunWorkbench clean'
```

- [ ] **Step 9: Commit**

```bash
git add web/src/components/RunWorkbench/RunWorkbench.tsx web/src/styles/cursor-theme.css
git commit -m "refactor(web): RunWorkbench on cursor context-header + Maximize mode"
```

---

## Task 10: Rewrite SessionList / Sidebar

**Files:**
- Modify: `web/src/components/SessionList.tsx`

- [ ] **Step 1: Baseline — read current row structure**

Run: `grep -n "className\|StatusDot\|archive" web/src/components/SessionList.tsx | head -40`
Identify: row outer, left-icon area, title, right-side (currently StatusDot or nothing), hover-archive button.

- [ ] **Step 2: Replace the row markup**

For each history item row, replace with cursor's pattern:

```tsx
<button
    className={`history-item ${isActive ? 'active' : ''} group flex items-center`}
    onClick={() => onOpen(session.id)}
    style={{
        width: '100%',
        padding: '6px 8px',
        gap: '8px',
        borderRadius: '6px',
        background: isActive ? 'var(--bg-quiet, var(--border-quaternary))' : 'transparent',
        cursor: 'pointer',
        border: 'none',
        textAlign: 'left',
    }}
>
    <div className="history-item-left flex min-w-0 flex-1 items-center gap-2">
        <SessionGitIcon status={session.metadata?.prStatus ?? 'branch'} />
        <span
            className="history-title truncate"
            style={{
                fontSize: 'var(--font-size-base)',
                color: 'var(--text-primary)',
            }}
        >
            {getSessionTitle(session)}
        </span>
    </div>
    {/* Diff stats placeholder — empty span keeps layout consistent until API ships aggregated counts */}
    <span
        className="history-stats"
        style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            minWidth: '0',
        }}
    />
    <button
        className="history-archive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => { e.stopPropagation(); onArchive(session.id) }}
        title="Archive"
        style={{
            padding: '2px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
        }}
    >
        <ArchiveIcon width={14} height={14} />
    </button>
</button>
```

- [ ] **Step 3: Add `SessionGitIcon` subcomponent**

At the top of `SessionList.tsx`:

```tsx
function SessionGitIcon(props: { status: 'branch' | 'merge' | 'pr' }) {
    const color =
        props.status === 'merge' ? 'var(--purple)' :
        props.status === 'pr' ? 'var(--green)' :
        'var(--text-tertiary)'
    const path =
        props.status === 'merge' ? 'M9 21V9m0 12 6-6m-6 6-6-6m12-6V3m0 6-6-6m6 6 6-6' :
        props.status === 'pr' ? 'M15 21v-5a4 4 0 0 0-4-4H4l3-3m0 6-3-3m12-3V3' :
        'M7 21V9m0 12 6-6m-6 6-6-6m12-6V3'
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={path} />
        </svg>
    )
}
```

Note: real cursor icons use lucide `git-branch`, `git-merge`, `git-pull-request`. If the repo already exposes a lucide wrapper at `@/components/icons`, use that instead of inline paths.

- [ ] **Step 4: Replace `session.metadata?.prStatus`**

If `Session` metadata doesn't carry `prStatus`, fall back to deriving from existing fields: `'branch'` for all sessions unless `metadata.prState === 'merged' | 'open'`. Check `web/src/types/api.ts` for any PR-ish field. If none exists, hardcode `'branch'` for now (no PR signal available client-side — acceptable per the spec's data-gap policy).

- [ ] **Step 5: Section headers (This Week / Today / Older) styling**

Keep the existing date-group logic (from `sessionGroupOrder.ts`). Replace the section-title className with:
```tsx
<div
    className="section-title"
    style={{
        padding: '12px 8px 4px',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
    }}
>
    {title}
</div>
```

- [ ] **Step 6: typecheck + tests**

```bash
cd web && bun run typecheck && bun run test
```
Expected: green (SessionList.test.tsx covers row interactions).

- [ ] **Step 7: Visual check — sidebar parity**

Dev server. Each row: git icon (14px), title (13px), empty stats placeholder, archive icon appears on hover (14px). Active row has subtle background. Section titles uppercase 12px tertiary.

- [ ] **Step 8: lint:tokens**

```bash
cd web && bun run lint:tokens 2>&1 | grep SessionList || echo 'SessionList clean'
```

- [ ] **Step 9: Commit**

```bash
git add web/src/components/SessionList.tsx
git commit -m "refactor(web): SessionList rows on cursor git-icon pattern with hover archive"
```

---

## Task 11: Full lint:tokens Clean + 43-Feature Smoke Test

**Files:**
- Run-only (no file changes unless violations found)

- [ ] **Step 1: Full lint**

```bash
cd web && bun run lint:tokens
```
Expected: `lint-tokens: OK (N target(s) clean)`. If any violation → fix in-place, re-run.

- [ ] **Step 2: Full typecheck**

```bash
cd web && bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Full test suite**

```bash
cd web && bun run test
```
Expected: all tests green.

- [ ] **Step 4: Manual 43-feature smoke test**

Start dev server: `cd web && bun run dev`. Open browser. Walk through this checklist, marking each item pass/fail in the PR description:

SessionHeader: [1] back [2] status-dot [3] title [4] repo [5] Save checkpoint (container session) [6] Workbench toggle [7] SessionActionMenu → rename / archive / delete / duplicate / spawn-same / save-checkpoint

UserMessage: [8] markdown [9] attachments [10] retry failed [11] status line (sending/queued/sent/failed/Worked for Xs) [12] CLI output kind

AssistantMessage: [13] markdown body [14] Reasoning [15] ReasoningGroup [16] ToolMessage (Bash, Read, Edit, MultiEdit, Write, Glob, Grep, Task, TodoWrite, WebFetch, WebSearch, BashOutput, KillShell) [17] QuestionToolOverlay [18] PlanApprovalOverlay [19] CliOutputBlock [20] `.agent-table` styled tables

HappyComposer: [21] textarea + draft persistence [22] StatusBar [23] permission-mode [24] model [25] think-effort [26] service-tier [27] inline queue [28] attachment upload+preview+delete [29] Suggestions/Autocomplete [30] voice session [31] CLI send mode [32] paste/drop [33] Enter behavior [34] skill tracking

HappyThread/BriefTurnList: [35] message list [36] jump-to-latest [37] history load-more [38] skeleton [39] brief mode (mobile) [40] LiveActivityBar [41] scroll persistence

RunWorkbench: [42] Terminal / Files / Preview tabs [43] Maximize mode

Cross-cutting: i18n (switch language, verify all labels translate), dark mode (`<html data-theme="dark">`).

- [ ] **Step 5: Visual regression — side-by-side with cursor-clone**

Open `cursor-clone/chat.html` directly in browser (`open cursor-clone/chat.html` on macOS). Open the rewritten app alongside. Verify within 2px:
- navbar height (44px)
- body text 13/18
- round gap 40px, internal 24px
- user card padding 12/16, radius 12px
- composer radius 16px, fade at top
- sidebar row 6px padding
- context-panel width 440px

Screenshot both sides into `/tmp/cursor-vs-haqi-{section}.png` for the PR description.

- [ ] **Step 6: If all green, open PR**

Create PR description template:

```markdown
## Cursor UI Full Component Rewrite

Implements `docs/superpowers/specs/2026-04-17-cursor-ui-full-rewrite-design.md`.

### What changed
- 7 chat-path components rewritten to follow cursor-theme tokens strictly
- New `lint:tokens` script guards against future hardcoded-value drift
- Workbench gains Maximize mode
- UserMessage shows "Worked for Xs" duration line

### Feature checklist (43 items verified)
[paste pass/fail from Step 4]

### Visual comparison
[embed /tmp/cursor-vs-haqi-*.png screenshots]

### Zero-regression verification
- [x] `bun run test:web` — N tests passed
- [x] `bun run typecheck:web`
- [x] `cd web && bun run lint:tokens` — 0 violations

### Risks mitigated
- Commit-per-task means any step can be reset if regressions found post-merge.
```

Push branch and open PR.

---

## Self-Review Checklist (Pre-Execution)

Before handing this plan off to the implementer:

- [x] Every step has concrete file paths, not "modify the component"
- [x] Every code step contains actual code, not "similar to before"
- [x] Every command has expected output
- [x] TDD applied where meaningful (lint script); visual verification + existing test suite is the safety net for pure-UI tasks
- [x] Each task ends with typecheck + tests + lint + commit
- [x] Rollback path: `git reset --hard <task-N commit>` returns to working intermediate
- [x] Spec coverage: all 7 components + tokens + lint + Maximize + 43 features traced to tasks 1–11
- [x] Type consistency: `HappyChatMessageMetadata.turnDurationMs` defined once in Task 4 Step 1, consumed in Task 4 Step 3

## Known Gaps (Accepted)

- **Sidebar diff stats placeholder** — empty span until aggregated API field lands. Per spec §7.
- **PR status on session** — if `Session.metadata` has no PR state field, all rows fall back to `'branch'` icon. Acceptable.
- **cursor-clone icons are lucide** — inline SVG paths in plan are approximations. If `@/components/icons` already has `GitBranchIcon` / `GitMergeIcon` / `GitPullRequestIcon` from a lucide wrapper, prefer those (grep to confirm at Task 10 Step 3).
