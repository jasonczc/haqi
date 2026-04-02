# Cloud Agent UI Overhaul — Cursor-Identical Design Spec

**Date:** 2026-04-02
**Scope:** Complete visual overhaul of the Cloud Agent experience (`/sessions/*` pages) to match Cursor's production design pixel-for-pixel.
**Non-scope:** Telegram Mini App theming, `/settings`, `/groups`, `/review-loops` pages. These keep their existing styles.

## 1. Design Tokens (CSS Variables)

Replace HAQI's flat color system with a semantic token system derived from 5 base colors, matching Cursor's extracted values exactly.

### 1.1 Base Colors

```css
:root {
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
}
```

### 1.2 Text Colors (4-level opacity hierarchy)

All text colors derive from `--base` using `color-mix(in oklab, ...)`:

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | base 94% | Main text, titles, active tabs |
| `--text-secondary` | base 70% | Descriptions, secondary info |
| `--text-tertiary` | base 48% | Inactive tabs, hints, timestamps |
| `--text-quaternary` | base 32% | Disabled text, ultra-subtle |

### 1.3 Background Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-chrome` | #F7F7F7 | Page background, sidebar bg |
| `--bg-editor` | #FCFCFC | Main content areas, panels |
| `--bg-elevated` | #FCFCFC | Dropdowns, popovers |
| `--bg-primary` | base 20% | Strong hover states |
| `--bg-secondary` | base 14% | Medium hover states |
| `--bg-tertiary` | base 8% | Subtle hover, selected items |
| `--bg-quaternary` | base 6% | Very subtle backgrounds |
| `--bg-quinary` | base 4% | Barely visible tints |

### 1.4 Border Colors (4-level hierarchy)

| Token | Value | Usage |
|-------|-------|-------|
| `--border-primary` | base 20% | Prominent dividers |
| `--border-secondary` | base 12% | Standard borders |
| `--border-tertiary` | base 8% | Subtle dividers (most common) |
| `--border-quaternary` | base 4% | Barely visible separators |

### 1.5 Semantic Colors

Each semantic color gets 4 bg levels + 4 border levels + 4 text levels:

| Semantic | Base | Bg | Text | Border |
|----------|------|-----|------|--------|
| success | #1F8A65 | 24%/12%/8% mix | direct | 92%/56%/42%/28% |
| warn | #C08532 | 24%/12%/8% mix | direct | same pattern |
| danger | #CF2D56 | 24%/12%/8% mix | direct | same pattern |
| brand | #F54E00 | 24%/12%/8% mix | direct | same pattern |
| accent | #3C7CAB | 24%/12%/8% mix | direct | same pattern |

### 1.6 Git Colors

| Token | Color | Usage |
|-------|-------|-------|
| `--added` | #1F8A65 | Added lines, staged files |
| `--modified` | #C08532 | Modified files |
| `--removed` | #CF2D56 | Deleted lines, removed files |
| `--untracked` | #4C7F8C | Untracked files |

### 1.7 Shadow

```css
--shadow-primary: rgba(0,0,0,0.12);
--shadow-secondary: rgba(0,0,0,0.072);
--shadow-tertiary: rgba(0,0,0,0.036);
```

### 1.8 Dark Mode

Dark mode inverts the base/chrome/editor relationship:

```css
[data-theme="dark"] {
  --sidebar: #1E1E1E;
  --chrome: #252526;
  --editor: #1E1E1E;
  --base: #FFFFFF;
  /* All derived tokens auto-update via color-mix */
}
```

## 2. Typography

### 2.1 Font Stack

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

No custom fonts. No Inter. No web fonts to load.

### 2.2 Font Scale

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `--font-size-xs` | 11px (0.6875rem) | 14px | Badges, timestamps, counters |
| `--font-size-sm` | 12px (0.75rem) | 16px | Code, secondary text, sub-tabs |
| `--font-size-base` | 13px (0.8125rem) | 18px | Everything: body, tabs, nav, inputs |
| `--font-size-lg` | 16px (1rem) | 24px | Page titles only |
| `--font-size-xl` | 20px (1.25rem) | 28px | Hero headings (rare) |

### 2.3 Font Weights

Only two weights:

| Token | Value | Usage |
|-------|-------|-------|
| `--font-weight-normal` | 400 | Body text, inactive tabs, descriptions |
| `--font-weight-semibold` | 600 | Active labels, titles, badges |

No 500 (medium). No 700 (bold). Cursor explicitly maps both `--font-weight-normal` and `--font-weight-medium` to 400.

