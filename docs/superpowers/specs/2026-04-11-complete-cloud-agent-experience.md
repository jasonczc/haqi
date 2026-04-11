# Complete Cloud Agent Experience

**Date:** 2026-04-11  
**Status:** Infrastructure complete; agent SDK response has known issue  
**Scope:** End-to-end cloud agent: Docker image → container spawn → Desktop/Terminal tabs → chat interaction → checkpoint save/reuse.

---

## Final State

| Feature | Status | Notes |
|---------|--------|-------|
| Docker daemon | ✅ | Auto-starts via Docker Desktop |
| `haqi-workspace:dev` image | ✅ | Built from Dockerfile.workspace (~4GB) |
| Claude Code CLI in image | ✅ | Installed via `npm install -g @anthropic-ai/claude-code` |
| Node.js in image | ✅ | v22 via NodeSource apt |
| Worker enrollment + connection | ✅ | 5s spawn on existing worker |
| `docker-session` / `daemon-session` spawn | ✅ | Container with VNC + daemon created in 5s |
| noVNC desktop | ✅ | Port 6080 mapped, accessible via `/desktop/:sid` |
| Desktop tab in RunWorkbench | ✅ | iframe loads noVNC UI with Connect button |
| Terminal tab in RunWorkbench | ✅ | Socket.IO handlers present (terminal:create/write/resize) |
| Git + Setup + Secrets tabs | ✅ | All 4 tabs render correctly |
| OAuth token extraction | ✅ | From macOS keychain `Claude Code-credentials` |
| OAuth token → container | ✅ | `CLAUDE_CODE_OAUTH_TOKEN` env var |
| initialPrompt delivery | ✅ | Via `handleSessionAlive` after socket joins room |
| Agent message in chat | ✅ | User message delivered to agent, appears in timeline |
| Agent response iteration | ⚠️ | **Known SDK bug**: haqi's Claude SDK throws empty `{}` error during response iteration. Claude CLI itself works via direct `claude -p` invocation in container. |
| Checkpoint save (docker commit) | ✅ | `haqi-checkpoint:{id}` images created (4.3GB) |
| Checkpoint reuse (spawn from image) | ✅ | New session from checkpoint succeeds in 5s |
| HomeComposer Phase detection | ✅ | Phase 1 → Phase 2 → Phase 3 auto-advance |

## Architecture

```
┌─ Web UI (Vite :5173) ──────────────────────────────────────┐
│  HomeComposer (Phase 1/2/3) → Spawn → Session Chat         │
│                                          │                  │
│                                          ▼                  │
│  RunWorkbench: [Setup|Secrets|Git|Desktop|Terminal]         │
└─────────────────┬──────────────────────────────────────────┘
                  │ REST + Socket.IO
                  ▼
┌─ Hub (Bun :3006) ─────────────────────────────────────────┐
│  ┌─ REST routes ─────────────────────────────────────────┐ │
│  │ POST /api/machines/:id/spawn                          │ │
│  │ POST /cloud/checkpoints/save                          │ │
│  │ GET  /desktop/:sid   → renders noVNC iframe           │ │
│  │ GET  /preview/:sid/:port → proxies to container       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ Socket.IO namespaces ────────────────────────────────┐ │
│  │ /cli         (agents connect with auth.sessionId)    │ │
│  │              joins session:{sid} room on connect     │ │
│  │              receives messages via room emit         │ │
│  │              handleSessionAlive → deliverPending     │ │
│  │ /terminal    (terminal:create/write/resize)          │ │
│  │ /app         (web clients subscribe to sessions)     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ SpawnCoordinator ────────────────────────────────────┐ │
│  │ enqueue → selectWorker → prepareWorkspace            │ │
│  │  → resolveCheckpoint → rpcGateway.spawnSession       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────┬──────────────────────────────────────────┘
                  │ Socket.IO RPC
                  ▼
┌─ Worker (bun cli :worker.lock) ───────────────────────────┐
│  runnerLoop:                                                │
│  ├─ receives spawnSession RPC                               │
│  ├─ DaemonSessionExecutor.startDaemonSessionExecutor()      │
│  │   ├─ ensureWorkspaceContainer() → docker run             │
│  │   ├─ extractClaudeOAuthToken() (keychain/file/env)       │
│  │   └─ DaemonClient.spawn() → container daemon :9876       │
│  └─ checkpointCreate RPC → docker commit                    │
└─────────────────┬──────────────────────────────────────────┘
                  │ Docker API + HTTP
                  ▼
┌─ Container (haqi-workspace:dev) ──────────────────────────┐
│  ENTRYPOINT: haqi-daemon :9876                              │
│  ├─ Xvfb + xfce4 + xtigervnc :5901 + noVNC :6080            │
│  ├─ Claude Code CLI (installed via npm globally)            │
│  │                                                           │
│  │  Agent process spawned by daemon:                         │
│  │  ├─ env: CLAUDE_CODE_OAUTH_TOKEN, CLI_API_TOKEN,          │
│  │  │       HAPI_API_URL, HAPI_RUNNER_CALLBACK_URL,          │
│  │  │       HAPI_SPAWN_REQUEST_ID, HAPI_INITIAL_PROMPT       │
│  │  ├─ POSTs /cli/sessions → session registered             │
│  │  ├─ Opens Socket.IO → auth.sessionId → joins room        │
│  │  └─ Sends session-alive → hub delivers pending prompt    │
│  │                                                           │
│  └─ runner start-sync (internal sync process)               │
└──────────────────────────────────────────────────────────────┘
```

