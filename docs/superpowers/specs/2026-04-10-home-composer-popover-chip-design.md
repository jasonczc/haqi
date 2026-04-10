# HomeComposer Popover-Chip Architecture

**Date:** 2026-04-10  
**Status:** Approved  
**Scope:** Replace the broken HomeComposer on `/sessions` with a fully functional, Cursor-style composer that embeds all `/sessions/new` capabilities via Popover chips.

---

## Problem

The current HomeComposer has three critical issues:

1. **Not interactive** — Native `<select>` elements styled as tool-chips are unclickable / invisible on many browsers. The `appearance: none` hack breaks platform rendering.
2. **Styling mismatch** — Components use inline styles and Tailwind utilities instead of the CSS classes defined in `cursor-theme-v2.css` (`.tool-chip`, `.prompt-card`, `.action-btn`, etc.). The visual result diverges from `cursor-clone/index.html`.
3. **Missing functionality** — Only exposes prompt, repo, agent, model, effort, yolo. The full `/sessions/new` form has 25+ settings (machine, execution backend, runtime kind, environment, checkpoint, session type, workspace mode, directory, network policy, TTL, labels, secrets, preview URL, service tier, launch mode).

## Design

### Visual Structure

Preserved from `cursor-clone/index.html` — the layout does not change:

```
content-wrapper (max-w 800px, centered)
├── home-eyebrow: "New agent"
├── repo-selector: button "Select repository ▾" → expands to repo/branch/workspace panel
├── prompt-container
│   └── prompt-card
│       ├── prompt-input (contenteditable div or textarea)
│       └── prompt-footer
│           ├── prompt-tools (left)
│           │   ├── [Model chip]  — "Claude Opus High ▾"
│           │   ├── [Cloud chip]  — "Cloud ● ▾" or "Local ▾"
│           │   └── [Config chip] — "⚙ ▾"
│           └── prompt-actions (right)
│               ├── [+ button] — attach context
│               └── [▶ button] — submit (active state when prompt non-empty)
├── action-pills: suggestion buttons
├── home-section-header: "Recent runs"
└── agent-list: session history rows
```

### HTML/CSS Classes

Every element uses the CSS class from `cursor-clone/styles.css` / `cursor-theme-v2.css`. No inline styles for layout, color, border, or spacing. Tailwind utilities only for flex behavior that complements (never overrides) the CSS class.

| Element | CSS Class | Notes |
|---------|-----------|-------|
| Wrapper | `.content-wrapper` | max-width 800px, centered |
| Repo button | `.repo-btn` | transparent bg, secondary text, chevron icon |
| Card | `.prompt-card` | border, radius, shadow from CSS |
| Input | `.prompt-input` | 13px, min-height 90px, placeholder via CSS |
| Footer | `.prompt-footer` | flex, space-between |
| Each chip | `.tool-chip` | `<button>`, not `<select>`. Transparent bg, hover bg |
| Action btns | `.action-btn` / `.action-btn.active` | 28px circle, neutral fill when active |
| Pills | `.pill-btn` | border, rounded-full, secondary text |
| Run rows | `.agent-row` | two-column: metadata-card + agent-info |

### The 4 Popover Chips

Each chip is a `<button className="tool-chip">` that toggles a Popover component anchored below it. Only one Popover open at a time.

#### Chip 1: Model

**Trigger text:** `{Agent} {ModelLabel} {EffortLabel}` (e.g. "Claude Opus High")

**Popover contents:**

| Group | Fields | UI |
|-------|--------|----|
| Agent | claude, codex, cursor, gemini, opencode | Radio button row |
| Model | Dynamic list from `MODEL_OPTIONS[agent]` | Clickable list items, selected = checkmark |
| Think Effort | Dynamic from `getThinkEffortOptions(agent)` | Pill toggle row |
| Service Tier | fast / flex (codex only) | Pill toggle row, hidden for non-codex |

#### Chip 2: Cloud

**Trigger text:** `Cloud ●` (green dot if worker active) or `Local`

**Popover contents:**

| Group | Fields | UI |
|-------|--------|----|
| Execution Backend | local / cloud-self-hosted / cloud-managed | Radio row |
| Machine | Auto or specific worker (list from `useMachines`) | Select list with status badges |
| Runtime Kind | host-process / docker-session / daemon-session | Radio row (cloud only) |
| Environment ID | Text input or dropdown from `useCloudEnvironments` | Input with suggestions |
| Checkpoint ID | Dropdown from `useCloudCheckpoints` | Select list |
| Launch Mode | interactive / background | Toggle |

