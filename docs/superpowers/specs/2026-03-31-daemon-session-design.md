# Daemon Session Design: Container-Isolated Agent Execution with Preview Tunnel

## Overview

Add a `daemon-session` execution mode where each Agent session runs inside a Docker container with a dedicated `haqi-daemon` process. The daemon manages agent lifecycle, runtime preparation, and preview port forwarding. It communicates exclusively with the Worker process (HTTP+WS), which bridges to the Hub.

This addresses two blockers from the Cursor Cloud Agent feature gap analysis: (1) execution isolation and (2) preview port forwarding.

## Architecture

```
User Browser
     |
     | GET hub.example.com/preview/session-xxx/3000/
     v
+--------------------------------------------------------------------+
|                          Hub (Control Plane)                        |
|                                                                    |
|  +------------------+  +-------------------+  +------------------+ |
|  | SpawnCoordinator |  | Preview Proxy     |  | SSE / REST API   | |
|  | (dispatch spawn) |  | (reverse proxy    |  | (status/messages)| |
|  |                  |  |  via WS tunnel)   |  |                  | |
|  +------------------+  +-------------------+  +------------------+ |
|           |                     ^                                   |
+-----------|---------------------|-----------------------------------+
            | Socket.IO           | WS tunnel (preview traffic)
            v                     |
+-----------|---------------------|-----------------------------------+
|           Worker                |                                   |
|                                 |                                   |
|  +------------------+  +-------------------+                        |
|  | runnerLoop       |  | Preview Tunnel    |                        |
|  | (spawn RPC)      |  | Bridge            |                        |
|  +--------+---------+  | (Hub WS <-> daemon|                        |
|           |             |  HTTP proxy)      |                        |
|           | docker run  +--------+----------+                        |
|           v                      v                                   |
|  +-----------------------------------------------+                  |
|  |        Docker Container (per session)          |                  |
|  |                                                |                  |
|  |  +------------------+  +--------------------+  |                  |
|  |  | haqi-daemon      |  | Agent (claude/     |  |                  |
|  |  | (HTTP+WS server) |  |  codex/cursor)     |  |                  |
|  |  |                  |  |                    |  |                  |
|  |  | - process mgmt   |  | - read/write code  |  |                  |
|  |  | - preview detect |  | - run commands     |  |                  |
|  |  | - runtime prep   |  | - dev server :3000 |  |                  |
|  |  +------------------+  +--------------------+  |                  |
|  +-----------------------------------------------+                  |
+----------------------------------------------------------------------+
```

Data flow:
1. Hub -> Worker (Socket.IO RPC): "spawn session on repo X"
2. Worker -> Docker: create container with daemon entrypoint
3. Worker -> daemon (HTTP): `POST /runtime/prepare` then `POST /process/spawn`
4. daemon -> agent process: fork child
5. daemon -> Worker (WS `/ws/output`): realtime stdout/stderr
6. Worker -> Hub (Socket.IO): forward messages and state
7. Preview: daemon detects port -> Worker opens WS tunnel to Hub -> Hub reverse-proxies to user browser

## daemon Package

### Structure

```
daemon/
  package.json            # name: @hapi/daemon
  tsconfig.json
  src/
    index.ts              # entry: parse args, start server
    server.ts             # HTTP + WebSocket server (Bun.serve)
    process/
      manager.ts          # child process lifecycle (spawn/kill/attach)
      output.ts           # stdout/stderr streaming + event buffering
    preview/
      detector.ts         # port scan (periodic check for listening ports)
      proxy.ts            # HTTP reverse proxy to container dev server
    runtime/
      prepare.ts          # install/start hooks execution
      env.ts              # env var injection, secret materialization
    types.ts              # daemon API type definitions
  scripts/
    build.ts              # Bun single-exe build script
```

### daemon API (HTTP + WS)

