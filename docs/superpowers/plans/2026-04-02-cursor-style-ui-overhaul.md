# Cursor-Style UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the HAQI Cloud Agent session experience to be visually identical to Cursor's production UI — same colors, fonts, spacing, layout, and component styles.

**Architecture:** Scoped CSS theme (`.cursor-theme` class) containing Cursor's design tokens applied to the sessions layout root. The three-column layout (267px sidebar + flex chat + 420px workbench) replaces the current two-pane layout. Components are restyled in-place using the new tokens. Non-session pages are unaffected.

**Tech Stack:** CSS custom properties with `color-mix(in oklab)`, Tailwind utility classes, React components, existing Vite/PostCSS pipeline.

---

### Task 1: Create the Cursor Theme CSS

**Files:**
- Create: `web/src/styles/cursor-theme.css`
- Modify: `web/src/index.css` (add import at top)

- [ ] **Step 1: Create the theme file with all design tokens**

Create `web/src/styles/cursor-theme.css`:

```css
/* Cursor-identical design tokens — scoped to .cursor-theme */

.cursor-theme {
  /* ── Base palette ─────────────────────────────── */
  --sidebar: #F3F3F3;
  --chrome: #F7F7F7;
  --editor: #FCFCFC;
  --base: #141414;
  --brand: #F54E00;
  --accent: #3C7CAB;
  --focus: #3C7CAB;
  --success: #1F8A65;
  --warn: #C08532;
  --danger: #CF2D56;
  --added: #1F8A65;
  --modified: #C08532;
  --removed: #CF2D56;
  --untracked: #4C7F8C;

  /* ── Text (4-level hierarchy) ─────────────────── */
  --text-primary: color-mix(in oklab, var(--base) 94%, transparent);
  --text-secondary: color-mix(in oklab, var(--base) 70%, transparent);
  --text-tertiary: color-mix(in oklab, var(--base) 48%, transparent);
  --text-quaternary: color-mix(in oklab, var(--base) 32%, transparent);

  /* ── Backgrounds ──────────────────────────────── */
  --bg-chrome: var(--chrome);
  --bg-editor: var(--editor);
  --bg-sidebar: var(--sidebar);
  --bg-elevated: var(--editor);
  --bg-primary: color-mix(in oklab, var(--base) 20%, transparent);
  --bg-secondary: color-mix(in oklab, var(--base) 14%, transparent);
  --bg-tertiary: color-mix(in oklab, var(--base) 8%, transparent);
  --bg-quaternary: color-mix(in oklab, var(--base) 6%, transparent);
  --bg-quinary: color-mix(in oklab, var(--base) 4%, transparent);

  /* Semantic backgrounds */
  --bg-success: var(--success);
  --bg-success-secondary: color-mix(in oklab, var(--success) 24%, transparent);
  --bg-success-tertiary: color-mix(in oklab, var(--success) 12%, transparent);
  --bg-success-quaternary: color-mix(in oklab, var(--success) 8%, transparent);
  --bg-warn: var(--warn);
  --bg-warn-secondary: color-mix(in oklab, var(--warn) 24%, transparent);
  --bg-warn-tertiary: color-mix(in oklab, var(--warn) 12%, transparent);
  --bg-warn-quaternary: color-mix(in oklab, var(--warn) 8%, transparent);
  --bg-danger: var(--danger);
  --bg-danger-secondary: color-mix(in oklab, var(--danger) 24%, transparent);
  --bg-danger-tertiary: color-mix(in oklab, var(--danger) 12%, transparent);
  --bg-danger-quaternary: color-mix(in oklab, var(--danger) 8%, transparent);
  --bg-brand: var(--brand);
  --bg-brand-secondary: color-mix(in oklab, var(--brand) 24%, transparent);
  --bg-brand-tertiary: color-mix(in oklab, var(--brand) 12%, transparent);
  --bg-accent: var(--accent);
  --bg-accent-secondary: color-mix(in oklab, var(--accent) 24%, transparent);
  --bg-accent-tertiary: color-mix(in oklab, var(--accent) 12%, transparent);

  /* Neutral button */
  --bg-neutral: var(--base);
  --bg-neutral-hover: color-mix(in oklab, var(--chrome) 10%, var(--base));

  /* ── Borders (4-level hierarchy) ──────────────── */
  --border-primary: color-mix(in oklab, var(--base) 20%, transparent);
  --border-secondary: color-mix(in oklab, var(--base) 12%, transparent);
  --border-tertiary: color-mix(in oklab, var(--base) 8%, transparent);
  --border-quaternary: color-mix(in oklab, var(--base) 4%, transparent);
  --border-focus: var(--focus);
  --border-success: color-mix(in oklab, var(--success) 56%, transparent);
  --border-danger: color-mix(in oklab, var(--danger) 56%, transparent);

  /* ── Shadows ──────────────────────────────────── */
  --shadow-primary: rgba(0,0,0,0.12);
  --shadow-secondary: rgba(0,0,0,0.072);
  --shadow-tertiary: rgba(0,0,0,0.036);

  /* ── Typography ───────────────────────────────── */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --font-size-xs: 0.6875rem;  /* 11px */
  --font-size-sm: 0.75rem;    /* 12px */
  --font-size-base: 0.8125rem;/* 13px */
  --font-size-lg: 1rem;       /* 16px */
  --font-size-xl: 1.25rem;    /* 20px */
  --line-height-xs: 0.875rem;
  --line-height-sm: 1rem;
  --line-height-base: 1.125rem;
  --line-height-lg: 1.5rem;
  --line-height-xl: 1.75rem;
  --font-weight-normal: 400;
  --font-weight-semibold: 600;

  /* ── Layout ───────────────────────────────────── */
  --sidebar-width: 267px;
  --workbench-width: 420px;
  --workbench-min-width: 320px;
  --navbar-height: 2.75rem;

  /* Apply base styles */
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  color: var(--text-primary);
  background: var(--bg-chrome);
}

/* ── Dark mode ────────────────────────────────── */
[data-theme="dark"] .cursor-theme,
.cursor-theme[data-theme="dark"] {
  --sidebar: #1E1E1E;
  --chrome: #252526;
  --editor: #1E1E1E;
  --base: #FFFFFF;
}

/* ── Scrollbars ───────────────────────────────── */
.cursor-theme ::-webkit-scrollbar { width: 6px; height: 6px; }
.cursor-theme ::-webkit-scrollbar-track { background: transparent; }
.cursor-theme ::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--base) 12%, transparent);
  border-radius: 3px;
}
.cursor-theme ::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklab, var(--base) 20%, transparent);
}
```

