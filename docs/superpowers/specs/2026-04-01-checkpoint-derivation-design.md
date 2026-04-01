# Checkpoint Derivation Design

## Overview

Add checkpoint-based environment snapshots that allow users to configure an environment interactively (setup session), save it as a checkpoint (`docker commit`), and derive future sessions from that checkpoint for instant startup. Checkpoints form a tree — any checkpoint can be the parent of new checkpoints.

## Architecture

```
Web UI: "配置环境" → Setup Session
  |
  | User + Agent configure environment interactively
  |
  | User clicks "Save Checkpoint"
  v
Hub → Worker RPC: checkpoint-create
  |
  v
Worker → daemon → docker commit → haqi-checkpoint:<id>
  |
  v
Hub: store checkpoint metadata in SQLite

Future spawn (with checkpointId):
  Hub looks up checkpoint → finds Worker + image
  → Worker starts container from checkpoint image
  → skip install → instant startup
```

Key decisions:
- Checkpoint metadata in Hub SQLite, Docker images on Worker local storage (V1)
- Checkpoints are tree-structured: any checkpoint can be parent of new checkpoints
- V1: checkpoint bound to creating Worker. Future: push to registry for cross-Worker access
- Setup sessions are special daemon-sessions with `sessionType: 'setup'`

## Checkpoint Data Model

### SQLite Schema

```sql
CREATE TABLE cloud_checkpoints (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  repo_url TEXT,
  parent_checkpoint_id TEXT,
  base_image TEXT NOT NULL,
  docker_image TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  workspace_path TEXT,
  environment_json TEXT,
  created_by_session TEXT,
  status TEXT NOT NULL DEFAULT 'creating',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Hub API

```
GET    /api/cloud/checkpoints                    # List (supports ?repoUrl= filter)
GET    /api/cloud/checkpoints/:id                # Detail
POST   /api/cloud/checkpoints/save               # Save from session (triggers Worker RPC)
DELETE /api/cloud/checkpoints/:id                # Delete (notifies Worker to rmi)
GET    /api/cloud/checkpoints/:id/children       # List derived checkpoints
```

### Worker RPC

| Method | Action |
|--------|--------|
| `checkpoint-create` | `docker commit <containerId> haqi-checkpoint:<id>` + report metadata |
| `checkpoint-delete` | `docker rmi haqi-checkpoint:<id>` + confirm |

### Daemon Endpoint

```
POST /checkpoint/save { name }
  → daemon calls docker commit on its own container
  → returns { imageId, size }
```

## Setup Session

### Trigger

Web UI "New Session" form adds mode selector:
- **Normal** (default) — regular work session
- **Setup Environment** — interactive environment configuration session

When Setup is selected:
- Required: repository URL
- Optional: parent checkpoint (derive from existing)
- Optional: base image (when no parent)

### Spawn Request

```json
{
  "runtimeKind": "daemon-session",
  "sessionType": "setup",
  "checkpointId": "parent-abc",
  "environment": { "runtime": { "image": "haqi-workspace:dev" } },
  "workspaceSource": { "repository": { "url": "..." } }
}
```

Worker behavior for `sessionType: 'setup'`:
- If `checkpointId` present: use `haqi-checkpoint:<checkpointId>` as container image
- If not: use base image, clone repo, run install
- Agent runs with `bypassPermissions` (setup needs free operation)

### Save Checkpoint Flow

```
User clicks "Save Checkpoint" in Web UI
  → POST /api/cloud/checkpoints/save
    { sessionId, name, parentCheckpointId? }
  → Hub resolves session → machineId + containerId
  → Hub RPC → Worker: checkpoint-create { containerId, checkpointId, name }
  → Worker → daemon: POST /checkpoint/save
  → daemon: docker commit <containerId> haqi-checkpoint:<id>
  → Worker reports success → Hub updates checkpoint status = 'ready'
```

### Web UI for Setup Session

Session page header shows when `sessionType === 'setup'`:
- Yellow banner: "Environment Setup Session"
- "Save as Checkpoint" button (opens dialog for name input)
- On success: shows checkpoint ID + green confirmation

## Spawning from Checkpoint

### DaemonSessionExecutor Changes

```
if checkpointId exists and Hub has matching checkpoint:
  image = checkpoint.dockerImage  (e.g., haqi-checkpoint:abc123)
  skip install hooks (already done in checkpoint)
