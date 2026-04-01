# Checkpoint Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable checkpoint-based environment snapshots: setup sessions for interactive configuration, docker commit for snapshots, tree-structured checkpoint derivation, and instant session startup from checkpoints.

**Architecture:** Hub SQLite stores checkpoint metadata, Worker stores Docker images locally. Setup sessions are daemon-sessions with `sessionType: 'setup'`. Saving a checkpoint triggers Worker RPC → daemon docker commit. Future spawns from checkpoints use the committed image, skipping install for instant startup. SpawnCoordinator routes to the checkpoint's Worker.

**Tech Stack:** TypeScript, Bun, SQLite (better-sqlite3), Docker CLI, Hono, React/TanStack Query, Zod

---

## File Structure

### New files
- `hub/src/store/checkpointStore.ts` — checkpoint SQLite CRUD
- `hub/src/store/checkpointStore.test.ts` — checkpoint store tests
- `hub/src/cloud/checkpointRegistry.test.ts` — checkpoint registry tests
- `cli/src/commands/checkpoint.ts` — CLI checkpoint command
- `web/src/routes/cloud/checkpoints.tsx` — checkpoint management page

### Modified files
- `hub/src/store/cloudTables.ts` — add cloud_checkpoints table
- `hub/src/store/index.ts` — expose checkpoint store
- `hub/src/cloud/checkpointRegistry.ts` — rewrite to use DB-backed store
- `hub/src/web/routes/cloud.ts` — checkpoint save/delete endpoints
- `hub/src/sync/rpcGateway.ts` — checkpoint RPC methods
- `hub/src/sync/syncEngine.ts` — checkpoint delegation
- `hub/src/cloud/spawnCoordinator.ts` — checkpoint-aware image resolution + Worker pinning
- `daemon/src/server.ts` — `POST /checkpoint/save` endpoint
- `daemon/src/types.ts` — checkpoint types
- `cli/src/runner/runnerLoop.ts` — checkpoint RPC handlers
- `cli/src/api/apiMachine.ts` — checkpoint RPC handler types
- `cli/src/cloud/executors/DaemonSessionExecutor.ts` — checkpoint image resolution
- `cli/src/cloud/executors/WorkspaceContainerManager.ts` — checkpoint image support
- `cli/src/commands/registry.ts` — register checkpoint command
- `shared/src/schemas.ts` — extend sessionType enum with 'setup'
- `web/src/api/client.ts` — checkpoint API methods
- `web/src/router.tsx` — checkpoints route
- `web/src/components/NewSession/` — checkpoint selector + setup mode
- `web/src/lib/locales/en.ts` + `zh-CN.ts` — checkpoint strings

---

### Task 1: Schema + Storage Layer

**Files:**
- Modify: `shared/src/schemas.ts`
- Modify: `hub/src/store/cloudTables.ts`
- Create: `hub/src/store/checkpointStore.ts`
- Create: `hub/src/store/checkpointStore.test.ts`
- Modify: `hub/src/store/index.ts`

- [ ] **Step 1: Extend sessionType in shared schemas**

In `shared/src/schemas.ts`, find `MachineSpawnRequestSchema` line ~845. Change:
```typescript
// Before:
sessionType: z.enum(['simple', 'worktree']).optional(),
// After:
sessionType: z.enum(['simple', 'worktree', 'setup']).optional(),
```

- [ ] **Step 2: Add cloud_checkpoints table definition**

In `hub/src/store/cloudTables.ts`, add the table creation SQL:

```typescript
export const CLOUD_CHECKPOINTS_TABLE = `
CREATE TABLE IF NOT EXISTS cloud_checkpoints (
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
)
`
```

Register this table in the migration/init function (follow existing pattern for other cloud tables).

- [ ] **Step 3: Write checkpoint store tests**