- [ ] **Step 2: Import the theme in index.css**

At the top of `web/src/index.css`, after `@import "tailwindcss";` and `@config`, add:

```css
@import "./styles/cursor-theme.css";
```

- [ ] **Step 3: Verify build passes**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 4: Commit**

```bash
git add web/src/styles/cursor-theme.css web/src/index.css
git commit -m "feat(web): add Cursor-identical design token system

Scoped under .cursor-theme class. Includes color-mix(in oklab) 4-level
hierarchy for text/bg/border, semantic colors, typography scale (13px base),
dark mode, and custom scrollbars."
```

---

### Task 2: Restructure SessionsPage to Three-Column Layout

**Files:**
- Modify: `web/src/router.tsx` — `SessionsPage` function (~line 273-570)

This is the biggest structural change. The current `SessionsPage` has a two-column layout (sidebar + content). We need to wrap it in `.cursor-theme` and restructure to three columns.

- [ ] **Step 1: Read the current SessionsPage layout**

Read `web/src/router.tsx` lines 273-570 to understand the current `renderSidebarContent` and the flex container structure.

- [ ] **Step 2: Wrap the session layout root in cursor-theme**

Find the outermost `<div>` in `SessionsPage` return JSX and add `className="cursor-theme"`. Change the layout from:

```
flex h-full
├── sidebar (var(--sessions-sidebar-width))
│   ├── tab switcher (Sessions | Groups | Cloud)
│   └── session list
├── resize handle
└── content (flex-1)
    └── Outlet (SessionChat or NewSession)
```

to:

```
cursor-theme flex h-full
├── left sidebar (w-[267px], bg-[var(--bg-chrome)])
│   ├── nav items (New Agent, Automations, Dashboard)
│   ├── run list (sessions grouped by date)
│   └── user card bottom
├── center (flex-1, bg-[var(--bg-editor)])
│   └── Outlet (SessionChat)
└── workbench panel (w-[420px], border-l)
    └── RunWorkbench (already integrated from previous work)
```

Key changes in the JSX:
- Add `cursor-theme` class to root div
- Change sidebar background from `var(--app-bg)` to `var(--bg-chrome)`
- Change sidebar width from `var(--sessions-sidebar-width)` to `var(--sidebar-width)`
- Remove the Sessions/Groups/Cloud tab switcher from sidebar (Cloud nav is now part of the sidebar itself)
- Remove `max-w-content` from all child containers
- Apply `bg-[var(--bg-editor)]` to the center content area

