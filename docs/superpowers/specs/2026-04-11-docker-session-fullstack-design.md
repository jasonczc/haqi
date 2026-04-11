# Docker-Session Full Stack Design

**Date:** 2026-04-11  
**Status:** Sub-project 1 complete; Sub-projects 2-4 pending  
**Scope:** Complete cloud agent experience with default docker-session mode, covering image build → spawn → desktop/terminal → chat → checkpoint.

---

## Problem

The cloud agent flow was partially wired but had multiple gaps blocking end-to-end usage:

1. **No Docker image** — Dockerfile.workspace existed but image was never built
2. **host-process was the default** — lacked isolation, no Desktop, no Checkpoint
3. **Suspected metadata loss** — session listings showed only 3 fields, hiding containerId/runtimeKind
4. **Desktop/Terminal tabs** — UI existed but not validated end-to-end
5. **Checkpoint save** — UI path exists but worker-side `docker commit` not confirmed
6. **Agent chat interaction** — initialPrompt sending path unclear

## Sub-Project Decomposition

This spec covers **Sub-project 1 (Docker foundation)** which is now complete. Sub-projects 2-4 get their own specs.

| # | Name | Status | Scope |
|---|------|--------|-------|
| 1 | Docker foundation | **Complete** | image build, docker-session spawn, container lifecycle |
| 2 | Agent chat interaction | Pending | initialPrompt delivery, follow-up messages, agent response rendering |
| 3 | Desktop + Terminal tabs | Pending | noVNC iframe connection, terminal socket.io handlers |
| 4 | Checkpoint loop | Pending | worker-side docker commit, checkpoint reuse in HomeComposer Cloud Popover |

## Sub-Project 1: Docker Foundation — Design

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Host Machine                                                   │
│                                                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────────┐  │
│  │ Web UI   │───▶│ Hub      │───▶│ Worker (bun cli)         │  │
│  │ (Vite)   │    │ (Bun)    │    │ runnerLoop.ts            │  │
│  └──────────┘    └──────────┘    │                          │  │
│                                  │ DaemonSessionExecutor    │  │
│                                  │   ├─ ensureContainer()   │  │
│                                  │   ├─ docker run          │  │
│                                  │   └─ DaemonClient.spawn()│  │
│                                  └──────────┬───────────────┘  │
│                                             │                  │
│                                             ▼                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Docker Container (haqi-workspace:dev)                 │    │
│  │  ├─ haqi-daemon :9876 (manages processes)             │    │
│  │  ├─ Xtigervnc :5901 + noVNC :6080 (desktop)           │    │
│  │  ├─ xfce4-session (desktop environment)               │    │
│  │  ├─ runner-sync (sync to hub via Socket.IO)           │    │
│  │  └─ claude CLI (the agent)                            │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### Image: `haqi-workspace:dev`

Built from `Dockerfile.workspace` via:
```bash
docker build -t haqi-workspace:dev -f Dockerfile.workspace .
```

Size ~3.88GB. Contains:
- Ubuntu 24.04 base
- Xvfb + xfce4 + tigervnc + noVNC (Desktop)
- Chromium + Playwright + xdotool (Computer Use)
- ffmpeg + imagemagick (Recording)
- Bun runtime + haqi CLI + haqi-daemon binary
- GitHub CLI

Entrypoint: `haqi-daemon` (daemon process listens on 9876)

### Spawn Flow (docker-session / daemon-session)

1. **User submits prompt** in HomeComposer → `POST /api/machines/{machineId}/spawn`
2. **Hub validates + enqueues** in `SpawnCoordinator` (hub/src/cloud/spawnCoordinator.ts)
3. **Worker selection** → `selectMachine()` picks cloud worker based on backend type
4. **Workspace preparation** → creates `/tmp/haqi-cloud-workspaces/{requestId}/repo`
5. **Hub → Worker RPC** → `rpcGateway.spawnSession(machineId, payload)` via Socket.IO
6. **Worker executes** `DaemonSessionExecutor.startDaemonSessionExecutor()`:
   a. `ensureWorkspaceContainer()` → `docker run -d haqi-workspace:dev` with port bindings
      - 9876 (daemon control)
      - 6080 (noVNC)
      - Labels: `haqi.runtime`, `haqi.workspace_id`, `haqi.checkpoint_id`
   b. Wait for daemon ready via `DaemonClient.waitReady(30s)`
   c. Optional: repository sync inside container via `syncRepositoryInContainer()`
   d. Optional: run install hooks from environment template
   e. `DaemonClient.spawn()` → POST to container's daemon, starts agent process with env vars:
      - `CLI_API_TOKEN` (for hub auth)
      - `HAPI_API_URL` (with localhost → host.docker.internal rewrite)
      - `HAPI_RUNNER_CALLBACK_URL` (for session webhook back to worker)
      - `HAPI_CONTAINER_ID`, `HAPI_NOVNC_PORT`, `HAPI_SPAWN_REQUEST_ID`
      - `HAPI_SESSION_TYPE`, `HAPI_INITIAL_PROMPT`
7. **Agent starts inside container** → `sessionFactory.bootstrapSession()` reads env vars
8. **Agent registers session** → `POST /api/cli/sessions` with full metadata
9. **Hub stores session** → `getOrCreateSession()` in sessionCache/store
10. **Hub returns success** → `{type: 'success', sessionId}` to worker → to user

### Metadata Storage Clarification

**Important architectural note:** Session metadata contains 29+ fields in the DB (`sqlite3 ~/.hapi/hapi.db`), but `/api/sessions` list endpoint returns **SessionSummary** which intentionally strips to ~10 fields for list-view optimization.