Worker calls daemon at `http://<container-ip>:9876`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/process/spawn` | Start agent child process, returns pid |
| POST | `/process/kill` | Terminate child process |
| GET | `/process/status` | Process state + resource usage |
| POST | `/runtime/prepare` | Execute install/start hooks |
| GET | `/preview/ports` | List currently listening ports |
| GET | `/health` | daemon health check |
| WS | `/ws/output` | Realtime stdout/stderr stream |
| WS | `/ws/events` | Process lifecycle events (exit, error) |
| WS | `/preview/tunnel/:port` | WS tunnel entry for preview port |

All requests require `Authorization: Bearer <token>` where token is passed to daemon at startup.

### Startup

```bash
haqi-daemon --port 9876 --auth-token <random-token>
```

Worker generates the auth token (`crypto.randomUUID()`) when creating the container and passes it via `HAQI_DAEMON_AUTH_TOKEN` environment variable.

## Worker-Side Changes

### New DaemonSessionExecutor

Replaces `docker exec haqi claude` with daemon HTTP API control.

```
Worker receives spawn RPC
  |
  +- 1. prepareWorkspace() (existing)
  |     +- git clone, prepare workspace directory
  |
  +- 2. createDaemonContainer()
  |     +- docker run --entrypoint haqi-daemon
  |        --port 9876 --auth-token <random>
  |        -v workspace:/workspace
  |
  +- 3. waitForDaemonReady()
  |     +- poll GET /health until 200 (timeout 30s)
  |
  +- 4. POST /runtime/prepare
  |     +- daemon executes install/start hooks inside container
  |
  +- 5. POST /process/spawn
  |     +- daemon starts agent child process
  |     +- returns pid
  |
  +- 6. connectOutputStreams()
  |     +- WS /ws/output -> forward to Hub (Socket.IO message)
  |     +- WS /ws/events -> forward state to Hub
  |
  +- 7. startPreviewBridge()
        +- GET /preview/ports periodic poll
        +- new port discovered -> open WS tunnel to Hub
```

### Relationship to existing code

- `DockerSessionExecutor` preserved (backward compatible)
- `DaemonSessionExecutor` is the new path
- `RuntimeKind` schema extended with `'daemon-session'`
- `WorkspaceContainerManager` supports two startup modes: keepalive (old) and daemon entrypoint (new)

### Preview Bridge

Worker maintains:
- `Map<port, WebSocket>` -- one WS connection per preview port to daemon
- Corresponding WS tunnel connection to Hub for each port
- Data flow: Hub <- WS -> Worker <- WS -> daemon <- HTTP proxy -> dev server

## Hub-Side Preview Reverse Proxy

### New route: `hub/src/web/routes/preview.ts`

```
Browser requests /preview/<sessionId>/<port>/path...
  |
  +- Resolve sessionId -> machineId (from sessionCache)
  +- Resolve machineId -> Worker socket (from machineCache)
  +- Find or create WS tunnel to Worker for this session+port
  +- Forward HTTP request through tunnel:
     { requestId, method, path, headers, body }
  +- Receive response through tunnel:
     { requestId, status, headers, body }
  +- Return to browser
```

### Key behaviors

- **URL format**: `/preview/<sessionId>/<port>/` -- sessionId routes to Worker, port specifies container port
- **WebSocket upgrade**: preview route detects `Upgrade: websocket` header and switches to WS proxy mode (required for HMR)
- **Multiplexing**: one WS tunnel per session between Worker and Hub, requests multiplexed via requestId + port number
- **Timeout**: 30s per request. No active tunnel returns 502
- **Auth**: preview URLs are private by default (require Hub JWT cookie), configurable as public via `PreviewTarget.visibility`
- **SSE event**: `preview-available` fired when daemon detects a new listening port

## Container Base Image

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    git curl jq ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

COPY haqi-daemon /usr/local/bin/haqi-daemon
RUN chmod +x /usr/local/bin/haqi-daemon

COPY haqi /usr/local/bin/haqi
RUN chmod +x /usr/local/bin/haqi

WORKDIR /workspace
ENTRYPOINT ["haqi-daemon"]
```