- [ ] **Step 3: Update sidebar container styles**

Replace the sidebar div styles. Current:
```tsx
className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]"
```

New:
```tsx
className="flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border-tertiary)] bg-[var(--bg-chrome)]"
```

- [ ] **Step 4: Add navigation items at sidebar top**

Before the session list, add the Cursor-style nav buttons:

```tsx
<nav className="flex flex-col gap-0.5 px-2 pt-2 pb-1">
  <button className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
    <svg width="16" height="16" ...>/* pencil icon */</svg>
    <span className="font-semibold">New Agent</span>
  </button>
  <button onClick={() => navigate({ to: '/cloud/automations' })}
    className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]">
    <svg width="16" height="16" ...>/* calendar icon */</svg>
    Automations
  </button>
  <button onClick={() => navigate({ to: '/cloud/dashboard' })}
    className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]">
    <svg width="16" height="16" ...>/* grid icon */</svg>
    Dashboard
  </button>
</nav>
```

- [ ] **Step 5: Apply bg-editor to center content area**

Find the content `<div>` that renders `<Outlet />` and set:
```tsx
className="flex-1 bg-[var(--bg-editor)] overflow-hidden"
```

- [ ] **Step 6: Verify build passes**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 7: Commit**

```bash
git add web/src/router.tsx
git commit -m "feat(web): restructure sessions to Cursor three-column layout

Wraps session pages in .cursor-theme scope. Sidebar is 267px with nav items
(New Agent, Automations, Dashboard). Center panel uses --bg-editor. Removes
max-w-content constraint."
```

---

### Task 3: Restyle SessionList Items

**Files:**
- Modify: `web/src/components/SessionList.tsx` — `SessionItem` function (~line 322-510)

- [ ] **Step 1: Read the current SessionItem component**

Read `web/src/components/SessionList.tsx` lines 322-510 to understand the current layout and CSS classes.

- [ ] **Step 2: Restyle the session item button**

Replace the item container classes. Current `session-list-item` class uses variable padding based on density. New style matches Cursor exactly:

```tsx
className={`flex w-full items-center gap-2 rounded-[6px] px-1.5 py-0 text-left transition-colors select-none h-8 ${
  selected ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-quaternary)]'
}`}
```

- [ ] **Step 3: Restyle the status dot**

Change from 8px to 7px, and use new semantic colors:
```tsx
<span className={`h-[7px] w-[7px] rounded-full ${
  effectiveThinking ? 'bg-[var(--accent)]' :
  effectiveActive ? 'bg-[var(--success)]' :
  'bg-[var(--text-quaternary)]'
}`} />
```

- [ ] **Step 4: Restyle item text and right info**

Session name: `text-[var(--font-size-base)] text-[var(--text-primary)] truncate`
Right side counts: `text-[var(--font-size-xs)] font-mono`
Added: `text-[var(--added)]`
Removed: `text-[var(--removed)]`
Time: `text-[var(--font-size-xs)] text-[var(--text-quaternary)]`

- [ ] **Step 5: Restyle group headers**

Date group labels:
```tsx
className="px-2 py-1 text-[var(--font-size-xs)] uppercase tracking-[0.05em] text-[var(--text-quaternary)]"
```

- [ ] **Step 6: Remove the metadata row (model, worktree info)**

In Cursor's sidebar, session items are single-line. Remove the `!isCompact` metadata row that shows agent, model, worktree info. This info moves to the session header / workbench panel.

- [ ] **Step 7: Add hover archive button**

Add a hidden archive button that appears on hover:
```tsx
<button
  className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
  onClick={(e) => { e.stopPropagation(); handleArchive(); }}
>
  <svg width="12" height="12" ...>/* x or archive icon */</svg>
</button>
```

Add `group` class to the parent button to enable `group-hover`.

- [ ] **Step 8: Verify build and check visually**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 9: Commit**

```bash
git add web/src/components/SessionList.tsx
git commit -m "feat(web): restyle session list items to Cursor design

32px height, 7px status dot, 13px font, hover archive button,
uppercase date group headers. Removes metadata row from items."
```

---

### Task 4: Restyle SessionHeader as Flat Title Bar

**Files:**
- Modify: `web/src/components/SessionHeader.tsx`

- [ ] **Step 1: Read the current SessionHeader**

Read `web/src/components/SessionHeader.tsx` lines 333-380 (the return JSX) to understand the current layout.

- [ ] **Step 2: Flatten to single-line title bar**