## Critical Fixes (Sub-projects 2-4)

### 1. Docker image had no Claude CLI

**File:** `Dockerfile.workspace`  
**Fix:** Added Node.js 22 via NodeSource + `npm install -g @anthropic-ai/claude-code`.  
**Result:** `claude --version` inside container returns `2.1.101`.

### 2. OAuth token missing in container

**File:** `cli/src/cloud/executors/DaemonSessionExecutor.ts`  
**Problem:** Claude CLI needs credentials to call Anthropic API. The host's Claude CLI stores credentials in macOS Keychain (`Claude Code-credentials`), not `~/.claude/.credentials.json`. Container had no way to access the keychain.  
**Fix:** New `extractClaudeOAuthToken()` helper that checks (in order):
1. `CLAUDE_CODE_OAUTH_TOKEN` env var on worker
2. `ANTHROPIC_API_KEY` env var on worker
3. `~/.claude/.credentials.json` file on worker
4. macOS keychain via `security find-generic-password -s "Claude Code-credentials" -w`

The extracted token is passed as `CLAUDE_CODE_OAUTH_TOKEN` to the container via `DaemonClient.spawn()` env.

### 3. initialPrompt race condition

**File:** `hub/src/sync/syncEngine.ts`  
**Problem:** The original code sent the pending prompt from `getOrCreateSession()` immediately when the agent POSTed its session. But at that moment the agent hadn't yet opened its Socket.IO connection, so the room `session:{sid}` was empty and the `emit('update', ...)` went to nobody.  
**Fix:** Moved delivery to `handleSessionAlive()`, which fires when the agent sends its first session-alive ping AFTER connecting Socket.IO and joining the room.

### 4. Pending prompt keyed by wrong ID

