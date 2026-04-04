# Cursor-Clone UI Rewrite Design

Full component rewrite of the haqi web UI to match the `cursor-clone/` reference implementation pixel-for-pixel. Replaces the entire app navigation structure with cursor-clone's two-layout architecture.

## Layout Architecture

Two root layouts replace the current single-layout approach.

### HomeLayout (`/`, `/sessions/$id`)
- Dark sidebar (242px): toggle button, search (⌘K), nav (New Agent, Automations, Dashboard, Bugbot), session history list with git icons + archive-on-hover, user profile footer with dropdown menu
- Light main content area: flex:1, centered max-width 800px, overflow-y scroll

### ChatLayout (extends HomeLayout, `/sessions/$id`)
- Same dark sidebar (left), current session highlighted
- Chat main (center, flex:1): 60px header with title + actions, chat timeline with rounds, floating input
- Context panel (right, 440px): toggleable, maximizable. Tabs: Git / Desktop / Terminal

### SettingsLayout (`/settings/*`)
- Settings sidebar (260px): logo + "Back to Agents" link, user profile card, nav items with separators, "Create a Team" button
- Settings content: flex:1, max-width 800px, 48px padding

## Routing

```
/ → HomeLayout + HomePage (agent list + prompt composer)
/sessions/$id → ChatLayout + ChatPage (3-pane)
/settings → SettingsLayout (redirects to /settings/overview)
  /settings/overview → OverviewPage (heatmap + stats)
  /settings/general → GeneralSettingsPage
  /settings/cloud-agents → CloudAgentsPage (merged workers + secrets + environments)
  /settings/bugbot → BugbotPage
  /settings/plugins → PlaceholderPage
  /settings/integrations → IntegrationsPage
  /settings/members → PlaceholderPage
  /settings/usage → PlaceholderPage
  /settings/spending → PlaceholderPage
  /settings/billing → PlaceholderPage
  /settings/containers → ContainersPage (restyled)
  /settings/workspaces → WorkspacesPage (restyled)
  /settings/requests → RequestsPage (restyled)
  /settings/automations → AutomationsPage (restyled)
  /settings/checkpoints → CheckpointsPage (restyled)
```

Old `/cloud/*` routes redirect to `/settings/*` equivalents.

Settings sidebar nav items (matching cursor-clone exactly):
1. Overview, Settings, Cloud Agents, Bugbot
2. (separator) Plugins, Integrations
3. (separator) Members, Usage, Spending, Billing & Invoices
4. (separator) Containers, Workspaces, Requests, Automations, Checkpoints (our extras)

## Page Designs

### Home Page (`/` → cursor-clone `index.html`)

Components:
- `RepoSelector` — button with chevron-down
- `PromptCard` — contenteditable input, model/MCP chips in footer, image/mic buttons
- `SuggestionPills` — row of pills that populate prompt on click
- `AgentRow` — clickable row with MetadataCard (status badge mapped from session status) + title/subtitle
- `AgentRowChild` — indented variant with inline badge

Data mapping:
- Agent title ← `session.title` or truncated `session.prompt`
- Badge: running → Draft style (gray), completed → Merged style (purple), failed → red
- Diff stats: not available, show status text instead
- Subtitle: model, repo/machine, relative time
- Git icon color: gray=running, purple=completed, green=has PR

Sidebar history: recent sessions with git icons colored by status, title truncated, archive button on hover.

### Chat/Session Detail (`/sessions/$id` → cursor-clone `chat.html`)

Three-pane layout:
- Left: shared dark sidebar, current session highlighted
- Center: 60px header (title, more dropdown, toggle context button), chat timeline (user message card → "Worked for Xm Xs" → agent markdown), floating PromptCard at bottom, 120px bottom spacer
- Right context panel (440px):
  - Header: Git/Desktop/Terminal tab buttons + more/maximize/toggle buttons
  - Git tab: PR title + number + "Mark as ready", branch flow (badge + from→to), Diff/Review/Commits sub-tabs
  - Diff view: file headers + syntax-highlighted code with line numbers, green bg for additions, expandable unmodified banners
  - Review view: checks box (pass/fail), draft warning
  - Commits view: commit list with message + meta
  - Desktop tab: noVNC embed (from existing DesktopPanel)
  - Terminal tab: terminal websocket (from existing TerminalPanel)

Interactive behaviors:
- `.panel-hidden` toggles context panel visibility
- `.layout-maximized` expands context panel to full width
- More dropdown: Open in Desktop, Configure Environment, Archive
- Tab/sub-tab switching with active states

### Overview Page (`/settings/overview` → cursor-clone `settings-overview.html`)

- Stats row: Most Active Month, Most Active Day, Longest Streak
- Large number: "X AI Line Edits in the last year"
- Heatmap: 52×7 grid, 5 green levels, All/Tab/Agent tab switcher
- Quick links: Source Control → Integrations, Integrations → Integrations (2-column grid)
- Data from `getSessions()` activity computation