When backend = local, only Machine is shown (local machines list). Cloud-specific fields hidden.

#### Chip 3: Config (⚙)

**Trigger text:** Gear icon. Badge dot if non-default settings active.

**Popover contents:**

| Group | Fields | UI |
|-------|--------|----|
| Session | type (simple/worktree/setup), worktree name | Radio + conditional input |
| Permissions | YOLO toggle | Toggle switch |
| Network | policy (default/restricted/off) | Radio row |
| Lifetime | TTL minutes | Number input |
| Metadata | Labels (comma text), Secrets (comma text) | Text inputs |
| Preview | URL, auto-detect toggle, preferred port | Input + toggle + number |

#### Repo Selector (above card, not a chip)

**Current:** `repo-btn` button above prompt-card.  
**Click behavior:** Expands inline to show:

| Field | UI |
|-------|----|
| Repository URL | Text input (pre-filled if set) |
| Branch | Text input (optional) |
| Workspace Mode | Radio: ephemeral / persistent / snapshot-derived |
| Directory | Text input (local mode only, with autocomplete) |

Press Enter or click outside to collapse back to button showing selected repo name.

### Popover Component

A single reusable `<ChipPopover>` component:

```tsx
type ChipPopoverProps = {
    open: boolean
    onClose: () => void
    anchorRef: React.RefObject<HTMLButtonElement>
    children: React.ReactNode
}
```

- Renders a portal div positioned below `anchorRef` using `getBoundingClientRect()`
- Click outside or Escape to close
- CSS class: `.chip-popover` (new class to add to cursor-theme-v2.css)
- Styling: white bg, subtle border (`--cursor-stroke-secondary`), 8px radius, shadow, max-height with scroll

### State Management

All state lives in HomeComposer as `useState` hooks — same pattern as current code but expanded to cover all 25+ fields:

```
prompt, repoUrl, repoBranch, workspaceMode, directory,
agent, model, customModel, thinkEffort, serviceTier,
executionBackend, runtimeKind, launchMode, machineId,
environmentId, checkpointId,
sessionType, worktreeName, yolo,
networkPolicy, ttlMinutes, labels, secrets,
previewUrl, previewAutoDetect, previewPreferredPort
```

Load defaults from `loadPreferredAgent()`, `loadPreferredModel()`, etc. (existing preference utilities in `NewSession/preferences.ts`).

Save preferences on successful spawn (same as NewSession's `savePreferredAgent()` etc.).

### Spawn Logic

On submit (▶ button click or Cmd+Enter):

1. Validate: prompt required. If cloud backend: machineId required (or 'auto').
2. Build `SpawnInput` object from state (reuse `resolveSpawnModel`, `resolveSpawnThinkEffort`, `resolveSpawnServiceTier` from `NewSession/spawnPayload.ts`).
3. Call `spawnSession(input)` via `useSpawnSession` hook.
4. Handle response:
   - `success` → navigate to `/sessions/$sessionId`
   - `accepted` → navigate to `/settings/requests/$requestId`
   - `error` → show error below prompt-card

### Data Hooks

Reuse existing hooks, all called within HomeComposer:

- `useCloudWorkers(api, true)` — for cloud chip worker list
- `useMachines(api, true)` — for machine selector
- `useCloudEnvironments(api)` — for environment dropdown
- `useCloudCheckpoints(api)` — for checkpoint dropdown
- `useSpawnSession(api)` — for spawn mutation

### File Changes

| File | Change |
|------|--------|
| `web/src/router.tsx` | Rewrite `HomeComposer` function (~200 lines → ~400 lines) |
| `web/src/components/ChipPopover.tsx` | **New file.** Reusable popover component (~80 lines) |
| `web/src/styles/cursor-theme-v2.css` | Add `.chip-popover` styles (~30 lines) |

### What We Are NOT Changing

- Sidebar structure and behavior
- Session chat page
- Settings pages
- `/sessions/new` route (kept as fallback, not removed)
- Backend spawn endpoints (already fixed for host-process)
- Recent runs (agent-list) section at bottom

## Success Criteria

1. All 25+ settings from `/sessions/new` are accessible from the `/sessions` homepage
2. Every visual element uses CSS classes from `cursor-theme-v2.css`, matching `cursor-clone/index.html`
3. No native `<select>` elements — all dropdowns are custom Popover components
4. Popover open/close is smooth (click chip to toggle, click outside to close, Escape to close)
5. Spawn works end-to-end: prompt → configure → submit → session opens
6. Preferences persist across page reloads via localStorage
