# Cursor UI Full Component Rewrite Design

Rewrite the 7 chat-path components so they strictly follow the cursor-clone design tokens and agent presentation patterns. Functionality must be preserved 100%; this change is purely visual/structural. Replaces the ad-hoc densities that have drifted from `web/src/styles/cursor-theme.css`.

## Goals

- Every sizing, spacing, color, and typography decision in the 7 components sources from a token in `cursor-theme.css` — no hardcoded `px`, no hardcoded hex.
- Visual layout matches `cursor-clone/chat.html` + `cursor-clone/styles.css` within ≤ 2px hairline tolerance.
- All 43 features listed in §5 keep working identically (no regressions).
- A lint rule prevents this drift from happening again.

## Non-Goals (explicit)

- No backend / API changes (in particular: sidebar diff stats are placeholder-only until an aggregated `linesAdded/linesRemoved` field is added in a separate ticket).
- No changes to `@assistant-ui/react` integration (`useHappyRuntime`, `AssistantRuntimeProvider`, `ThreadPrimitive` stay).
- No changes to data-layer modules: `chat/reducer.ts`, `chat/reconcile.ts`, `chat/normalize*.ts`, `chat/tracer.ts`.
- No router changes.
- No changes to `components/ui/*` primitives (Dialog, Toast, Popover, Button, ConfirmDialog, StatusDot, ChecklistStatusIcon).
- No changes to the Terminal (xterm), Files (file tree), or Preview (iframe) implementations inside RunWorkbench.
- No changes to `reducerTimeline`, `reducerEvents`, `reducerTools`, `reducerCliOutput`.
- No changes to mobile brief-mode routing/interaction logic (only visual re-skin).

## Scope: 7 Components

Ordered by dependency; must land in one PR as commit-per-step so any step can be reset.

| # | Component | File(s) | What changes |
|---|-----------|---------|--------------|
| 1 | SessionHeader | `web/src/components/SessionHeader.tsx` | 44px navbar (was 60px); left: back + status-dot + title/repo; right: Save / Workbench / More icon-btns |
| 2 | UserMessage | `web/src/components/AssistantChat/messages/UserMessage.tsx` | Full-width white card (12px radius, 1px border) replacing right-aligned gray bubble; new `agent-status` line under card showing "Worked for Xs" |
| 3 | AssistantMessage + ToolMessage + Reasoning | `web/src/components/AssistantChat/messages/AssistantMessage.tsx`, `.../ToolMessage.tsx`, `web/src/components/assistant-ui/reasoning.tsx` | 13/18 prose; ToolCard/Reasoning re-skinned as secondary blocks; **fold/unfold behavior preserved** (not forced to default-collapse) |
| 4 | HappyComposer + StatusBar + ComposerButtons | `web/src/components/AssistantChat/HappyComposer.tsx`, `.../StatusBar.tsx`, `.../ComposerButtons.tsx` | White card (16px radius), top linear-gradient fade, StatusBar becomes an internal header row, chip-row of permission/model/think/service on left, icon-btns on right |
| 5 | HappyThread + BriefTurnList | `web/src/components/AssistantChat/HappyThread.tsx`, `.../BriefTurnList.tsx` | Wrap messages in `.chat-round` (grouped by turnId); 16/24 timeline padding; 40px between rounds, 24px within |
| 6 | RunWorkbench (right panel) | `web/src/components/RunWorkbench/*` | cursor `.context-header` tabs + new Maximize mode; Terminal/Files/Preview functionality unchanged |
| 7 | SessionList / Sidebar | `web/src/components/SessionList.tsx` | Each row: git icon + title + hover-archive; diff stats placeholder (no data yet); nav rows match cursor density |

## Token Additions (in `web/src/styles/cursor-theme.css`)

These semantic layout tokens are missing today and must be added before step 3:

```css
/* Chat timeline */
--chat-timeline-padding-y: 16px;
--chat-timeline-padding-x: 24px;
--chat-round-gap: 40px;
--chat-round-gap-internal: 24px;
--chat-message-gap: 12px;
--chat-content-max: 720px;

/* User prompt card */
--user-card-radius: 12px;
--user-card-padding-y: 12px;
--user-card-padding-x: 16px;
--user-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);

/* Composer */
--composer-radius: 16px;
--composer-padding-top: 12px;
--composer-padding-right: 12px;
--composer-padding-bottom: 8px;
--composer-padding-left: 16px;
--composer-fade-height: 80px;

/* Context panel */
--context-panel-width: 440px;
--context-tab-gap: 16px;
```

