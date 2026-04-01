# Cloud Pages Layout Redesign

## Overview

Restructure all Cloud pages (Workers, Containers, Checkpoints, Secrets, Requests, Workspaces) from standalone full-width pages into a sidebar + content layout matching the Sessions page pattern.

## Problem

Cloud pages use a completely different layout from the rest of the app:
- Sessions: left sidebar (list + tabs) + right content area
- Cloud: standalone full-width pages with no sidebar, no sub-navigation

This creates a jarring UX when switching between Sessions and Cloud.

## Design

### Layout Structure

```
+------------------------------------------------------------------+
| Sessions  Groups  Loops  Cloud                          Settings + |
+------------------+-----------------------------------------------+
|                  |                                                 |
|  Workers    (3)  |  [Selected sub-page content]                   |
|  Containers (1)  |                                                 |
|  Checkpoints(2)  |  Full content area with overflow-y-auto scroll |
|  Secrets    (5)  |                                                 |
|  Requests        |                                                 |
|  Workspaces      |                                                 |
|                  |                                                 |
| ──────────────── |                                                 |
| + Add Worker     |                                                 |
| + New Session    |                                                 |
|                  |                                                 |
+------------------+-------------------------------------------------+
```

### Cloud is a top-level tab (already implemented)

Clicking "Cloud" in the top nav enters the Cloud layout. The dropdown menu is replaced by the sidebar navigation.

### Left Sidebar

- Same width as Sessions sidebar (CSS variable or matching class)
- `border-r border-[var(--app-border)]` separator
- Navigation items:
  - Icon + label + count badge (e.g., "Workers (3)")
  - Selected state: `bg-[var(--app-subtle-bg)]` + `font-medium`
  - Hover state: `hover:bg-[var(--app-subtle-bg)]`
- Bottom fixed section with quick actions:
  - `+ Add Worker` — navigates to Workers page and focuses on token generation
  - `+ New Session` — opens New Session form with cloud-self-hosted preselected
- Counts fetched from existing API hooks (useCloudWorkers, etc.)

### Right Content Area

- `flex-1 overflow-y-auto` — fills remaining width, scrolls vertically
- Renders the selected Cloud sub-page content (Outlet)
- Sub-pages remove their own page headers (title is implicit from sidebar selection)
- Sub-pages keep all their existing content/functionality

### Routing

```
/cloud              → redirect to /cloud/workers (default)
/cloud/workers      → Workers content in right pane
/cloud/containers   → Containers content in right pane
/cloud/checkpoints  → Checkpoints content in right pane
/cloud/secrets      → Secrets content in right pane
/cloud/requests     → Requests content in right pane
/cloud/workspaces   → Workspaces content in right pane
```

All routes are children of a `CloudLayout` route that provides the sidebar.

### Implementation

#### New component: `CloudSidebar`

```
web/src/components/CloudSidebar.tsx
```

- Renders nav items with icons, labels, counts
- Uses `useLocation` to determine active item
- Uses `Link` from TanStack Router for navigation
- Fetches counts via existing hooks (useCloudWorkers, etc.)
- Bottom quick action buttons

#### Modified: `router.tsx`

- Replace the current `CloudDropdown` with direct tab navigation to `/cloud`
- Add `CloudLayout` as parent route for all `/cloud/*` children
- Cloud tab active state when URL starts with `/cloud`

#### Modified: All Cloud sub-pages

Remove their individual page headers (the `<div className="border-b ..."><h1>` block). The page identity is shown by the sidebar selection state.

### Style Tokens (reuse existing)

- Sidebar width: match Sessions sidebar width class
- Active nav item: `bg-[var(--app-subtle-bg)]`
- Count badge: `text-xs text-[var(--app-hint)]`
- Border: `border-r border-[var(--app-border)]`
- Quick action buttons: `Button` component with `variant="outline" size="sm"`

### Changes Summary

| File | Change |
|------|--------|
| `web/src/components/CloudSidebar.tsx` | New: sidebar with nav + counts + quick actions |
| `web/src/router.tsx` | Cloud tab → CloudLayout parent route; remove CloudDropdown |
| `web/src/routes/cloud/workers.tsx` | Remove page header |
| `web/src/routes/cloud/containers.tsx` | Remove page header |
| `web/src/routes/cloud/checkpoints.tsx` | Remove page header |
| `web/src/routes/cloud/secrets.tsx` | Remove page header |
| `web/src/routes/cloud/requests.tsx` | Remove page header |
| `web/src/routes/cloud/workspaces.tsx` | Remove page header |
