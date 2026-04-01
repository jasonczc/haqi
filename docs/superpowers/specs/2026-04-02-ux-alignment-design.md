# UX Alignment with Cursor Cloud Agent

## Overview

Align HAQI's user experience with Cursor Cloud Agent's core user stories: one-click spawn, onboarding wizard, checkpoint timeline inline, auto PR creation, GitHub CLI integration, and Telegram cloud command.

## 1. Quick Spawn Dialog

Simple 2-field dialog replacing the 10+ field form for daily use.

### Component: `QuickSpawnDialog`

```
┌──────────────────────────────────────────┐
│  New Cloud Session                    ✕  │
├──────────────────────────────────────────┤
│  Checkpoint:  [Base env         ▼]       │
│               (or: Fresh image)          │
│                                          │
│  Task:                                   │
│  ┌──────────────────────────────────┐    │
│  │ Fix the login bug...             │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ☑ Setup Environment                     │
│  [Advanced ▼]                            │
│              [Cancel]  [Start Agent]     │
└──────────────────────────────────────────┘
```

- **Checkpoint dropdown**: lists available checkpoints + "Fresh image (haqi-workspace:dev)" option
- **Task textarea**: becomes `initialPrompt` in spawn request
- **Setup Environment checkbox**: sets `sessionType: 'setup'`
- **Advanced section** (collapsed): Agent, Model, Runtime, Repo URL, Worker selection, etc.
- **Start Agent**: spawns with `runtimeKind: 'daemon-session'`, auto-selects Worker, uses checkpoint image
- **Triggers**: Cloud sidebar "+ New Session" button, top "+" button when on Cloud tab

### Changes

| File | Change |
|------|--------|
| `web/src/components/QuickSpawnDialog.tsx` | New component |
| `web/src/components/CloudSidebar.tsx` | "+ New Session" opens QuickSpawnDialog |
| `web/src/router.tsx` | Wire dialog trigger from "+" button on Cloud tab |

## 2. Onboarding Wizard

Guided 4-step flow for first-time users.

### Route: `/cloud/onboard`

**Trigger**: Cloud sidebar detects 0 Workers → shows onboarding banner instead of empty nav.

### Steps

**Step 1: Add Worker**
- Generate enrollment token (inline form)
- Show install command with copy button
- Poll `useCloudWorkers` — auto-advance when Worker appears online
- Skip button if user already has Worker

**Step 2: Setup Environment**
- Repo URL input
- Agent selector (default Claude)
- "Start Setup" button → spawns setup session → navigates to session chat
- Agent auto-configures environment (install deps, verify)

**Step 3: Save Checkpoint**
- Shown in session page after agent reports completion
- User clicks "Save Checkpoint" in session header
- Success notification: "Environment ready!"
- Button to continue to Step 4

**Step 4: Configure Secrets**
- `GITHUB_TOKEN` — **required**, with helper text: "Generate at github.com/settings/tokens or run `gh auth token`"
- Other secrets — optional key-value form
- "Finish" button → marks onboarding complete (localStorage flag)
- Redirect to Cloud Workers page

### Changes

| File | Change |
|------|--------|
| `web/src/routes/cloud/onboard.tsx` | New: 4-step wizard |
| `web/src/components/CloudSidebar.tsx` | Show onboarding link when 0 Workers |
| `web/src/router.tsx` | Add `/cloud/onboard` route |

## 3. Session Enhancements

### 3A. Checkpoint Timeline Inline

When a checkpoint is saved, insert a special message in the chat timeline.

**Hub side**: After `saveCheckpoint` succeeds, call `sendMessage` with:
```json
{
    "text": "",
    "meta": {
        "type": "checkpoint",
        "checkpointId": "...",
        "checkpointName": "...",
        "savedAt": 1234567890
    }
}
```

**Web side**: Message renderer detects `meta.type === 'checkpoint'` and renders a card:
- 💾 icon + checkpoint name + time
- "Restore" button (link to spawn from this checkpoint)
- "New Session" button (link to Quick Spawn with checkpoint pre-filled)

### 3B. Auto PR Creation via Prompt

No backend changes needed. Modify the default setup/task prompt to include PR creation instruction.

**Default task prompt addition** (appended when `initialPrompt` is provided and repo URL exists):
```
When your task is complete, create a pull request using `gh pr create --fill` and report the PR URL.
```

**PR URL detection in Session Header**: Scan recent messages for GitHub PR URLs (`github.com/.../pull/\d+`). If found, display a PR link badge in the session header.

### Changes

| File | Change |
|------|--------|
| `hub/src/sync/syncEngine.ts` | saveCheckpoint: insert checkpoint message after success |
| `web/src/components/AssistantChat/` | Render checkpoint card for meta.type=checkpoint messages |
| `cli/src/cloud/executors/HostProcessExecutor.ts` | Append PR creation instruction to initialPrompt |
| `web/src/components/SessionHeader.tsx` | Detect and display PR URL from messages |

## 4. GitHub CLI + Required Secrets

### Dockerfile

Add `gh` CLI to workspace image:
```dockerfile
RUN (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg) \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*
```

### Secret propagation

`GITHUB_TOKEN` env var is already propagated via `DaemonSessionExecutor` env passthrough (secrets are materialized as env vars). `gh` CLI auto-detects `GITHUB_TOKEN`.

### Changes

| File | Change |
|------|--------|
| `Dockerfile.workspace` | Install `gh` CLI |

## 5. Telegram `/cloud` Command

### Command: `/cloud <task>`

**Example**: `/cloud fix the login bug in haqi`

**Flow**:
1. Bot receives `/cloud` command with task text
2. Bot finds an online cloud Worker (auto-select)
3. Bot spawns daemon-session with:
   - `runtimeKind: 'daemon-session'`
   - `initialPrompt: task text`
   - Most recent checkpoint (or fresh image)
   - `yolo: true`
4. Bot replies with: "Agent started! [View session](hub-url/sessions/xxx)"
5. User monitors in Web UI or continues in Telegram

### Changes

| File | Change |
|------|--------|
| `hub/src/telegram/callbacks.ts` | Add `/cloud` command handler |

## Testing

- **Quick Spawn**: Open dialog → select checkpoint → type task → Start → verify session created with correct initialPrompt
- **Onboarding**: First Cloud visit → wizard shows → complete all 4 steps → verify Worker + checkpoint + secrets
- **Checkpoint inline**: Save checkpoint in session → verify card appears in chat timeline
- **PR creation**: Agent runs `gh pr create` → verify PR URL shown in session header
- **GitHub CLI**: `docker exec container gh --version` → verify installed
- **Telegram**: `/cloud fix bug` → verify session spawned + reply with link
