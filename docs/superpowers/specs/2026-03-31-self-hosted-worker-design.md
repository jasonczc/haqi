# Self-Hosted Worker Design

## Overview

Enable users to register their own machines as Workers that connect to the HAQI Hub and execute Agent sessions remotely. Workers use outbound-only Socket.IO connections, authenticate via enrollment tokens, and support both host-process and Docker-based execution.

This is the foundation for HAQI's cloud agent capability -- once self-hosted workers are functional, event-driven automations and desktop/browser features build on top.

## Architecture

```
+--------------------------------------------------------------------+
|                          Hub (Control Plane)                        |
|                                                                    |
|  +--------------+  +---------------+  +--------------------------+ |
|  | SecretBroker |  | Enrollment    |  | SpawnCoordinator         | |
|  | (token mgmt) |  | Token API     |  | (state machine:          | |
|  |              |  | (create/swap) |  |  queue->assign->prepare  | |
|  |              |  |               |  |  ->running->done)        | |
|  +--------------+  +---------------+  +--------------------------+ |
|  +--------------+  +---------------+  +--------------------------+ |
|  | Scheduler    |  | Provider      |  | MachineCache             | |
|  | (pick Worker)|  | (categorize)  |  | (online Worker state)    | |
|  +--------------+  +---------------+  +--------------------------+ |
|                         | Socket.IO                                |
+-------------------------|-----------------------------------------+
                          | outbound-only (TLS)
+-------------------------|-----------------------------------------+
|                   Self-Hosted Worker                               |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |  haqi worker start --token <enrollment> --hub-url <url>       | |
|  |                                                               | |
|  |  1. enrollment token -> workerSessionToken handshake          | |
|  |  2. Socket.IO long connection (reuse Runner protocol)         | |
|  |  3. report metadata: executorType=cloud-self-hosted,          | |
|  |     capabilities, resources, labels                           | |
|  |  4. receive spawn RPC -> spawnSession()                       | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +-----------------+   +-----------------------------+             |
|  | HostProcess     |   | DockerSession               |             |
|  | Executor        |   | Executor                    |             |
|  +-----------------+   +-----------------------------+             |
+--------------------------------------------------------------------+
```

Core insight: `haqi worker start` is a Runner that connects to a remote Hub. The difference from `haqi runner start` is only: (1) auth via enrollment token instead of CLI_API_TOKEN, (2) Hub URL from CLI args instead of local config, (3) metadata marks `executorType: 'cloud-self-hosted'`.

## Worker Registration & Authentication

### Flow

```
User (Web UI)                Hub                         Worker Machine
     |                        |                               |
     |-- POST /cloud/         |                               |
     |   enrollment-tokens    |                               |
     |   {label, ttlMinutes}  |                               |
     |<-- {token: "enr_xxx"} -|                               |
     |                        |                               |
     |   (user copies token to Worker machine)                 |
     |                        |                               |
     |                        |<-- Socket.IO connect ----------|
     |                        |    auth: {token: "enr_xxx"}   |
     |                        |                               |
     |                        |-- resolveCliAuthToken()        |
     |                        |   kind: 'enrollment'          |
     |                        |   -> exchangeEnrollment       |
     |                        |   -> generate workerSession   |
     |                        |      Token                    |
     |                        |                               |
     |                        |-- emit('worker-enrolled', ----|
     |                        |   {workerSessionToken,        |
     |                        |    machineId})                |
     |                        |                               |
     |                        |   Worker persists token to    |
     |                        |   ~/.haqi-worker/config.json  |
     |                        |                               |
     |                        |<-- update-metadata -----------|
     |                        |    {executorType:              |
     |                        |     'cloud-self-hosted',      |
     |                        |     capabilities, resources,  |
     |                        |     labels, provider}         |
     |                        |                               |
     |                        |-- machineCache update --------|
     |                        |   Worker becomes schedulable  |
```

### Key decisions

- **Enrollment token**: one-time use, exchanged for long-lived `workerSessionToken`. Existing `SecretBroker.exchangeEnrollmentToken()` handles this.
- **Reconnection**: Worker restarts use `workerSessionToken` directly. `resolveCliAuthToken` already supports `worker-session` kind.
- **Local persistence** (`~/.haqi-worker/config.json`):
  ```json
  {
    "hubUrl": "https://hub.example.com",
    "workerSessionToken": "wst_xxx",
    "machineId": "machine-abc",
    "namespace": "default"
  }
  ```
- **No new Socket.IO events needed** on Hub side except `worker-enrolled` for returning the long-lived token after enrollment exchange.

## CLI Commands & Worker Startup

### Commands

```bash
haqi worker start --token <enrollment-token> --hub-url <url>  # First-time registration
haqi worker start                                              # Reconnect (already registered)
haqi worker stop                                               # Stop worker
haqi worker status                                             # Check status
```

### Startup flow