**File:** `hub/src/sync/syncEngine.ts`  
**Problem:** The original code used `request.spawnRequestId` as the map key. But `SpawnCoordinator.processRequest()` overwrites `spawnPayload.spawnRequestId` with its own `requestId` before sending to the worker (line 545 of spawnCoordinator.ts). So the session registered with a different spawnRequestId than the map key.  
**Fix:** In cloud-backed paths, store the prompt keyed by `accepted.id` (the coordinator's requestId). This matches what the agent's session metadata reports.

### 5. Duplicate delivery paths

**File:** `hub/src/sync/syncEngine.ts`  
**Problem:** Even after fixing the race, the original `getOrCreateSession` logic still ran and added to `sentInitialPrompts`, preventing the new `handleSessionAlive` path from ever delivering.  
**Fix:** Removed the old inline delivery from `getOrCreateSession`; all delivery happens in `handleSessionAlive` → `deliverPendingInitialPromptIfAny`.

### 6. `resolveInitialPrompt` helper

**File:** `hub/src/sync/syncEngine.ts`  
**Refactor:** Extracted the setup-prompt generation logic into a private helper so both `spawnSession` and `spawnSessionOnAutoCloudWorker` can use it consistently.

## Verification

### Docker build
```
docker build -t haqi-workspace:dev -f Dockerfile.workspace .
# → 4GB image with Claude CLI, VNC, xfce4
```

### Spawn
```
POST /api/machines/{worker}/spawn
  runtimeKind: daemon-session
  sessionType: setup
  initialPrompt: "Respond with just: PONG"

Response in ~1s: { type: 'accepted', requestId: 'xxx' }
Request completes in ~5s: { phase: 'succeeded', sessionId: 'yyy' }
Container: haqi-workspace:dev, ports 6080 + 9876 mapped
```

### Agent message flow
```
1. Session registers with metadata (29 fields including spawnRequestId)
2. Agent opens Socket.IO with auth.sessionId → joins session:yyy room
3. Agent emits session-alive
4. Hub.handleSessionAlive → deliverPendingInitialPromptIfAny
5. Prompt found by spawnRequestId → sendMessage
6. Hub emits 'update' to session:yyy room → agent receives
7. User message appears in timeline (seq=1)
8. Agent attempts Claude SDK iteration → launch error {} (known issue)
```

### Desktop
```
GET /desktop/{sessionId} → 200, renders noVNC iframe
iframe src → http://localhost:{mappedPort}/vnc.html
Connect button → establishes WebSocket to xtigervnc :5901
```

### Checkpoint loop
```
POST /cloud/checkpoints/save { sessionId, name }
  → rpcGateway.checkpointCreate → worker runs: docker commit {container} haqi-checkpoint:{id}
  → checkpoint record { status: 'ready' }
  → image visible: haqi-checkpoint:{id} (4.3GB)

Later spawn: { checkpointId: 'xxx' }
  → DaemonSessionExecutor checks if haqi-checkpoint:xxx exists locally
  → ensureWorkspaceContainer uses checkpoint image instead of base
  → new container in 5s from checkpoint state
```

## Known Issue: Agent SDK Response

**Symptom:** After the user message arrives at the agent, the agent logs:
```
[claudeRemoteLauncher] Starting remote launcher
[remote]: launch
[Claude SDK] Global claude command available
[claudeRemote] Thinking state changed to: true
[claudeRemote] Starting to iterate over response
[metadataExtractor] Captured SDK metadata: {...tools...model: claude-sonnet-4-6}
[claudeRemote] Thinking state changed to: false
[remote]: launch error {}
[remote]: launch finally
[MessageQueue2] Waiting for messages...
```

Then an "agent" message appears in the timeline: `"Process exited unexpectedly"`.

**Verified working components:**
- Claude Code CLI binary (`claude --version` returns 2.1.101)
- OAuth token (passed to container, visible in process env)
- Direct invocation: `docker exec -e CLAUDE_CODE_OAUTH_TOKEN=... container claude -p` returns a proper response
- SDK metadata extraction (tools, slash commands, model name all populated)

**Root cause:** haqi's Claude SDK integration (`claudeRemoteLauncher.ts` / `claudeRemote.ts`) throws an empty `{}` error when iterating the Claude response stream in remote mode. This is not an infrastructure issue; it's inside haqi's CLI SDK wrapper code path.

**Workaround:** For now, agent responses don't render in remote mode inside the container. The fix requires deeper debugging of the haqi CLI SDK integration in `cli/src/claude/` which is out of scope for this spec.

## Files Changed

| File | Purpose |
|------|---------|
| `Dockerfile.workspace` | Install Node.js + Claude Code CLI |
| `cli/src/cloud/executors/DaemonSessionExecutor.ts` | Extract OAuth token, pass to container |
| `hub/src/sync/syncEngine.ts` | Fix initialPrompt delivery race + coordinator key |
| `cli/src/cloud/executors/HostProcessExecutor.ts` | (Sub-project 1) HAPI_RUNNER_CALLBACK_URL for host-process |
| `cli/src/runner/runnerLoop.ts` | (Sub-project 1) Webhook awaiter fallback + timeout 180s |
| `hub/src/cloud/spawnCoordinator.ts` | (Sub-project 1) Exempt host-process from checkpoint requirement |
| `hub/src/web/routes/machines.ts` | (Sub-project 1) Exempt host-process from repo requirement |
| `web/src/components/HomeComposer.tsx` | (Sub-project 1) Phase 1/2/3 UI |
| `web/src/components/ChipPopover.tsx` | (Sub-project 1) Popover primitives |
| `web/src/styles/cursor-theme-v2.css` | (Sub-project 1) chip-popover CSS |

## User Story (final, verified)

1. **User opens** `http://localhost:5173/sessions`
2. **HomeComposer detects** no cloud worker → shows Phase 1 "Connect a worker" button
3. **User clicks** Start Worker → worker starts locally, comes online in ~5s
4. **Phase auto-advances** to Phase 2 "Setup your environment" (if no checkpoint) or Phase 3 composer
5. **User clicks Skip** (or fills form and clicks Start Setup)
6. **Phase 3 composer** renders: textarea + Model chip + Cloud chip + Config chip
7. **User types prompt** and clicks submit
8. **Spawn succeeds** in ~5s, session view loads with the prompt as first message
9. **User toggles workbench** (top-right icon) → right panel opens with Setup/Secrets/Git/Desktop tabs
10. **User clicks Desktop** → noVNC iframe loads, Connect button visible
11. **User can save checkpoint** via SetupPanel → `docker commit` creates `haqi-checkpoint:xxx`
12. **Next session** can select checkpoint in Cloud popover → container starts from saved image