```typescript
// hub/src/store/checkpointStore.test.ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from '../index'

describe('checkpointStore', () => {
    let store: Store

    beforeEach(() => {
        store = new Store(':memory:')
    })

    it('creates and retrieves a checkpoint', () => {
        const id = store.checkpoints.create({
            namespace: 'default',
            name: 'Node 18 + deps',
            repoUrl: 'https://github.com/test/repo.git',
            parentCheckpointId: null,
            baseImage: 'haqi-workspace:dev',
            dockerImage: 'haqi-checkpoint:abc123',
            machineId: 'worker-1',
            workspacePath: '/workspace',
            environmentJson: null,
            createdBySession: 'session-1'
        })
        expect(id).toBeTruthy()

        const cp = store.checkpoints.get(id)
        expect(cp).not.toBeNull()
        expect(cp!.name).toBe('Node 18 + deps')
        expect(cp!.status).toBe('creating')
    })

    it('updates status to ready', () => {
        const id = store.checkpoints.create({
            namespace: 'default', name: 'test', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.updateStatus(id, 'ready')
        expect(store.checkpoints.get(id)!.status).toBe('ready')
    })

    it('lists by namespace', () => {
        store.checkpoints.create({
            namespace: 'team-a', name: 'cp1', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'team-b', name: 'cp2', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:2',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const list = store.checkpoints.listByNamespace('team-a')
        expect(list).toHaveLength(1)
        expect(list[0].name).toBe('cp1')
    })

    it('lists children of a checkpoint', () => {
        const parentId = store.checkpoints.create({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const children = store.checkpoints.listChildren(parentId)
        expect(children).toHaveLength(1)
        expect(children[0].name).toBe('child')
    })

    it('prevents deletion when children exist', () => {
        const parentId = store.checkpoints.create({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const result = store.checkpoints.delete(parentId)
        expect(result.ok).toBe(false)
        expect(result.reason).toBe('has_children')
    })

    it('deletes leaf checkpoint', () => {
        const id = store.checkpoints.create({
            namespace: 'default', name: 'leaf', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:l',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        const result = store.checkpoints.delete(id)
        expect(result.ok).toBe(true)
        expect(store.checkpoints.get(id)).toBeNull()
    })

    it('filters by repoUrl', () => {
        store.checkpoints.create({
            namespace: 'default', name: 'cp1', repoUrl: 'https://github.com/a/b.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'cp2', repoUrl: 'https://github.com/c/d.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:2',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const list = store.checkpoints.listByNamespace('default', { repoUrl: 'https://github.com/a/b.git' })
        expect(list).toHaveLength(1)
        expect(list[0].name).toBe('cp1')
    })
})
```

- [ ] **Step 4: Implement checkpoint store**

```typescript
// hub/src/store/checkpointStore.ts
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'

export type StoredCheckpoint = {
    id: string
    namespace: string
    name: string
    repoUrl: string | null
    parentCheckpointId: string | null
    baseImage: string
    dockerImage: string
    machineId: string
    workspacePath: string | null
    environmentJson: string | null
    createdBySession: string | null
    status: 'creating' | 'ready' | 'failed'
    createdAt: number
    updatedAt: number
}

export type CreateCheckpointParams = {
    namespace: string
    name: string
    repoUrl: string | null
    parentCheckpointId: string | null
    baseImage: string
    dockerImage: string
    machineId: string
    workspacePath: string | null
    environmentJson: string | null
    createdBySession: string | null
}

export type DeleteCheckpointResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'has_children'; children?: string[] }

export class CheckpointStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    create(params: CreateCheckpointParams): string {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO cloud_checkpoints
            (id, namespace, name, repo_url, parent_checkpoint_id, base_image, docker_image,
             machine_id, workspace_path, environment_json, created_by_session, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)
        `).run(id, params.namespace, params.name, params.repoUrl, params.parentCheckpointId,
            params.baseImage, params.dockerImage, params.machineId, params.workspacePath,
            params.environmentJson, params.createdBySession, now, now)
        return id
    }

    get(id: string): StoredCheckpoint | null {
        return this.db.prepare('SELECT * FROM cloud_checkpoints WHERE id = ?').get(id) as StoredCheckpoint | null
    }

    getByNamespace(id: string, namespace: string): StoredCheckpoint | null {
        return this.db.prepare('SELECT * FROM cloud_checkpoints WHERE id = ? AND namespace = ?')
            .get(id, namespace) as StoredCheckpoint | null
    }

    listByNamespace(namespace: string, filter?: { repoUrl?: string }): StoredCheckpoint[] {
        if (filter?.repoUrl) {
            return this.db.prepare('SELECT * FROM cloud_checkpoints WHERE namespace = ? AND repo_url = ? ORDER BY created_at DESC')
                .all(namespace, filter.repoUrl) as StoredCheckpoint[]
        }
        return this.db.prepare('SELECT * FROM cloud_checkpoints WHERE namespace = ? ORDER BY created_at DESC')
            .all(namespace) as StoredCheckpoint[]
    }

    listChildren(parentId: string): StoredCheckpoint[] {
        return this.db.prepare('SELECT * FROM cloud_checkpoints WHERE parent_checkpoint_id = ? ORDER BY created_at DESC')
            .all(parentId) as StoredCheckpoint[]
    }

    updateStatus(id: string, status: 'creating' | 'ready' | 'failed'): void {
        this.db.prepare('UPDATE cloud_checkpoints SET status = ?, updated_at = ? WHERE id = ?')
            .run(status, Date.now(), id)
    }

    delete(id: string): DeleteCheckpointResult {
        const checkpoint = this.get(id)
        if (!checkpoint) return { ok: false, reason: 'not_found' }

        const children = this.listChildren(id)
        if (children.length > 0) {
            return { ok: false, reason: 'has_children', children: children.map(c => c.id) }
        }

        this.db.prepare('DELETE FROM cloud_checkpoints WHERE id = ?').run(id)
        return { ok: true }
    }
}
```

- [ ] **Step 5: Wire into Store index**

In `hub/src/store/index.ts`, import `CheckpointStore` and expose it:
```typescript
import { CheckpointStore } from './checkpointStore'