- Users can customize images (specify in `EnvironmentTemplate.runtime.image`), must pre-install `haqi-daemon`
- Official `haqi-workspace:latest` image provided with common toolchains
- `checkpointId` can reference user images extending the official one
- Development: daemon binary injected via volume mount
- Production: pre-installed in image

## Error Handling

### Container lifecycle

| Stage | Failure handling |
|-------|-----------------|
| Docker pull image | Worker reports `preparing-workspace: failed`, request marked failed |
| Container start | Same as above |
| daemon health check timeout (30s) | Worker kills container, reports failure |
| `POST /runtime/prepare` failure | daemon returns error, Worker reports, optional retry |
| `POST /process/spawn` failure | daemon returns error, Worker reports, container preserved for debugging |
| Agent process crash | daemon reports via `/ws/events` with exit code, Worker forwards to Hub |
| daemon process crash | Worker health check detects (10s poll), reports container anomaly |
| Worker disconnect | Hub detects heartbeat timeout, session marked disconnected. Container keeps running (daemon is independent). Worker can re-attach on reconnect |
| Session complete / user stop | Hub -> Worker RPC -> `POST /process/kill` -> daemon gracefully terminates child -> Worker cleans up container |

### Container cleanup

- Normal completion: Worker calls `docker rm -f`
- Abnormal: Worker scans for orphan containers with `haqi.runtime=daemon-session` label on startup, removes those exceeding TTL
- TTL: 60 minutes with no active process by default. Configurable via `EnvironmentTemplate.ttlMinutes`

### daemon-Worker authentication

- Worker generates random token (`crypto.randomUUID()`) per container
- Passed via `HAQI_DAEMON_AUTH_TOKEN` environment variable
- All daemon HTTP/WS requests require `Authorization: Bearer <token>`
- Token lifetime = container lifetime

## Schema Changes

- `shared/src/schemas.ts`: Add `'daemon-session'` to `RuntimeKindSchema`
- `shared/src/schemas.ts`: Add `preview-available` to SyncEvent types
- `hub/src/web/routes/preview.ts`: New route module
- `cli/src/cloud/types.ts`: Add daemon-related types to `RuntimeHandle`

## Testing

### daemon package unit tests

- `daemon/src/process/manager.test.ts` -- spawn/kill child, exit event reporting, stdout/stderr collection
- `daemon/src/preview/detector.test.ts` -- port scan logic (mock `ss` output)
- `daemon/src/server.test.ts` -- HTTP API endpoints (health, spawn, kill, status), auth token validation

### Worker integration tests

- `cli/src/cloud/executors/DaemonSessionExecutor.test.ts` -- mock daemon HTTP, verify Worker calls daemon API in correct sequence

### Hub tests

- `hub/src/web/routes/preview.test.ts` -- route parsing, session->machine lookup, 502 when no tunnel

### End-to-end (manual with Playwright)

1. Build daemon exe + container image
2. Start Hub + Worker
3. Spawn daemon-session via Web UI
4. Verify agent executes inside container
5. Start dev server in container -> verify preview URL accessible from browser

## Change Summary

| Module | Change |
|--------|--------|
| `daemon/` | New package: HTTP+WS server, process management, preview detection+proxy, runtime preparation |
| `cli/src/cloud/executors/DaemonSessionExecutor.ts` | New executor: control container agent via daemon API |
| `cli/src/cloud/executors/WorkspaceContainerManager.ts` | Support daemon entrypoint startup mode |
| `hub/src/web/routes/preview.ts` | Preview reverse proxy (WS tunnel to container) |
| `shared/src/schemas.ts` | Add `daemon-session` RuntimeKind, `preview-available` event |
| Container image | Dockerfile + build scripts |
