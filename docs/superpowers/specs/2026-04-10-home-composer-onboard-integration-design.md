# HomeComposer Onboard Integration Design

**Date:** 2026-04-10  
**Status:** Approved  
**Scope:** Make HomeComposer state-aware: detect missing worker/checkpoint and show inline onboard steps, plus ensure checkpoint selection works in Cloud Popover during spawn.

---

## Problem

The onboard flow exists at `/settings/onboard` but is disconnected from the HomeComposer. Users land on `/sessions`, see a composer that silently fails (no worker) or requires manual navigation to settings. The system knows what's missing but doesn't tell the user.

## Design

### State Detection

HomeComposer calls existing hooks on mount:

```
const { workers } = useCloudWorkers(api, true)    // already called
const { checkpoints } = useCloudCheckpoints(api, true)  // already called
const hasActiveWorker = workers.some(w => w.active && w.selectable)
const hasCheckpoint = checkpoints.length > 0
```

Three phases derived:

| Condition | Phase | UI |
|-----------|-------|----|
| `!hasActiveWorker` | 1 | Worker connect guide (replaces prompt-card) |
| `hasActiveWorker && !hasCheckpoint` | 2 | Setup environment guide (replaces prompt-card) |
| `hasActiveWorker` (checkpoint optional) | 3 | Normal composer (current) |

Phase 2 has a "Skip" button → goes to Phase 3. Users can always use host-process mode without checkpoints.

### Phase 1: Worker Connect

Renders inside the existing `prompt-card` area. Reuses logic from `onboard.tsx` `StepAddWorker`:

- "Start Worker on This Machine" button → calls `api.startLocalWorker()`
- Token generation section (generate → copy command)
- Auto-polling workers every 3s via `useCloudWorkers` with `refetchInterval`
- Auto-advances to Phase 2 when first worker appears

CSS: all elements use `.prompt-card`, `.pill-btn`, `.tool-chip` etc. from cursor-theme-v2.

### Phase 2: Setup Environment

Also renders in the `prompt-card` area:

- Repository URL input (`.chip-popover-input` style)
- Agent selector (pill row: Claude / Codex)
- "Start Setup Session" button → calls `spawnSession({ sessionType: 'setup', ... })`
- "Skip — use without Docker" link → sets flag, shows Phase 3
- On spawn success, navigates to session view

### Phase 3: Normal Composer

The existing Popover-Chip composer, unchanged. When user has checkpoints, Cloud Popover's checkpoint section shows them and selecting one automatically sets `runtimeKind: 'docker-session'`.

### Auto-set Runtime on Checkpoint Select

In Cloud Popover, when user picks a checkpoint:
- Set `checkpointId` state
- Auto-switch `runtimeKind` to `'docker-session'` (checkpoints are Docker images)
- Show visual indicator that Docker mode is active

### File Changes

| File | Change |
|------|--------|
| `web/src/components/HomeComposer.tsx` | Add phase detection + Phase 1/2 inline UI (~100 lines) |

No new files. No new hooks. No new APIs.

## Success Criteria

1. User opens `/sessions` with no worker → sees "Connect a worker" in prompt-card area
2. Worker comes online → auto-advances to setup guide
3. User clicks "Start Setup" → setup session launches, navigates to session
4. User clicks "Skip" → normal composer appears, can use host-process mode
5. User with checkpoint selects it in Cloud Popover → runtimeKind auto-switches to docker-session
6. All UI uses cursor-theme-v2.css classes, matches reference design