For full metadata (containerId, runtimeKind, noVncPort, etc.), use:
- `GET /api/sessions/:id` — single session with full metadata
- `GET /api/cli/sessions/:id` — CLI-facing, full metadata

Files:
- `shared/src/sessionSummary.ts:29` — `toSessionSummary()` strips to summary
- `shared/src/schemas.ts:461` — `MetadataSchema` full definition
- `hub/src/sync/sessionCache.ts:96` — parses full metadata back via Schema

### Critical Fixes Applied

#### Fix 1: `HAPI_RUNNER_CALLBACK_URL` missing for host-process
**File:** `cli/src/cloud/executors/HostProcessExecutor.ts`  
**Problem:** Only `DaemonSessionExecutor` passed this env var. host-process children couldn't POST back to runner's control server, so webhook never fired → spawn timeout.  
**Fix:** `startHostProcessExecutor()` accepts `controlPort` param and sets `HAPI_RUNNER_CALLBACK_URL=http://127.0.0.1:{controlPort}` in child env.

#### Fix 2: PID mismatch in webhook handler
**File:** `cli/src/runner/runnerLoop.ts:100-122`  
**Problem:** Bun forks a child process when spawning, so `process.pid` inside child != the PID the parent sees. Webhook arrived with the child's `hostPid` but `pidToTrackedSession` stored the parent PID → no match.  
**Fix:** Added fallback matching chain: by PID → by requestId → by inference (if only one runner-spawned session is awaiting, match it).

#### Fix 3: Webhook timeout too short
**File:** `cli/src/runner/runnerLoop.ts:903`  
**Problem:** 15s timeout was too short for Claude CLI cold boot.  
**Fix:** Increased to 180s for `host-process` and `daemon-session` modes.

#### Fix 4: Docker image missing
**Problem:** `haqi-workspace:dev` was never built; DaemonSessionExecutor failed on `docker run`.  
**Fix:** `docker build -t haqi-workspace:dev -f Dockerfile.workspace .` (one-time, ~90s).  
**Follow-up:** Need auto-build step in hub startup or Web UI onboarding.

#### Fix 5: Spawn coordinator blocked host-process mode  
**File:** `hub/src/cloud/spawnCoordinator.ts:380-401`  
**Problem:** Required checkpoint or repo for all non-setup cloud sessions, even host-process which doesn't need Docker.  
**Fix:** Exempt `runtimeKind === 'host-process'` or `'daemon-session'` from the checkpoint/repo requirement.

#### Fix 6: runnerLoop required directory for host-process
**File:** `cli/src/runner/runnerLoop.ts:390-398`  
**Problem:** `host-process` simple sessions without directory failed with "Directory is required".  
**Fix:** Auto-create temp workspace at `~/.hapi/workspaces/session-{timestamp}`.

### End-to-End Verification

Tested via Playwright + curl on 2026-04-11:

```
POST /api/machines/{machineId}/spawn
  runtimeKind: daemon-session
  sessionType: setup
  initialPrompt: "Say hello briefly and confirm you are in Docker."

Response (5s later):
  type: success
  sessionId: 15ea1bb3-65a9-4e1a-b6e3-6146c3c699af

Container: haqi-workspace:dev, 0.0.0.0:55557->6080, 0.0.0.0:55556->9876

Container processes:
  - haqi-daemon :9876
  - Xtigervnc :5901
  - xfce4-session (full desktop)
  - bun claude --hapi-starting-mode remote --yolo (agent)
  - bun runner start-sync (sync)

Session metadata (from /api/sessions/:id):
  containerId: 3af3727edd1d...
  runtimeKind: daemon-session
  noVncPort: 55557
  workspaceId: f6c101d5-...
  spawnRequestId: 43a50839-...
  setupStatus: { phase: 'starting-session', ... }
  initialPrompt: "Say hello briefly..."
```

### What Still Needs Work (→ Sub-projects 2-4)

Despite the full pipeline working, the user experience is incomplete because:

1. **Agent isn't responding visually** — `initialPrompt` is in metadata but hub's `sendMessage()` on session register may not be firing or the message isn't reaching the agent's message queue. → Sub-project 2
2. **Desktop tab never verified** — noVNC port is mapped but the iframe in `web/src/routes/sessions/desktop.tsx` wasn't loaded in a real session. → Sub-project 3
3. **Terminal tab likely broken** — hub's socket.io `/terminal` namespace handlers not found in code search. → Sub-project 3
4. **Checkpoint save not verified** — UI path exists but `docker commit` execution on worker side hasn't been traced end-to-end. → Sub-project 4

## Success Criteria for Sub-project 1

- [x] Docker image builds successfully
- [x] docker-session spawn creates a running container with port mappings
- [x] Container runs haqi-daemon + xtigervnc + agent process
- [x] Agent connects back to hub and registers session with full metadata
- [x] Session metadata visible in `GET /api/sessions/:id` (29 fields)
- [x] Spawn succeeds in <10 seconds (typically 5s)
- [x] HomeComposer Phase detection (no worker → Phase 1, no checkpoint → Phase 2, ready → Phase 3) works

## Known Limitations

1. **Docker image build is manual** — not auto-built on first use. Hub startup should detect missing image and trigger build.
2. **session-list endpoint returns SessionSummary** — not a bug but worth documenting. Components needing containerId/runtimeKind must fetch per-session detail.
3. **Checkpoint images** — `haqi-checkpoint:{id}` format is referenced in code but actual `docker commit` execution is in Sub-project 4.
