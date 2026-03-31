# Workspace Container Management Design

## Overview

Add CLI commands, Hub API endpoints, and Web UI for managing workspace containers. Users can stop sessions (keep container), stop containers (preserve state), or remove containers (delete everything), through three equivalent interfaces.

## CLI Commands

```
haqi workspace list              # List all haqi containers (running/stopped)
haqi workspace stop-session <id> # Kill agent process, daemon + container stay alive
haqi workspace stop <id>         # docker stop container
haqi workspace rm <id>           # docker rm -f container
haqi workspace logs <id>         # Show container logs
haqi workspace clean             # Remove all stopped haqi containers
```

CLI commands operate locally via Docker CLI. They work on the Worker machine directly without going through Hub.

## Hub API Endpoints

For remote management (Web UI and cross-machine):

```
GET    /api/cloud/containers                                    # List containers on all workers
POST   /api/machines/:machineId/containers/:containerId/stop-session  # Kill agent in container
POST   /api/machines/:machineId/containers/:containerId/stop          # Stop container
DELETE /api/machines/:machineId/containers/:containerId               # Remove container
```

Hub routes these to the appropriate Worker via RPC. Worker executes Docker operations.

### RPC Methods (Hub -> Worker)

| RPC Method | Worker Action |
|------------|--------------|
| `container-list` | `docker ps -a --filter label=haqi.runtime` |
| `container-stop-session` | daemon API `POST /process/kill` |
| `container-stop` | `docker stop <id>` |
| `container-remove` | `docker rm -f <id>` |
| `container-logs` | `docker logs <id>` |

## Web UI

Extend `/cloud/workspaces` page:

- Container list table: Name, Status (running/stopped), Workspace ID, Runtime, Ports, Last Updated
- Per-row action buttons:
  - "Stop Session" (yellow) -- visible when container is running
  - "Stop" (orange) -- visible when container is running
  - "Remove" (red) -- always visible
- Top bar: "Clean Stopped" button to remove all stopped containers
- Auto-refresh via SSE machine-updated events

## Operation Matrix

| Operation | Agent Process | Daemon | Container | Workspace Files | Reattach? |
|-----------|--------------|--------|-----------|----------------|-----------|
| Stop Session | Killed | Running | Running | Preserved | Yes, instant |
| Stop Container | Killed | Killed | Stopped | Preserved on disk | Yes, docker start + wait |
| Remove Container | Killed | Killed | Deleted | Lost | No |
| Clean Stopped | N/A | N/A | Deleted (stopped only) | Lost | No |

## Changes

| Module | Change |
|--------|--------|
| `cli/src/commands/workspace.ts` | New CLI command with list/stop-session/stop/rm/logs/clean subcommands |
| `cli/src/commands/registry.ts` | Register workspace command |
| `hub/src/web/routes/cloud.ts` | Add container management endpoints |
| `hub/src/sync/rpcGateway.ts` | Add container RPC methods |
| `cli/src/runner/runnerLoop.ts` | Register container RPC handlers |
| `web/src/routes/cloud/workspace.tsx` | Add container list + action buttons |
| `cli/src/cloud/docker/dockerCli.ts` | Add findContainerByLabel, listContainersByLabel methods |