```
haqi worker start --token enr_xxx --hub-url https://hub.example.com
     |
     +- 1. Check ~/.haqi-worker/config.json
     |     +- Has workerSessionToken? -> skip enrollment, connect directly
     |     +- No? -> require --token and --hub-url
     |
     +- 2. Construct ApiClient with overrides:
     |     +- hubUrl: from --hub-url or config.json
     |     +- authToken: enrollment token or workerSessionToken
     |
     +- 3. Socket.IO connect to Hub
     |     +- enrollment: Hub returns workerSessionToken
     |     +- persist to config.json
     |
     +- 4. Report machine metadata
     |     +- executorType: 'cloud-self-hosted'
     |     +- capabilities: auto-detected (docker, resources)
     |     +- provider: 'manual'
     |
     +- 5. Enter main loop (reuse runnerLoop core)
     |     +- Register RPC handlers: spawn-session, stop-session, etc.
     |     +- Heartbeat
     |     +- Receive spawn requests -> spawnSession()
     |
     +- 6. Graceful shutdown
           +- SIGINT/SIGTERM -> finish current session -> disconnect
```

### Code structure (refactor from run.ts)

```
cli/src/runner/run.ts            (existing, 1159 lines)
  +- startRunner()               unchanged, local scenario entry point

cli/src/worker/workerStart.ts    (new)
  +- startWorker()               Worker scenario entry point
     +- read/write config.json
     +- construct ApiClient (remote Hub)
     +- call runRunnerLoop()     <- extracted from startRunner

cli/src/runner/runnerLoop.ts     (new, extracted from run.ts)
  +- runRunnerLoop(options)      pure "connect Hub + register RPC + spawn loop"
     +- options.apiClient        local or remote
     +- options.machineId
     +- options.metadata         includes executorType
     +- options.onShutdown
```

Both `run.ts` and `workerStart.ts` call the same `runRunnerLoop()`. They differ only in pre-loop auth and config.

### Capability auto-detection

```typescript
async function detectWorkerCapabilities(): Promise<WorkerCapabilities> {
  return {
    docker: await commandExists('docker'),
    dockerSession: await commandExists('docker'),
    internetAccess: true,
    maxConcurrentSessions: os.cpus().length,
    resources: {
      cpu: os.cpus().length,
      memoryMb: Math.floor(os.totalmem() / 1024 / 1024),
      diskGb: await getAvailableDiskGb()
    }
  }
}
```

## Hub-Side Scheduling & Spawn Dispatch

### Spawn request flow

```
Web UI: user clicks "New Session" -> selects Cloud Worker
     |
     +- POST /api/sessions/spawn
     |   { executionBackend: 'cloud-self-hosted',
     |     directory: '/workspace/project',
     |     repository: { url: '...' },       <- optional
     |     environmentId: '...',             <- optional
     |     agentFlavor: 'claude' }
     |
     v
Hub: syncEngine.spawnSession()
     |
     +- executionBackend === 'cloud-self-hosted'?
     |   +- YES -> spawnCoordinator.submit(request)
     |
     v
SpawnCoordinator state machine:
     |
     +- queued
     |   +- scheduler.selectWorker(machines, { labels, requireDocker })
     |   +- no available Worker? -> wait + timeout error
     |
     +- assigned (Worker selected)
     |   +- rpcGateway.invoke(machineId, 'spawn-session', {
     |       spawnRequestId, directory, repository,
     |       executionBackend, environment, secrets, ... })
     |
     +- preparing-workspace
     |   +- Worker reports progress (via update-metadata)
     |   +- Hub forwards to Web SSE
     |
     +- running
     |   +- Worker's Agent session is live
     |   +- Message flow uses standard Socket.IO path
     |
     +- completed / failed
         +- Worker reports end state
         +- Cleanup workspace (if configured)
```

### Differences from local spawn

| Aspect | Local Runner | Self-hosted Worker |
|--------|-------------|-------------------|
| Worker selection | Fixed to local machine | Scheduler picks by load/labels |
| Spawn dispatch | Direct spawnSession() call | RPC over Socket.IO |
| Repository | Already local or git clone | Worker-side git clone |
| Secret injection | Hub sends resolved secrets via RPC | Same |
| Status reporting | update-metadata | Same (protocol identical) |
| Session messages | Socket.IO message event | Same (protocol identical) |

Key point: once an Agent session is running on a Worker, all subsequent message flow, permission approval, and state updates use the existing Socket.IO protocol unchanged. Hub does not need to distinguish local vs remote.

### Timeouts & retries

- Worker selection timeout: 30s, return `no_matching_worker` error
- Workspace preparation timeout: 5min (configurable), mark request as failed
- Worker disconnect: SpawnCoordinator detects machine offline, re-queues assigned-but-not-running requests

## Web UI

### New: Worker management page (`/cloud/workers`)

Existing `web/src/routes/cloud/` has `request.tsx`, `secrets.tsx`, `workspace.tsx`. Add `workers.tsx`:

- **Worker list**: reuse `useCloudWorkers` hook (exists), show machineId, status, capabilities, load, last heartbeat
- **Enrollment token generation**: call `POST /cloud/enrollment-tokens` (API exists), show token + copy button + install command hint
- **Worker detail**: expand to show resources, labels, current session, request history

Install command hint:
```
On the target machine, run:
curl -fsSL https://haqi.dev/install | bash
haqi worker start --token enr_xxx --hub-url https://your-hub.example.com
```

### Modified: New session form

`CloudSettingsSection.tsx` (462 lines) already supports provider and environment selection. Add:

- When `executionBackend` is `cloud-self-hosted`, show available Worker list (from `useCloudWorkers`)
- If no Workers available, show guidance: "No Workers online. Go to Worker management to register one."
- Support choosing specific Worker or `auto` (Scheduler assigns)

### Modified: Session status display

`SessionHeader.tsx` already shows cloud metadata. Add:

- Which Worker the session runs on (machineId -> Worker label)
- Workspace preparation progress bar (SpawnCoordinator phase -> progress): `queued -> 0%`, `assigned -> 10%`, `preparing-workspace -> 10-90%`, `running -> 100%`

### SSE events

`useSSE.ts` already has cloud event listeners. Ensure:

- Worker online/offline events trigger `useCloudWorkers` query invalidation
- Spawn request status changes trigger UI updates

## Error Handling

### Worker connection lifecycle

| Scenario | Handling |
|----------|----------|
| **Worker disconnect (network)** | machineCache heartbeat timeout (existing 60s), mark inactive. Preparing requests re-queued, running sessions marked disconnected (reconnectable) |
| **Worker graceful exit (SIGTERM)** | Worker finishes current spawn, reports lifecycle: 'draining', waits for sessions to end. Hub stops assigning new tasks to draining Workers |
| **Hub restart** | Worker's Socket.IO auto-reconnects (existing), re-reports metadata, becomes schedulable again |
| **Enrollment token expired** | `isRecordExpired()` already implemented, Hub rejects connection with clear error. Worker logs prompt user to regenerate |
| **Enrollment token reuse** | Already-exchanged tokens marked as used, second attempt returns error |

### Spawn failure scenarios

| Scenario | Handling |
|----------|----------|
| **No matching Worker** | SpawnCoordinator returns `no_matching_worker`, Web UI shows "No available Workers" |
| **Git clone failure** | Worker reports `workspacePreparation: { phase: 'failed' }` + error, request marked failed, no retry (user may need to fix repo URL or credentials) |
| **Docker unavailable** | If request needs docker-session but Worker `capabilities.docker === false`, Scheduler won't select it. Runtime Docker failure: Worker reports error |
| **Agent process crash** | Existing Runner `child.on('exit')` handling covers this, reports session end, lifecycle returns to idle |

### Security boundaries

- Workers can only execute Hub-dispatched spawn requests, cannot self-create sessions
- Secrets decrypted by Hub, sent via RPC, Worker materializes to temp files/env vars, cleaned up after session ends (existing `materializeResolvedSecrets` + cleanup)
- Namespace isolation: Worker binds to namespace from enrollment token, only receives same-namespace spawn requests

## Testing

Following project convention: "Write necessary tests ONLY."

### Hub unit tests

- **`resolveCliAuthToken.test.ts`** (exists) -- add enrollment -> workerSession exchange edge cases (expired, reuse)
- **`scheduler.test.ts`** (exists) -- add self-hosted Worker scenarios: capability filtering, load balancing, draining exclusion
- **`spawnCoordinator` state machine test** -- request flows queued -> assigned -> running -> completed, and Worker disconnect re-queue

### CLI unit tests

- **`workerStart.test.ts`** (new) -- enrollment handshake: token exchange, config.json persistence, reconnect with workerSessionToken
- **`runnerLoop.test.ts`** (new) -- extracted core loop: receive spawn RPC, capability detection, graceful exit

### Integration tests

- **`runner.integration.test.ts`** (exists, 43 lines) -- extend: simulate Worker connects Hub -> receives spawn -> reports status end-to-end

### Not testing

- Web UI component tests (no web test requirement in project)
- Docker executor end-to-end (depends on Docker daemon, CI-unstable)
- Network failure simulation (Socket.IO reconnection covered by library)

## Change Summary

| Module | Change |
|--------|--------|
| `cli/src/worker/` | New: `workerStart.ts`, `workerConfig.ts` |
| `cli/src/runner/runnerLoop.ts` | New: extracted core loop from `run.ts` |
| `cli/src/runner/run.ts` | Refactor to call `runRunnerLoop()` |
| `cli/src/commands/` | New: `worker` subcommand |
| `hub/src/socket/` | Connection handshake adds `worker-enrolled` event |
| `hub/src/cloud/spawnCoordinator.ts` | Complete cloud-self-hosted dispatch path |
| `web/src/routes/cloud/workers.tsx` | New: Worker management page |
| `web/src/components/NewSession/` | Add no-Worker guidance prompt |