Dark-mode values inherit automatically (shadows and color-mix tokens already swap via `[data-theme="dark"]`).

## Agent Design Pattern Mapping

Cursor conventions we must adopt, even when haqi has extra structure.

| Cursor convention | Current haqi | New haqi |
|-------------------|--------------|----------|
| `.chat-round` wraps one user + one assistant turn | Flat `ThreadPrimitive.Messages` list | Group messages by `turnId`; emit `<div class="chat-round">` per turn |
| User card full-width with trailing `agent-status` line "Worked for 1m 14s" | Right-aligned 88% gray bubble | Full-width white card; compute duration from `ConversationTurn.createdAt` / `updatedAt` (live counter if `status === 'open'`) |
| Assistant = plain prose, 4px left padding | Body with `chat-message-agent-body` padding | Keep 4px left padding; strip any additional container background |
| Composer absolute-positioned at bottom + linear-gradient fade | Flex-bottom, no fade | `position: absolute; bottom: 0`; timeline ends in `.chat-timeline-spacer` (120px) |
| Header = title + repo subtitle only | Back + status-dot + title + Save + Workbench + More | Retain all buttons but fit into 44px navbar with 28×28 icon-btns |
| Context panel tabs left + (more/maximize/toggle) right | Tabs-only header | Add maximize icon + wire `.layout-maximized` state |
| Sidebar row = git icon + title + diff stats + hover archive | StatusDot + title | Replace StatusDot with git icon (branch/merge/pull-request based on session PR state); diff stats = placeholder; archive on hover |

## Feature Preservation Matrix (43 items, zero loss)

### SessionHeader
1. Back button
2. StatusDot (running/idle)
3. Session title (from `metadata.name` / `summary.text` / `path`)
4. Repo short name from `repositoryUrl`
5. Save checkpoint (container-only)
6. Workbench toggle
7. SessionActionMenu (rename / archive / delete / duplicate / spawn-same / save-checkpoint)

### UserMessage
8. Markdown text rendering via `LazyRainbowText`
9. Attachment previews via `MessageAttachments`
10. Retry for failed sends (`status === 'failed'`, `localId`, `onRetryMessage`)
11. Status indicator (sending/queued/sent/failed) — consolidated into the trailing `agent-status` line prefix
12. CLI output kind rendered via `CliOutputBlock`

### AssistantMessage
13. MarkdownText body
14. Reasoning block (single)
15. ReasoningGroup (multi, with "Thought for Xs" header)
16. ToolMessage — all subtypes: Bash, Read, Edit, MultiEdit, Write, Glob, Grep, Task, TodoWrite, WebFetch, WebSearch, Notebook*, BashOutput, KillShell
17. QuestionToolOverlay (permission prompt overlay)
18. PlanApprovalOverlay (plan-mode overlay)
19. CliOutputBlock (assistant kind)
20. Markdown tables styled as `.agent-table`

### HappyComposer
21. Textarea with draft persistence (`hapi:sessionComposerDraft:*`)
22. StatusBar: active/thinking/context size/voice/permission/model/agent flavor/collaboration mode
23. Permission-mode dropdown (flavor-aware)
24. Model dropdown
25. Think-effort dropdown (auto/low/medium/high/max/xhigh)
26. Service-tier dropdown (auto/fast/flex)
27. Inline queue panel (pending / running / in-queue / entries list / open-dialog button)
28. Attachment upload + preview + delete
29. Suggestions / Autocomplete (FloatingOverlay)
30. Voice session (`RealtimeVoiceSession`) start/stop with error banner
31. CLI send mode toggle (direct/queue)
32. Paste/drop attachments
33. Enter-behavior preference
34. Skill-usage tracking

### HappyThread / BriefTurnList
35. Message list rendering via `ThreadPrimitive.Messages`
36. JumpToLatest / new-message indicator
37. History load-more (infinite scroll up)
38. Skeleton loading state
39. Brief mode (mobile, `briefTurnId` query parameter)
40. LiveActivityBar (folded into the trailing `agent-status` line during open turns)
41. Scroll position persistence (`sessionScrollState`)

### RunWorkbench
42. Terminal (xterm) tab, Files tab, Preview tab — all unchanged internally
43. **New**: Maximize mode (sidebar + chat-main hidden, workbench takes full viewport)

Plus cross-cutting: i18n (`useTranslation`), dark mode (`[data-theme="dark"]` via `cursor-theme.css`).

## ESLint Rule