else:
  image = environment.runtime.image (e.g., haqi-workspace:dev)
  run install hooks normally
```

### SpawnCoordinator Changes

In `selectMachine`: if spawn specifies `checkpointId`, require the checkpoint's `machineId` Worker. If that Worker is unavailable, return error (V1: no cross-Worker checkpoint access).

### Web UI "New Session" Changes

Add checkpoint selector:
- After user selects repo, show available checkpoints for that repo
- Selecting a checkpoint auto-fills `checkpointId`
- Show checkpoint info (name, parent chain, created time)
- "Or create new environment" link → switches to Setup mode

## Checkpoint Management

### Web UI Page (`/cloud/checkpoints`)

- Checkpoint list: name, repo, status, parent, created time, Worker
- Tree view showing derivation relationships
- Action buttons:
  - "New Session from Checkpoint" → prefill spawn form
  - "Derive New Checkpoint" → prefill setup session form
  - "Delete" → with child-check guard

### CLI

```
haqi checkpoint list                     # List checkpoints on this Worker
haqi checkpoint list --repo <url>        # Filter by repo
haqi checkpoint delete <id>              # Delete (docker rmi + notify Hub)
```

### Deletion Rules

- Cannot delete checkpoint that has children (error lists children)
- On delete: Worker `docker rmi haqi-checkpoint:<id>` → Hub removes metadata

## Testing Requirements

### Hub Unit Tests
- Checkpoint CRUD: create, read, update status, delete
- Store: SQLite read/write, parent query, children query
- Delete cascade guard: reject delete when children exist
- SpawnCoordinator: checkpoint → Worker matching, checkpoint not found → error, Worker unavailable → error
- Save endpoint: session → machine resolution, RPC mock

### Worker Tests
- checkpoint-create RPC handler: docker commit mock, metadata reporting
- checkpoint-delete RPC handler: docker rmi mock

### daemon Tests
- `POST /checkpoint/save`: success response, error handling

### CLI Tests
- checkpoint list: output format, repo filter
- checkpoint delete: success, has-children rejection

### End-to-End Tests
- Setup session → install deps → save checkpoint → verify checkpoint in list
- Spawn work session from checkpoint → verify instant start, environment intact
- Derive checkpoint from checkpoint → verify parent chain
- Delete leaf checkpoint → success; delete parent → rejection

### Web UI Tests (Playwright)
- Checkpoint list page renders
- Setup session flow → save checkpoint → appears in list
- New session with checkpoint selector → spawns correctly

## Change Summary

| Module | Change |
|--------|--------|
| `hub/src/store/cloudStore.ts` | Extend checkpoint table schema |
| `hub/src/store/cloudTables.ts` | Updated CREATE TABLE |
| `hub/src/cloud/checkpointRegistry.ts` | Full CRUD + derivation queries |
| `hub/src/web/routes/cloud.ts` | Checkpoint API endpoints |
| `hub/src/cloud/spawnCoordinator.ts` | Checkpoint → Worker matching + image selection |
| `hub/src/sync/rpcGateway.ts` | checkpoint-create/delete RPC methods |
| `hub/src/sync/syncEngine.ts` | Checkpoint delegation methods |
| `daemon/src/server.ts` | `POST /checkpoint/save` endpoint |
| `cli/src/cloud/executors/DaemonSessionExecutor.ts` | Use checkpoint image when available |
| `cli/src/runner/runnerLoop.ts` | checkpoint RPC handlers |
| `cli/src/commands/checkpoint.ts` | CLI checkpoint command |
| `cli/src/commands/registry.ts` | Register checkpoint command |
| `web/src/routes/cloud/checkpoints.tsx` | Checkpoint management page |
| `web/src/components/NewSession/` | Checkpoint selector + Setup mode |
| `web/src/router.tsx` | Add checkpoints route |
| `web/src/api/client.ts` | Checkpoint API methods |
| `shared/src/schemas.ts` | sessionType field in SpawnRequest |