### 2.4 Code Font

```css
--diffs-font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
--diffs-font-size: 12px;
```

## 3. Layout — Three-Column Structure

The page is a full-viewport three-column flex layout:

```
┌─────────────┬──────────────────────────┬───────────────────────┐
│  Left       │  Center                  │  Right                │
│  Sidebar    │  Chat / Conversation     │  Workbench Panel      │
│  267px      │  flex: 1                 │  ~420px (resizable)   │
│             │                          │                       │
│  Nav items  │  Title bar               │  Tab bar              │
│  Run list   │  Message thread          │  (Plan|Git|Desktop|   │
│  User card  │  Files Changed           │   Terminal)           │
│             │  Follow-up input         │  Panel content        │
│             │  Model + timer           │                       │
└─────────────┴──────────────────────────┴───────────────────────┘
```

### 3.1 Left Sidebar

- Width: **267px** fixed
- Background: `--bg-chrome` (#F7F7F7)
- Border right: `--border-tertiary`
- Internal padding: 0 (items handle their own padding)

**Top section (navigation):**
- Items: New Agent, Automations, Dashboard, Bugbot
- Each item: height 32px, padding `0 8px`, gap 8px, font-size 13px, border-radius 6px
- Active: `--bg-tertiary` background
- Icon + label layout, icons 16x16

**Run list section:**
- Date group headers: font-size 11px, uppercase, letter-spacing 0.05em, `--text-quaternary` color
- Run items: height 32px, padding `0 6px`, border-radius 6px
- Run item content: status dot (7px circle) + title (truncated) + right info (+/- counts, time)
- Status dot colors: active=`--success`, thinking=`--accent`, inactive=`--text-quaternary`
- +/- counts: font-size 10px, monospace, `--added`/`--removed` colors
- Time: font-size 10px, `--text-quaternary`
- Selected item: `--bg-tertiary` background
- Archive button: appears on hover, right-aligned

**Bottom section:**
- User avatar (28px circle) + name + plan badge
- Settings/customize button

### 3.2 Center Panel (Chat)

- Background: `--bg-editor` (#FCFCFC)
- No max-width constraint (fills available space)

**Title bar:**
- Height: ~44px
- Padding: 12px 16px
- Content: Run name (font-size 13px, weight 600) + repo name (font-size 13px, `--text-tertiary`)
- Border bottom: `--border-quaternary`

**Prompt/task area:**
- Below title bar
- Background: `--bg-quaternary` (very subtle tint)
- Padding: 10px 12px
- Border-radius: 8px
- Margin: 16px
- Font-size: 13px, `--text-secondary`

**"Worked for X" text:**
- Font-size: 13px
- `--text-primary` color
- Weight: 400

**Files Changed section:**
- Collapsible header: chevron + "105 Files Changed" (font-size 13px, weight 600)
- File list items:
  - Left: file type icon (TS/JS colored badge, 14px) + filename (13px)
  - Right: +N / -N (font-size 12px, monospace, colored)
  - Hover: `--bg-quaternary`
  - Vertical padding: 6px per item

**Follow-up input (bottom):**
- Pinned to bottom
- Border top: `--border-quaternary`
- Padding: 8px 16px
- Input: no border, no background, font-size 13px, placeholder "Add a follow up"
- Right side: model name (11px, `--text-tertiary`) + timer icon + duration (11px)
- Image attach button + voice button

### 3.3 Right Panel (Workbench)

- Width: **420px** (user-resizable via drag handle)
- Min-width: 320px
- Max-width: 50vw
- Border left: `--border-tertiary`
- Background: `--bg-editor`

**Tab bar:**
- Height: 36px (content 26px + padding)
- Tabs: Plan | Git | Desktop | Terminal
- Tab font: 13px, weight 400
- Active tab: `--text-primary` + 2px bottom border (color: `--base`)
- Inactive tab: `--text-tertiary`
- Tab padding: 0 12px
- Right side: ⋯ (more) + ↗ (expand) + ✕ (close) buttons, each 24x24, `--text-quaternary`

**Git panel header (inside workbench):**
- PR title (13px, weight 600) + PR # link (12px, `--text-accent`)
- State badge: rounded-full, 10px font, weight 600
  - Open: bg `--bg-success-secondary`, text `--success`
  - Draft: bg `--bg-quaternary`, text `--text-tertiary`
  - Merged: bg `rgba(119,84,217,0.15)`, text `#7754D9` (purple)
- Branch info: monospace 11px, `--text-tertiary`, arrow →

**Sub-tabs (Diff | Review | Commits):**
- Same pattern as main tabs but 12px font
- Counts as inline badges: danger bg for failures, neutral for commit count
- Active: 2px bottom border

**Diff content:**
- Code font: `--diffs-font-family` at 12px
- Line numbers: `--text-quaternary`
- Added lines: bg `--bg-success-quaternary`, text `--added`
- Removed lines: bg `--bg-danger-quaternary`, text `--removed`
- Hunk headers: `--text-accent`

## 4. Component Specifications

### 4.1 Buttons

**Primary:** bg `--base`, text `--editor`, border-radius 6px, padding 0 12px, height 28px, font-size 13px, weight 400
**Secondary/outline:** border `--border-secondary`, text `--text-primary`, same dimensions
**Ghost:** no border, no bg, text `--text-tertiary`, hover bg `--bg-quaternary`
**Danger:** bg `--danger`, text white

### 4.2 Badges

- Border-radius: 9999px (full round)
- Padding: 2px 8px
- Font-size: 10px or 11px
- Weight: 600
- Variants use semantic bg-secondary + text color pairs

### 4.3 Inputs

- Border: `--border-secondary`
- Border-radius: 6px
- Padding: 6px 10px
- Font-size: 13px
- Focus: border `--focus`, ring none
- Background: `--bg-editor`
- Placeholder: `--text-quaternary`

### 4.4 Dropdowns / Popovers

- Background: `--bg-elevated`
- Border: `--border-tertiary`
- Border-radius: 8px
- Shadow: `0 4px 12px var(--shadow-primary), 0 1px 3px var(--shadow-secondary)`
- Items: height 32px, padding 0 12px, hover `--bg-tertiary`

### 4.5 Scrollbars

- Width: 6px
- Track: transparent
- Thumb: base 12% opacity, hover base 20%
- Border-radius: 3px

## 5. Files to Modify

### 5.1 New: `web/src/styles/cursor-theme.css`

New CSS file containing all design tokens. Imported conditionally for cloud agent pages (not Telegram).

### 5.2 Modify: `web/src/router.tsx`

- `SessionsPage` layout: replace current sidebar + content structure with Cursor three-column layout
- Sidebar width: 267px fixed
- Remove `max-w-content` constraint from session chat
- Add resizable panel divider between chat and workbench

### 5.3 Modify: `web/src/components/SessionList.tsx`

- Item height: 32px
- Font-size: 12-13px
- Status dot: 7px
- +/- line counts in each item
- Archive button on hover
- Date group headers in uppercase 11px

### 5.4 Modify: `web/src/components/SessionChat.tsx`

- Remove max-width constraint
- Font-size: 13px base
- Follow-up input at bottom: borderless, with model + timer on right

### 5.5 Modify: `web/src/components/SessionHeader.tsx`

- Flatten to a single-line title bar: back + title + repo + PR badge
- Move workbench tab buttons into header (right side)
- Height: ~44px
- No metadata chips row (moved to workbench panel)

### 5.6 Modify: `web/src/components/RunWorkbench/*.tsx`

- Apply new design tokens throughout
- Tab bar: 13px, 400 weight, 2px bottom border for active
- Git panel: match exact Cursor sub-tab + diff viewer style

### 5.7 Modify: `web/src/components/CloudSidebar.tsx`

- Transform into the left column navigation matching Cursor's sidebar
- Top: New Agent + Automations + Dashboard + Bugbot
- Middle: run list with date groups
- Bottom: user card

## 6. Migration Strategy

The new theme applies **only** to the session/cloud agent experience. Other pages (settings, groups, review-loops) keep existing styles.

Implementation approach:
1. Create `cursor-theme.css` with all tokens
2. Apply theme class to session layout root: `<div class="cursor-theme">`
3. All new tokens scoped under `.cursor-theme { ... }`
4. Existing `--app-*` variables untouched for other pages
5. Components check for theme context and use appropriate token set

## 7. Responsive Behavior

- < 1024px: Workbench panel hidden, sidebar becomes drawer (existing mobile behavior)
- 1024-1280px: Sidebar collapses to 48px icon-only mode, workbench 360px
- > 1280px: Full three-column layout as specified

## 8. Success Criteria

- Side-by-side screenshot comparison with Cursor: visually indistinguishable layout, spacing, colors, typography
- All existing functionality preserved (session management, cloud spawn, checkpoint save, etc.)
- No visual regression on non-cloud pages
- Dark mode works with inverted token set
- Build passes, zero new TypeScript errors