Add `no-restricted-syntax` entries in `web/.eslintrc` targeting the 7 components, rejecting:
- `JSXAttribute[name.name="className"]` values matching `/\b(min-h-|max-h-|h-|w-|p[xy]?-|m[xy]?-|gap-|rounded-)\[\d+(?:\.\d+)?(?:px|rem)\]/` — force token usage instead of hardcoded Tailwind arbitrary values.
- `Literal` color values matching `/^#[0-9a-fA-F]{3,8}$/` in `className` — must come from `var(--*)` tokens.

Whitelist exceptions: pre-existing third-party wrapper CSS files (e.g., xterm defaults).

## Data Gaps & Fallbacks

1. **Sidebar diff stats** — Session metadata lacks aggregated `linesAdded/linesRemoved`. Solution: render the diff-stats slot as an empty placeholder `<span>` that keeps layout height reserved; a follow-up ticket adds the API field and enables the span. No visible regression (cursor-clone shows it, haqi shows nothing for now).
2. **"Worked for Xs" duration** — `ConversationTurn` has `createdAt`/`updatedAt` + `status`. For `status: 'closed'` → `(updatedAt - createdAt) ms`. For `status: 'open'` → live counter (1s tick) from `createdAt` until close.

## Implementation Sequence

One PR, one commit per step (easy rollback):

1. Extend `cursor-theme.css` with the §4 tokens.
2. Add ESLint rule + scope the 7 components.
3. Rewrite `SessionHeader`.
4. Rewrite `UserMessage` + `AssistantMessage`.
5. Re-skin `Reasoning` + `ToolMessage`.
6. Rewrite `HappyComposer` + `StatusBar` + `ComposerButtons`.
7. Rewrite `HappyThread` + `BriefTurnList` (introduce `.chat-round` grouping by `turnId`).
8. Rewrite `RunWorkbench` (add Maximize).
9. Rewrite `SessionList` / Sidebar.
10. Visual-regression pass: diff side-by-side against `haqi-polish-*.png` and `cursor-clone/chat.html` screenshots; paste the comparison into the PR description.

## Pre-work Spike (before step 7)

`.chat-round` grouping requires a stable `turnId` for each rendered message. Must verify:
- `@assistant-ui` messages carry a custom metadata field we can use (inspect `HappyChatMessageMetadata`), OR
- Reconstruct grouping from `NormalizedMessage.turnIndex` / timeline reducer output before handing to `ThreadPrimitive`.

If neither works, fall back to DOM-level grouping via data attributes added in the message adapter — decided during spike.

## Validation

### Functional (must all pass)
- Run full `vitest` suite: `BriefTurnList`, `reducerTimeline`, `SessionList`, `LoginPrompt`, `GitDiffViewer`, `terminal`, `TeamPanel`, `normalizeAgent`, `reducer`, `tracer`, `briefTurnPresentation`, `historyScroll`, `sessionGroupOrder`.
- Smoke-test the 43 features manually with the running dev server; record pass/fail per feature in the PR description.

### Visual (must all pass)
- Side-by-side with `cursor-clone/chat.html` at 1440×900: navbar height, timeline padding, round gaps, user-card dimensions, composer corner radius all match within 2px.
- Dark mode: toggle via `data-theme="dark"` on `<html>`; verify no color regression.
- Mobile (375×812): brief mode still works; header collapses correctly; composer keyboard-safe.

### Governance (must all pass)
- ESLint run is clean on all 7 components.
- `grep -rE '\[\d+(px|rem)\]' web/src/components/{SessionHeader,AssistantChat/messages,AssistantChat/HappyComposer,AssistantChat/HappyThread,AssistantChat/BriefTurnList,RunWorkbench,SessionList}*.tsx` returns zero matches.

## Risks

| Risk | Mitigation |
|------|-----------|
| Large PR (~3000 LOC) hard to review | Commits per step 1–10; each step self-contained |
| `.chat-round` grouping not directly supported by `@assistant-ui` primitives | Pre-work spike in §8 before step 7 |
| Maximize mode conflicts with existing `min-h-dvh` and keyboard-avoidance logic | First smoke test in step 8 |
| ESLint rule false positives on legitimate one-off px usage | Rule scoped to the 7 components only; not repo-wide |
| Feature regression slips past smoke test | 43-item checklist pasted into PR description; reviewer signs off line-by-line |

## Rollback

If any step breaks, `git reset --hard <commit-of-previous-step>` returns to a working intermediate. The tokens + ESLint commits (steps 1–2) are independently useful and should stay even if higher steps are reverted.