// In Store class:
public readonly checkpoints: CheckpointStore

// In constructor:
this.checkpoints = new CheckpointStore(this.db)
```

Also ensure the table creation SQL from `cloudTables.ts` runs during migration.

- [ ] **Step 6: Run tests**

```bash
bun typecheck
cd hub && bun test src/store/checkpointStore.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas.ts hub/src/store/
git commit -m "feat(hub): add checkpoint SQLite store with CRUD + tree queries"
```

---

### Task 2: Rewrite CheckpointRegistry to use DB

**Files:**
- Modify: `hub/src/cloud/checkpointRegistry.ts`
- Create: `hub/src/cloud/checkpointRegistry.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// hub/src/cloud/checkpointRegistry.test.ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from '../store'
import { CheckpointRegistry } from './checkpointRegistry'

describe('CheckpointRegistry', () => {
    let store: Store
    let registry: CheckpointRegistry

    beforeEach(() => {
        store = new Store(':memory:')
        registry = new CheckpointRegistry(store)
    })

    it('saves a checkpoint and retrieves it', () => {
        const id = registry.save({
            namespace: 'default',
            name: 'test-cp',
            repoUrl: 'https://github.com/test/repo.git',
            parentCheckpointId: null,
            baseImage: 'haqi-workspace:dev',
            dockerImage: 'haqi-checkpoint:abc',
            machineId: 'worker-1',
            workspacePath: '/workspace',
            environmentJson: null,
            createdBySession: 'session-1'
        })

        const cp = registry.get(id)
        expect(cp).not.toBeNull()
        expect(cp!.name).toBe('test-cp')
    })

    it('resolves checkpoint for spawn (by id)', () => {
        const id = registry.save({
            namespace: 'default', name: 'cp', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        registry.markReady(id)

        const resolved = registry.resolveForSpawn(id, 'default')
        expect(resolved).not.toBeNull()
        expect(resolved!.dockerImage).toBe('haqi-checkpoint:x')
        expect(resolved!.machineId).toBe('w1')
    })

    it('rejects spawn from non-ready checkpoint', () => {
        const id = registry.save({
            namespace: 'default', name: 'cp', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        // status is still 'creating'
        const resolved = registry.resolveForSpawn(id, 'default')
        expect(resolved).toBeNull()
    })

    it('lists checkpoints for repo', () => {
        registry.save({
            namespace: 'default', name: 'cp1', repoUrl: 'https://github.com/a/b.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        const list = registry.listForRepo('default', 'https://github.com/a/b.git')
        expect(list).toHaveLength(1)
    })

    it('prevents deleting checkpoint with children', () => {
        const parentId = registry.save({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        registry.save({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const result = registry.remove(parentId)
        expect(result.ok).toBe(false)
    })
})
```

- [ ] **Step 2: Rewrite CheckpointRegistry**

```typescript
// hub/src/cloud/checkpointRegistry.ts
import type { Store, StoredCheckpoint, CreateCheckpointParams } from '../store'

export class CheckpointRegistry {
    constructor(private readonly store: Store) {}

    save(params: CreateCheckpointParams): string {
        return this.store.checkpoints.create(params)
    }

    markReady(id: string): void {
        this.store.checkpoints.updateStatus(id, 'ready')
    }

    markFailed(id: string): void {
        this.store.checkpoints.updateStatus(id, 'failed')
    }

    get(id: string): StoredCheckpoint | null {
        return this.store.checkpoints.get(id)
    }

    getByNamespace(id: string, namespace: string): StoredCheckpoint | null {
        return this.store.checkpoints.getByNamespace(id, namespace)
    }

    list(namespace: string): StoredCheckpoint[] {
        return this.store.checkpoints.listByNamespace(namespace)
    }

    listForRepo(namespace: string, repoUrl: string): StoredCheckpoint[] {
        return this.store.checkpoints.listByNamespace(namespace, { repoUrl })
    }

    listChildren(id: string): StoredCheckpoint[] {
        return this.store.checkpoints.listChildren(id)
    }

    resolveForSpawn(checkpointId: string, namespace: string): StoredCheckpoint | null {
        const cp = this.store.checkpoints.getByNamespace(checkpointId, namespace)
        if (!cp || cp.status !== 'ready') return null
        return cp
    }

    remove(id: string): { ok: true } | { ok: false; reason: string; children?: string[] } {
        return this.store.checkpoints.delete(id)
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd hub && bun test src/cloud/checkpointRegistry.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add hub/src/cloud/checkpointRegistry.ts hub/src/cloud/checkpointRegistry.test.ts
git commit -m "feat(hub): rewrite CheckpointRegistry with DB backing + tree queries"
```

---

### Task 3: daemon Checkpoint Endpoint + Worker RPC

**Files:**
- Modify: `daemon/src/server.ts`
- Modify: `daemon/src/types.ts`
- Modify: `cli/src/api/apiMachine.ts`
- Modify: `cli/src/runner/runnerLoop.ts`

- [ ] **Step 1: Add checkpoint types to daemon**

In `daemon/src/types.ts`, add:

```typescript
export const CheckpointSaveRequestSchema = z.object({
    name: z.string().min(1)
})

export type CheckpointSaveRequest = z.infer<typeof CheckpointSaveRequestSchema>

export const CheckpointSaveResponseSchema = z.object({
    imageId: z.string(),
    dockerImage: z.string(),
    success: z.boolean(),
    error: z.string().optional()
})

export type CheckpointSaveResponse = z.infer<typeof CheckpointSaveResponseSchema>
```

- [ ] **Step 2: Add /checkpoint/save to daemon server**

In `daemon/src/server.ts`, add after the `/preview/ports` route:

```typescript
app.post('/checkpoint/save', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = CheckpointSaveRequestSchema.safeParse(body)
    if (!parsed.success) {
        return c.json({ success: false, error: 'Invalid request' }, 400)
    }

    try {
        // Get own container ID from hostname (Docker sets hostname = container ID)
        const { execSync } = await import('node:child_process')
        const hostname = execSync('hostname').toString().trim()
        const checkpointId = `haqi-checkpoint-${Date.now().toString(36)}`
        const dockerImage = `haqi-checkpoint:${checkpointId}`

        // docker commit
        execSync(`docker commit ${hostname} ${dockerImage}`, { timeout: 120_000 })

        return c.json({
            imageId: checkpointId,
            dockerImage,
            success: true
        })
    } catch (err) {
        return c.json({
            imageId: '',
            dockerImage: '',
            success: false,
            error: err instanceof Error ? err.message : String(err)
        })
    }
})
```

Note: `docker commit` from inside the container requires Docker socket access or executing from outside. The daemon may need to delegate this to the Worker instead. Alternative: the RPC handler on the Worker side does the `docker commit` directly since the Worker has Docker CLI access.

**Revised approach**: daemon's `/checkpoint/save` just returns the container ID. The Worker does the actual `docker commit` since it has Docker CLI access.

```typescript
app.post('/checkpoint/save', async (c) => {
    // Return container info so Worker can do the docker commit
    const { execSync } = await import('node:child_process')
    const hostname = execSync('hostname').toString().trim()
    return c.json({
        containerId: hostname,
        success: true
    })
})
```

- [ ] **Step 3: Add checkpoint RPC handlers to Worker**

In `cli/src/api/apiMachine.ts`, extend `MachineRpcHandlers`:

```typescript
checkpointCreate: (params: { containerId: string; checkpointId: string; name: string }) => Promise<{ dockerImage: string; success: boolean; error?: string }>
checkpointDelete: (params: { checkpointId: string; dockerImage: string }) => Promise<{ success: boolean }>
```

Register the handlers in `setRPCHandlers`:

```typescript
this.rpcHandlerManager.registerHandler('checkpoint-create', async (params: any) => {
    return await checkpointCreate(params)
})
this.rpcHandlerManager.registerHandler('checkpoint-delete', async (params: any) => {
    return await checkpointDelete(params)
})
```

In `cli/src/runner/runnerLoop.ts`, add the handler implementations:

```typescript
checkpointCreate: async (params) => {
    const dockerImage = `haqi-checkpoint:${params.checkpointId}`
    try {
        await new DockerCliRuntime().exec({
            containerId: 'unused',
            command: ['echo'],
            workingDir: '/'
        })
        // Actually: use docker commit directly
        const { execSync } = await import('node:child_process')
        execSync(`docker commit ${params.containerId} ${dockerImage}`, { timeout: 120_000 })
        return { dockerImage, success: true }
    } catch (err) {
        return { dockerImage: '', success: false, error: err instanceof Error ? err.message : String(err) }
    }
},
checkpointDelete: async (params) => {
    try {
        const { execSync } = await import('node:child_process')
        execSync(`docker rmi ${params.dockerImage}`, { timeout: 30_000 })
        return { success: true }
    } catch {
        return { success: true } // Image may already be gone
    }
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
bun typecheck
cd daemon && bun test
```

- [ ] **Step 5: Commit**

```bash
git add daemon/src/ cli/src/api/apiMachine.ts cli/src/runner/runnerLoop.ts
git commit -m "feat: add checkpoint save/delete via daemon endpoint + Worker RPC"
```

---

### Task 4: Hub API Endpoints + SpawnCoordinator Changes

**Files:**
- Modify: `hub/src/web/routes/cloud.ts`
- Modify: `hub/src/sync/rpcGateway.ts`
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `hub/src/cloud/spawnCoordinator.ts`

- [ ] **Step 1: Add RPC methods to rpcGateway**

In `hub/src/sync/rpcGateway.ts`, add:

```typescript
async checkpointCreate(machineId: string, params: { containerId: string; checkpointId: string; name: string }): Promise<unknown> {
    return this.machineRpc(machineId, 'checkpoint-create', params)
}

async checkpointDelete(machineId: string, params: { checkpointId: string; dockerImage: string }): Promise<unknown> {
    return this.machineRpc(machineId, 'checkpoint-delete', params)
}
```

- [ ] **Step 2: Add SyncEngine delegation + save flow**

In `hub/src/sync/syncEngine.ts`:

```typescript
async saveCheckpoint(sessionId: string, namespace: string, name: string, parentCheckpointId?: string): Promise<{ checkpointId: string } | { error: string }> {
    const session = this.sessionCache.getSession(sessionId)
    if (!session) return { error: 'Session not found' }
    const metadata = session.metadata as any
    if (!metadata?.machineId || !metadata?.containerId) return { error: 'Session has no container' }

    const checkpointId = randomUUID()
    const dockerImage = `haqi-checkpoint:${checkpointId}`
    const machineId = metadata.machineId

    // Create DB record
    this.store.checkpoints.create({
        namespace,
        name,
        repoUrl: metadata.repositoryUrl ?? null,
        parentCheckpointId: parentCheckpointId ?? null,
        baseImage: metadata.checkpointId ? `haqi-checkpoint:${metadata.checkpointId}` : 'haqi-workspace:dev',
        dockerImage,
        machineId,
        workspacePath: metadata.path ?? '/workspace',
        environmentJson: null,
        createdBySession: sessionId
    })

    // RPC to Worker: docker commit
    try {
        const result = await this.rpcGateway.checkpointCreate(machineId, {
            containerId: metadata.containerId,
            checkpointId,
            name
        }) as any
        if (result?.success) {
            this.store.checkpoints.updateStatus(checkpointId, 'ready')
            return { checkpointId }
        }
        this.store.checkpoints.updateStatus(checkpointId, 'failed')
        return { error: result?.error ?? 'Checkpoint creation failed' }
    } catch (err) {
        this.store.checkpoints.updateStatus(checkpointId, 'failed')
        return { error: err instanceof Error ? err.message : 'RPC failed' }
    }
}

async deleteCheckpoint(checkpointId: string, namespace: string): Promise<{ ok: true } | { error: string }> {
    const cp = this.store.checkpoints.getByNamespace(checkpointId, namespace)
    if (!cp) return { error: 'Checkpoint not found' }

    const deleteResult = this.store.checkpoints.delete(checkpointId)
    if (!deleteResult.ok) return { error: `Cannot delete: ${deleteResult.reason}` }

    // RPC to Worker: docker rmi (best effort)
    try {
        await this.rpcGateway.checkpointDelete(cp.machineId, {
            checkpointId: cp.id,
            dockerImage: cp.dockerImage
        })
    } catch {}

    return { ok: true }
}
```

- [ ] **Step 3: Add Hub API endpoints**

In `hub/src/web/routes/cloud.ts`, add before `return app`:

```typescript
app.post('/cloud/checkpoints/save', async (c) => {
    const engine = getSyncEngine()
    if (!engine) return c.json({ error: 'Not connected' }, 503)
    const namespace = c.get('namespace')
    const body = await c.req.json().catch(() => null)
    const parsed = z.object({
        sessionId: z.string().min(1),
        name: z.string().min(1),
        parentCheckpointId: z.string().optional()
    }).safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

    const result = await engine.saveCheckpoint(
        parsed.data.sessionId, namespace, parsed.data.name, parsed.data.parentCheckpointId
    )
    if ('error' in result) return c.json({ error: result.error }, 500)
    return c.json(result)
})

app.delete('/cloud/checkpoints/:id', async (c) => {
    const engine = getSyncEngine()
    if (!engine) return c.json({ error: 'Not connected' }, 503)
    const namespace = c.get('namespace')
    const result = await engine.deleteCheckpoint(c.req.param('id'), namespace)
    if ('error' in result) return c.json({ error: result.error }, 400)
    return c.json(result)
})

app.get('/cloud/checkpoints/:id/children', (c) => {
    const engine = getSyncEngine()
    if (!engine) return c.json({ error: 'Not connected' }, 503)
    const namespace = c.get('namespace')
    const children = engine.listCheckpointChildren(c.req.param('id'), namespace)
    return c.json({ children })
})
```

- [ ] **Step 4: Update SpawnCoordinator checkpoint resolution**

In `hub/src/cloud/spawnCoordinator.ts`, update `resolveCheckpoint` (line ~704) to check DB first:

```typescript
private resolveCheckpoint(request: any, environment: any): { id: string; dockerImage: string; machineId: string } | null {
    // 1. Check DB for stored checkpoint
    if (request.checkpointId) {
        const stored = this.checkpointRegistry.resolveForSpawn(request.checkpointId, request.namespace)
        if (stored) {
            return {
                id: stored.id,
                dockerImage: stored.dockerImage,
                machineId: stored.machineId
            }
        }
    }

    // 2. Fall back to image-based auto-resolution (existing behavior)
    const image = environment?.runtime?.image
    if (image) {
        return {
            id: `auto-${image}`,
            dockerImage: image,
            machineId: '' // any worker
        }
    }

    return null
}
```

In `selectMachine`: when checkpoint has `machineId`, pin to that Worker:

```typescript
// If checkpoint specifies a machine, require it
if (checkpoint.machineId) {
    const machine = this.machineCache.getMachineByNamespace(checkpoint.machineId, namespace)
    if (!machine || !machine.active) {
        return null // Worker not available
    }
    return machine
}
```

- [ ] **Step 5: Typecheck + tests**

```bash
bun typecheck
cd hub && bun test
```

- [ ] **Step 6: Commit**

```bash
git add hub/src/
git commit -m "feat(hub): checkpoint save/delete API + SpawnCoordinator DB-backed resolution"
```

---

### Task 5: DaemonSessionExecutor Checkpoint Image Support

**Files:**
- Modify: `cli/src/cloud/executors/DaemonSessionExecutor.ts`
- Modify: `cli/src/cloud/executors/WorkspaceContainerManager.ts`

- [ ] **Step 1: Update WorkspaceContainerManager image resolution**

In `cli/src/cloud/executors/WorkspaceContainerManager.ts`, change image resolution (line ~23):

```typescript
// Before:
const image = params.environment?.environment?.runtime?.image
if (!image) {
    throw new Error('docker-session runtime requires environment.runtime.image')
}

// After:
const checkpointImage = params.checkpointImage
const image = checkpointImage ?? params.environment?.environment?.runtime?.image
if (!image) {
    throw new Error('daemon/docker-session requires environment.runtime.image or checkpointImage')
}
```

Add `checkpointImage?: string` to the params type.

- [ ] **Step 2: Update DaemonSessionExecutor to pass checkpoint image**

In `cli/src/cloud/executors/DaemonSessionExecutor.ts`, when spawning, check if `options.checkpointId` resolves to a local Docker image:

```typescript
// Before ensureWorkspaceContainer call:
const checkpointImage = params.options.checkpointId
    ? `haqi-checkpoint:${params.options.checkpointId}`
    : undefined

// Verify checkpoint image exists locally if specified
if (checkpointImage) {
    try {
        await params.runtime.inspect(checkpointImage) // will fail for non-existent
    } catch {
        // Image doesn't exist as container, try as image
        const { runDockerCommand } = await import('@/cloud/docker/dockerCli')
        try {
            await runDockerCommand(['inspect', '--type=image', checkpointImage])
        } catch {
            checkpointImage = undefined // Fall back to base image
        }
    }
}

// Pass to ensureWorkspaceContainer:
const container = await ensureWorkspaceContainer({
    ...params,
    checkpointImage,
    daemonMode: { ... }
})
```

Also: when `checkpointImage` is used, skip install hooks (already installed in checkpoint):

```typescript
// Skip install when using checkpoint
if (!checkpointImage) {
    const installCmds = params.environment?.environment?.install
    if (installCmds) {
        await client.prepare({ ... })
    }
}
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/cloud/executors/
git commit -m "feat(cli): checkpoint image support in DaemonSessionExecutor"
```

---

### Task 6: CLI Checkpoint Command

**Files:**
- Create: `cli/src/commands/checkpoint.ts`
- Modify: `cli/src/commands/registry.ts`

- [ ] **Step 1: Create checkpoint command**

```typescript
// cli/src/commands/checkpoint.ts
import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const checkpointCommand: CommandDefinition = {
    name: 'checkpoint',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'list' || subcommand === 'ls') {
            const { runDockerCommand } = await import('@/cloud/docker/dockerCli')
            const repoFilter = commandArgs.find((_, i, a) => a[i - 1] === '--repo')
            const result = await runDockerCommand([
                'images', '--filter', 'reference=haqi-checkpoint:*',
                '--format', '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}'
            ])
            const lines = result.stdout.trim().split('\n').filter(Boolean)
            if (lines.length === 0) {
                console.log(chalk.yellow('No checkpoints found on this machine.'))
                return
            }
            console.log(chalk.bold('Local checkpoints:\n'))
            for (const line of lines) {
                const [image, size, created] = line.split('\t')
                console.log(`  ${chalk.cyan(image?.padEnd(50))} ${(size ?? '').padEnd(12)} ${chalk.dim(created ?? '')}`)
            }
            return
        }

        if (subcommand === 'delete' || subcommand === 'rm') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi checkpoint delete <checkpoint-id>'))
                process.exit(1)
            }
            const dockerImage = target.startsWith('haqi-checkpoint:') ? target : `haqi-checkpoint:${target}`
            const { runDockerCommand } = await import('@/cloud/docker/dockerCli')
            try {
                await runDockerCommand(['rmi', dockerImage])
                console.log(chalk.green(`Deleted: ${dockerImage}`))
            } catch (err) {
                console.error(chalk.red(`Failed: ${err instanceof Error ? err.message : err}`))
                process.exit(1)
            }
            return
        }

        console.log(`
${chalk.bold('haqi checkpoint')} - Manage environment checkpoints

${chalk.bold('Usage:')}
  haqi checkpoint list                List local checkpoint images
  haqi checkpoint list --repo <url>   Filter by repo (local only)
  haqi checkpoint delete <id>         Delete a checkpoint image
`)
    }
}
```

- [ ] **Step 2: Register in registry.ts**

```typescript
import { checkpointCommand } from './checkpoint'
// Add to COMMANDS array:
checkpointCommand
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/checkpoint.ts cli/src/commands/registry.ts
git commit -m "feat(cli): add haqi checkpoint list/delete command"
```

---

### Task 7: Web UI — Checkpoint Page + New Session Changes

**Files:**
- Create: `web/src/routes/cloud/checkpoints.tsx`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/router.tsx`
- Modify: `web/src/components/NewSession/CloudSettingsSection.tsx`
- Modify: `web/src/components/NewSession/index.tsx`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add API client methods**

In `web/src/api/client.ts`:

```typescript
async saveCheckpoint(sessionId: string, name: string, parentCheckpointId?: string): Promise<{ checkpointId: string }> {
    return await this.request('/api/cloud/checkpoints/save', {
        method: 'POST',
        body: JSON.stringify({ sessionId, name, parentCheckpointId })
    }) as { checkpointId: string }
}

async deleteCheckpoint(id: string): Promise<void> {
    await this.request(`/api/cloud/checkpoints/${id}`, { method: 'DELETE' })
}

async getCheckpointChildren(id: string): Promise<{ children: any[] }> {
    return await this.request(`/api/cloud/checkpoints/${id}/children`) as any
}
```

- [ ] **Step 2: Create checkpoints page**

Create `web/src/routes/cloud/checkpoints.tsx` with:
- Checkpoint list with tree indentation (parent chain)
- Status badges (creating/ready/failed)
- Action buttons: "New Session", "Derive", "Delete"
- Delete confirmation dialog (check children)
- Follow workers.tsx styling patterns

- [ ] **Step 3: Add checkpoint selector to NewSession form**

In `CloudSettingsSection.tsx`:
- When executionBackend is `cloud-self-hosted` and a repo URL is entered:
  - Fetch checkpoints for that repo via `getCloudCheckpoints`
  - Show dropdown/list of available checkpoints
  - Selected checkpoint fills `checkpointId` in spawn payload
- Add "Setup Environment" toggle that sets `sessionType: 'setup'`

In `index.tsx`:
- Thread `sessionType` and `checkpointId` through to spawn payload

- [ ] **Step 4: Add setup session banner**

When session metadata has `sessionType === 'setup'`:
- Show yellow banner at top of session chat
- Show "Save as Checkpoint" button
- On click: dialog for name → call `api.saveCheckpoint(sessionId, name)`
- On success: green toast notification

- [ ] **Step 5: Add locale strings + route**

Add checkpoint-related strings to both locale files.
Add `/cloud/checkpoints` route to `router.tsx`.

- [ ] **Step 6: Build + typecheck**

```bash
bun typecheck
cd web && bun run build
```

- [ ] **Step 7: Commit**

```bash
git add web/src/
git commit -m "feat(web): checkpoint management page, selector, and setup session UI"
```

---

### Task 8: End-to-End Verification

- [ ] **Step 1: Full typecheck**

```bash
bun typecheck
cd daemon && bun run typecheck
```

- [ ] **Step 2: Full tests**

```bash
bun run test
cd daemon && bun test
cd hub && bun test src/store/checkpointStore.test.ts src/cloud/checkpointRegistry.test.ts
```

- [ ] **Step 3: Manual e2e flow**

1. Start Hub + Worker
2. Build `haqi-workspace:dev` image
3. Web UI → New Session → Setup Environment → select repo + base image
4. Agent installs deps in container
5. Click "Save as Checkpoint" → enter name → verify checkpoint in `/cloud/checkpoints`
6. Web UI → New Session → select the checkpoint → spawn
7. Verify: container starts from checkpoint image, no install needed, instant startup
8. Create another setup session from the checkpoint (derive)
9. Save as new checkpoint → verify parent chain in UI
10. Delete leaf checkpoint → success
11. Try delete parent → should fail with "has children"
12. `haqi checkpoint list` on Worker → verify local images

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address e2e verification issues"
```