### Cloud Agents Page (`/settings/cloud-agents` → cursor-clone `settings-cloud-agents.html`)

Consolidates current `/cloud/workers`, `/cloud/secrets`, and environment config into one page.

Sections (all as accordion/card patterns):
1. **Environments** — expandable rows per repo (monospace name, "Personal environment active", base image, edit/remove). "Add Environment" button → modal.
2. **Self-Hosted Agents** — toggle switch + "My Workers" list from worker query. Empty state when none.
3. **Defaults** — CustomSelect dropdowns: default model, default repo, base branch (text input), branch prefix (text input, placeholder "cursor/")
4. **Pull Requests** — CustomSelect: create PRs, PR review destination, allow posting artifacts
5. **Notifications** — toggle: Slack notifications
6. **Repository Routing** — "Add Rule" button, empty state
7. **Security** — CustomSelect: network access settings
8. **User API Keys** — empty state + "New API Key" black button + help text
9. **My Secrets** — secrets from existing query, "Add Secrets" button, empty state

### General Settings (`/settings/general` → cursor-clone `settings-general.html`)

- Privacy: "Privacy Mode" with Active badge, description, Edit button
- Student Verification: disabled "Not eligible" button
- Profile: first/last name inputs, disabled Save button
- Appearance: theme CustomSelect (System/Light/Dark)
- Active Sessions: table with device icon, name, "Current" badge, platform info, time, Revoke button
- Account Management: Log Out button, Delete Account red button

### Bugbot Page (`/settings/bugbot` → cursor-clone `settings-bugbot.html`)

- Green upgrade banner (gift icon, text, Upgrade button)
- Header: "Bugbot" + "Free" badge + description
- Integrations: GitHub/GitLab manage buttons, License upgrade button
- Preferences: toggles (Only Run When Mentioned, Only Run Once Automatically) + CustomSelects (Review Draft PRs, PR Summaries, Autofix, Severity Threshold)
- Repositories: org list with enable counts and manage/enable buttons

### Integrations Page (`/settings/integrations` → cursor-clone `settings-integrations.html`)

- Source Control: GitHub (connected, manage dropdown), GitLab (connect button)
- Integrations: Slack (connect), Linear (connected, manage)
- User API Keys: empty state + New API Key button

### Placeholder Pages (Plugins, Members, Usage, Spending, Billing)

Each renders SettingsLayout + centered empty state: "Coming soon" title + description.

### Restyled Extra Pages (Containers, Workspaces, Requests, Automations, Checkpoints)

Keep existing data fetching and mutation logic. Rewrite JSX to use:
- `settings-section` / `settings-section-title` / `settings-section-subtitle` for headers
- `settings-card` / `settings-row` for content rows
- `SettingsExpandable` for accordion sections
- Status badges matching cursor-clone's badge styles
- Empty states matching `settings-empty-state` pattern

## Shared Components

New components built from scratch matching cursor-clone HTML structure:

**Layout:**
- `Sidebar` — dark sidebar with nav + history + user profile
- `SettingsSidebar` — settings nav with all items
- `HomeLayout`, `ChatLayout`, `SettingsLayout`

**Home:**
- `RepoSelector`, `PromptCard`, `SuggestionPills`
- `AgentRow`, `AgentRowChild`, `MetadataCard`

**Chat:**
- `ChatTimeline`, `ChatRound`, `UserMessage`, `AgentResponse`
- `ContextPanel`, `DiffView`, `ReviewView`, `CommitsView`

**Settings (shared):**
- `CustomSelect` — dropdown with option list, outside-click-to-close
- `SettingsToggle` — green toggle switch (36×20px)
- `SettingsExpandable` — accordion with grid-template-rows 0fr→1fr animation
- `SettingsModal` — overlay with backdrop blur, scale animation
- `SettingsEmptyState` — centered title + description + action button
- `ActivityHeatmap` — 52×7 grid with color levels

## CSS Strategy

- Port `cursor-clone/styles.css` as `web/src/styles/cursor-theme-v2.css`, replacing the partial `cursor-theme.css`
- CSS variables as single source of truth (not Tailwind utilities) for all rewritten components
- Keep Tailwind available for non-rewritten components during migration period
- All rewritten components use cursor-clone's class names directly

Key design tokens:
- Sidebar: 242px, Settings sidebar: 260px, Context panel: 440px, Content max-width: 800px
- Font: Inter sans-serif, SFMono monospace
- Colors: primary #09090b, secondary #71717a, tertiary #a1a1aa
- Borders: primary #d4d4d8, secondary #e4e4e7
- Background: app #f4f4f5, card #ffffff
- Radius: md 6px, lg 12px
- Semantic: green #16a34a, red #ef4444, purple #7e22ce, toggle #10b981
- Badges: Draft #ebebeb, Merged #f3e8ff, Open #dcfce7