Replace the current multi-row header with a single-line bar matching Cursor:

```tsx
<div className="flex items-center h-11 border-b border-[var(--border-quaternary)] bg-[var(--bg-editor)] px-4">
  {/* Left: title + repo */}
  <div className="flex items-center gap-2 min-w-0 flex-1">
    <span className="text-[var(--font-size-base)] font-semibold text-[var(--text-primary)] truncate">
      {title}
    </span>
    {repositoryUrl && (
      <span className="text-[var(--font-size-base)] text-[var(--text-tertiary)] truncate">
        {extractRepoName(repositoryUrl)}
      </span>
    )}
  </div>
  {/* Right: workbench tabs inline */}
  {/* (tabs are rendered by RunWorkbench, just keep the toggle button) */}
</div>
```

- [ ] **Step 3: Remove the metadata chips row**

Delete the entire `flex flex-wrap items-center gap-x-3` div that renders executionBackend, runtimeKind, workspaceId, containerId, etc. This info is now in the workbench panel.

- [ ] **Step 4: Remove the action button row (preview, desktop, terminal, files, checkpoint, mcp)**

These are now handled by the workbench panel tabs. Remove the individual icon buttons. Keep only the more-menu (⋯) button.

- [ ] **Step 5: Verify build**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 6: Commit**

```bash
git add web/src/components/SessionHeader.tsx
git commit -m "feat(web): flatten session header to Cursor-style title bar

Single-line: title + repo name. Removes metadata chips and action buttons
(moved to workbench panel)."
```

---

### Task 5: Restyle SessionChat (Center Panel)

**Files:**
- Modify: `web/src/components/SessionChat.tsx`

- [ ] **Step 1: Read SessionChat return JSX**

Read `web/src/components/SessionChat.tsx` lines 1310-1470 to see the layout structure.

- [ ] **Step 2: Remove max-width constraint**

Find all instances of `max-w-content` in SessionChat and replace with full-width. The chat now fills the center column without a 720px cap.

Search for: `mx-auto w-full max-w-content`
Replace with: `w-full`

- [ ] **Step 3: Restyle inactive session banner**

Current: `bg-[var(--app-subtle-bg)] p-3 text-sm text-[var(--app-hint)]`
New: `bg-[var(--bg-quaternary)] p-2.5 text-[var(--font-size-base)] text-[var(--text-tertiary)] rounded-lg`

- [ ] **Step 4: Restyle the composer (HappyComposer area)**

The composer sits at the bottom. Its container should match:
- Border top: `border-[var(--border-quaternary)]`
- Padding: `px-4 py-2`
- No background (transparent over --bg-editor)
- Font-size: 13px

- [ ] **Step 5: Verify build**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 6: Commit**

```bash
git add web/src/components/SessionChat.tsx
git commit -m "feat(web): restyle session chat to Cursor center panel

Removes max-width constraint, applies Cursor tokens to banner and composer."
```

---

### Task 6: Restyle RunWorkbench Panel

**Files:**
- Modify: `web/src/components/RunWorkbench/RunWorkbench.tsx`
- Modify: `web/src/components/RunWorkbench/GitPanel.tsx`

- [ ] **Step 1: Update RunWorkbench tab bar**

Replace the tab bar styles in `WorkbenchTabBar`:

Tab button classes:
```tsx
className={`relative px-3 py-1.5 text-[var(--font-size-base)] transition-colors ${
  props.activeTab === tab.key
    ? 'text-[var(--text-primary)]'
    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
}`}
```

Active indicator:
```tsx
{props.activeTab === tab.key && (
  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--base)]" />
)}
```

Right-side buttons (more, expand, close): `text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]`

- [ ] **Step 2: Update RunWorkbench container**

```tsx
className="flex h-full flex-col border-l border-[var(--border-tertiary)] bg-[var(--bg-editor)]"
```

- [ ] **Step 3: Update GitPanel PR header**

PR title: `text-[var(--font-size-base)] font-semibold text-[var(--text-primary)]`
PR number link: `text-[var(--font-size-sm)] text-[var(--accent)]`
State badge colors:
- Open: `bg-[var(--bg-success-secondary)] text-[var(--success)]`
- Draft: `bg-[var(--bg-quaternary)] text-[var(--text-tertiary)]`
- Merged: `bg-[rgba(119,84,217,0.15)] text-[#7754D9]`
Branch info: `font-mono text-[var(--font-size-xs)] text-[var(--text-tertiary)]`

- [ ] **Step 4: Update GitPanel sub-tabs**

Sub-tab font: `text-[var(--font-size-sm)]` (12px instead of 13px)
Active: `text-[var(--text-primary)]` + 2px bottom border `bg-[var(--base)]`
Inactive: `text-[var(--text-tertiary)]`
Failure count badge: `bg-[var(--bg-danger-secondary)] text-[var(--danger)]`

- [ ] **Step 5: Update diff viewer colors**

Added lines: `bg-[var(--bg-success-quaternary)] text-[var(--added)]`
Removed lines: `bg-[var(--bg-danger-quaternary)] text-[var(--removed)]`
Hunk headers: `text-[var(--accent)]`
Code font: `font-[var(--font-mono)] text-[var(--font-size-sm)]`

- [ ] **Step 6: Update FilesChangedList colors**

File status icons use `var(--added)`, `var(--modified)`, `var(--removed)`, `var(--untracked)`
+/- counts: same tokens
Container border: `var(--border-tertiary)`

- [ ] **Step 7: Verify build**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 8: Commit**

```bash
git add web/src/components/RunWorkbench/
git commit -m "feat(web): restyle workbench panel to Cursor design tokens

Tab bar: 13px font, 2px bottom indicator, text-tertiary inactive.
Git panel: Cursor state badge colors, 12px sub-tabs, oklab diff colors."
```

---

### Task 7: Transform CloudSidebar into Cursor Left Column

**Files:**
- Modify: `web/src/components/CloudSidebar.tsx`

The current CloudSidebar is used for `/cloud/*` routes only. For the session experience, the sidebar from Task 2 handles navigation. But we still need to restyle CloudSidebar for when users visit `/cloud/dashboard`, `/cloud/automations`, etc.

- [ ] **Step 1: Read current CloudSidebar**

Read `web/src/components/CloudSidebar.tsx` to understand the current nav items and layout.

- [ ] **Step 2: Apply Cursor tokens to CloudSidebar**

Replace the container:
```tsx
className="flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border-tertiary)] bg-[var(--bg-chrome)]"
```

Nav items:
```tsx
className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] transition-colors ${
  isActive
    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-primary)]'
}`}
```

Counts: `text-[var(--font-size-xs)] text-[var(--text-quaternary)]`

- [ ] **Step 3: Wrap CloudLayout in cursor-theme**

In `router.tsx`, the `CloudLayout` function:
```tsx
function CloudLayout() {
    return (
        <div className="cursor-theme flex h-full">
            <CloudSidebar />
            <div className="flex-1 overflow-y-auto bg-[var(--bg-editor)]">
                <Outlet />
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Verify build**

Run: `bun run --filter hapi-web build`
Expected: builds without errors

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CloudSidebar.tsx web/src/router.tsx
git commit -m "feat(web): restyle CloudSidebar with Cursor design tokens

267px width, --bg-chrome background, 6px radius nav items, cursor-theme
wrapper on CloudLayout."
```

---

### Task 8: Visual Verification and Polish

**Files:**
- Possibly any file from Tasks 1-7

- [ ] **Step 1: Start dev server and compare screenshots**

Run: `bun run dev`
Open http://localhost:5173 in browser.
Navigate to a session detail page.

- [ ] **Step 2: Take screenshot and compare with Cursor reference**

Open the saved `cursor-run-detail-hires.png` side by side with the live HAQI page.
Check: sidebar width, font sizes, colors, tab bar, workbench panel, spacing.

- [ ] **Step 3: Fix any remaining discrepancies**

Common things to check:
- Font sizes (should all be 13px base)
- Border opacity levels (should be very subtle)
- Background colors (chrome vs editor)
- Tab active state (2px bottom border, not background change)
- Status dot size (7px)
- Badge border-radius (9999px full round)

- [ ] **Step 4: Verify dark mode**

Toggle dark mode via `[data-theme="dark"]` attribute.
Check that all `color-mix` tokens properly invert.

- [ ] **Step 5: Verify no regression on other pages**

Navigate to `/settings`, `/groups`, `/review-loops`.
Confirm they still use the original `--app-*` tokens and are visually unchanged.

- [ ] **Step 6: Run full test suite**

Run: `bun run --filter hapi-web test`
Expected: same pass/fail count as before (2 pre-existing failures in NewSession and Settings tests)

- [ ] **Step 7: Final build check**

Run: `bun run --filter hapi-web build`
Expected: builds without errors, no new warnings

- [ ] **Step 8: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(web): visual polish for Cursor-style UI overhaul

Fine-tune spacing, colors, and border weights after side-by-side comparison."
```
