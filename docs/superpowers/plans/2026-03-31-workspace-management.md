# Workspace Container Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CLI, API, and Web UI for managing workspace containers (list, stop session, stop container, remove, clean, logs).

**Architecture:** CLI commands use Docker CLI directly for local management. Hub API delegates to Workers via RPC for remote management. Web UI calls Hub API. Three-tier operations: stop session (agent only), stop container (docker stop), remove (docker rm).

**Tech Stack:** TypeScript, Bun, Docker CLI, Hono, React/TanStack Query

---

## File Structure

### New files
- `cli/src/commands/workspace.ts` — CLI command with subcommands
- `cli/src/cloud/docker/containerManager.ts` — Docker container listing/management helpers
- `hub/src/web/routes/containers.ts` — Hub API container management endpoints
- `hub/src/web/routes/containers.test.ts` — Hub route tests
- `web/src/routes/cloud/containers.tsx` — Web UI container list page

### Modified files
- `cli/src/commands/registry.ts` — register workspace command
- `cli/src/api/apiMachine.ts` — add container RPC handlers to MachineRpcHandlers
- `cli/src/runner/runnerLoop.ts` — register container RPC handlers
- `hub/src/web/server.ts` — mount container routes
- `hub/src/sync/rpcGateway.ts` — add container RPC methods
- `web/src/router.tsx` — add containers route
- `web/src/api/client.ts` — add container API methods
- `web/src/lib/locales/en.ts` — add container strings
- `web/src/lib/locales/zh-CN.ts` — add container strings

---

### Task 1: Docker Container Manager Helpers

**Files:**
- Create: `cli/src/cloud/docker/containerManager.ts`

- [ ] **Step 1: Create container manager**

```typescript
// cli/src/cloud/docker/containerManager.ts
import { runDockerCommand, DockerCliRuntime } from './dockerCli'

export type ContainerInfo = {
    id: string
    name: string
    status: string
    workspaceId: string
    runtime: string
    ports: string
    createdAt?: string
}

export async function listHaqiContainers(): Promise<ContainerInfo[]> {
    const result = await runDockerCommand([
        'ps', '-a',
        '--filter', 'label=haqi.runtime',
        '--format', '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Label "haqi.workspace_id"}}\t{{.Label "haqi.runtime"}}\t{{.Ports}}\t{{.CreatedAt}}'
    ])
    return result.stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, name, status, workspaceId, runtime, ports, createdAt] = line.split('\t')
        return {
            id: id ?? '',
            name: name ?? '',
            status: status ?? '',
            workspaceId: workspaceId ?? '',
            runtime: runtime ?? '',
            ports: ports ?? '',
            createdAt
        }
    })
}

export async function stopSessionInContainer(containerId: string): Promise<void> {
    const runtime = new DockerCliRuntime()
    const inspect = await runtime.inspect(containerId)
    const daemonPort = inspect.portBindings[9876]
    if (!daemonPort) {
        throw new Error('No daemon port found — container may not be a daemon-session')
    }
    // Read auth token from container env
    const envResult = await runtime.exec({
        containerId,
        command: ['printenv', 'HAQI_DAEMON_AUTH_TOKEN'],
        workingDir: '/'
    })
    const authToken = envResult.stdout.trim()
    if (!authToken) {
        throw new Error('Cannot read daemon auth token from container')
    }
    // Call daemon API to kill the process
    const response = await fetch(`http://127.0.0.1:${daemonPort}/process/kill`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    if (!response.ok) {
        throw new Error(`Daemon kill failed: ${response.status}`)
    }
}

export async function cleanStoppedContainers(): Promise<string[]> {
    const result = await runDockerCommand([
        'ps', '-a', '-q',
        '--filter', 'label=haqi.runtime',
        '--filter', 'status=exited'
    ]).catch(() => ({ stdout: '', stderr: '' }))
    const ids = result.stdout.trim().split('\n').filter(Boolean)
    const runtime = new DockerCliRuntime()
    const removed: string[] = []
    for (const id of ids) {
        await runtime.remove(id).catch(() => {})
        removed.push(id)
    }
    return removed
}
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck
```

- [ ] **Step 3: Commit**

```bash
git add cli/src/cloud/docker/containerManager.ts
git commit -m "feat(cli): add container manager helpers for listing and management"
```

---

### Task 2: CLI Workspace Command

**Files:**
- Create: `cli/src/commands/workspace.ts`
- Modify: `cli/src/commands/registry.ts`

- [ ] **Step 1: Create workspace command**

```typescript
// cli/src/commands/workspace.ts
import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const workspaceCommand: CommandDefinition = {
    name: 'workspace',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'list' || subcommand === 'ls') {
            const { listHaqiContainers } = await import('@/cloud/docker/containerManager')
            const containers = await listHaqiContainers()
            if (containers.length === 0) {
                console.log(chalk.yellow('No workspace containers found.'))
                return
            }
            console.log(chalk.bold('Workspace containers:\n'))
            for (const c of containers) {
                const statusColor = c.status.includes('Up') ? chalk.green : chalk.red
                console.log(`  ${chalk.cyan(c.id.slice(0, 12))}  ${c.name.padEnd(45)} ${statusColor(c.status.padEnd(20))} ${chalk.dim(c.runtime)}`)
                if (c.workspaceId) console.log(`${' '.repeat(16)}workspace: ${chalk.dim(c.workspaceId)}`)
            }
            return
        }

        if (subcommand === 'stop-session') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace stop-session <container-id>'))
                process.exit(1)
            }
            const { stopSessionInContainer } = await import('@/cloud/docker/containerManager')
            await stopSessionInContainer(target)
            console.log(chalk.green(`Session stopped in ${target}`))
            return
        }

        if (subcommand === 'stop') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace stop <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            await new DockerCliRuntime().stop(target)
            console.log(chalk.green(`Stopped: ${target}`))
            return
        }

        if (subcommand === 'rm' || subcommand === 'remove') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace rm <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            const runtime = new DockerCliRuntime()
            await runtime.stop(target).catch(() => {})
            await runtime.remove(target)
            console.log(chalk.green(`Removed: ${target}`))
            return
        }

        if (subcommand === 'clean') {
            const { cleanStoppedContainers } = await import('@/cloud/docker/containerManager')
            const removed = await cleanStoppedContainers()
            if (removed.length === 0) {
                console.log(chalk.yellow('No stopped containers to clean.'))
            } else {
                for (const id of removed) console.log(chalk.green(`Removed: ${id}`))
                console.log(chalk.green(`Cleaned ${removed.length} container(s).`))
            }
            return
        }

        if (subcommand === 'logs') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace logs <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            console.log(await new DockerCliRuntime().logs(target, 200))
            return
        }

        console.log(`
${chalk.bold('haqi workspace')} - Manage workspace containers

${chalk.bold('Usage:')}
  haqi workspace list              List all workspace containers
  haqi workspace stop-session <id> Stop agent session (container stays alive)
  haqi workspace stop <id>         Stop container (docker stop)
  haqi workspace rm <id>           Remove container (docker rm)
  haqi workspace clean             Remove all stopped containers
  haqi workspace logs <id>         Show container logs
`)
    }
}
```

- [ ] **Step 2: Register in registry.ts**

Add import and entry:
```typescript
import { workspaceCommand } from './workspace'
// Add to COMMANDS array:
workspaceCommand
```

- [ ] **Step 3: Typecheck + test locally**

```bash
bun typecheck
cd cli && bun src/index.ts workspace
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/workspace.ts cli/src/commands/registry.ts
git commit -m "feat(cli): add haqi workspace command for container management"
```

---

### Task 3: Worker-Side Container RPC Handlers

**Files:**
- Modify: `cli/src/api/apiMachine.ts`
- Modify: `cli/src/runner/runnerLoop.ts`

- [ ] **Step 1: Add container RPC handlers to apiMachine.ts**

In `cli/src/api/apiMachine.ts`, extend `MachineRpcHandlers` type and `setRPCHandlers`:

Add to the `MachineRpcHandlers` type (line ~63):
```typescript
type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>
    stopSession: (sessionId: string) => boolean
    requestShutdown: () => void
    containerList: () => Promise<ContainerInfo[]>
    containerStopSession: (containerId: string) => Promise<void>
    containerStop: (containerId: string) => Promise<void>
    containerRemove: (containerId: string) => Promise<void>
    containerLogs: (containerId: string) => Promise<string>
}
```

In `setRPCHandlers`, add the new handler registrations:
```typescript
this.rpcHandlerManager.registerHandler('container-list', async () => {
    return await containerList()
})
this.rpcHandlerManager.registerHandler('container-stop-session', async (params: any) => {
    await containerStopSession(params.containerId)
    return { ok: true }
})
this.rpcHandlerManager.registerHandler('container-stop', async (params: any) => {
    await containerStop(params.containerId)
    return { ok: true }
})
this.rpcHandlerManager.registerHandler('container-remove', async (params: any) => {
    await containerRemove(params.containerId)
    return { ok: true }
})
this.rpcHandlerManager.registerHandler('container-logs', async (params: any) => {
    return await containerLogs(params.containerId)
})
```

- [ ] **Step 2: Register handlers in runnerLoop.ts**

In `cli/src/runner/runnerLoop.ts`, at the `setRPCHandlers` call (line ~1234), add:

```typescript
import { listHaqiContainers, stopSessionInContainer, cleanStoppedContainers } from '@/cloud/docker/containerManager'

// In the setRPCHandlers call:
apiMachine.setRPCHandlers({
    spawnSession,
    stopSession,
    requestShutdown: () => requestShutdown('hapi-app'),
    containerList: () => listHaqiContainers(),
    containerStopSession: (containerId) => stopSessionInContainer(containerId),
    containerStop: async (containerId) => { await new DockerCliRuntime().stop(containerId) },
    containerRemove: async (containerId) => {
        const rt = new DockerCliRuntime()
        await rt.stop(containerId).catch(() => {})
        await rt.remove(containerId)
    },
    containerLogs: async (containerId) => new DockerCliRuntime().logs(containerId)
});
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/api/apiMachine.ts cli/src/runner/runnerLoop.ts
git commit -m "feat(cli): add container management RPC handlers on worker side"
```

---

### Task 4: Hub API Container Endpoints

**Files:**
- Create: `hub/src/web/routes/containers.ts`
- Create: `hub/src/web/routes/containers.test.ts`
- Modify: `hub/src/web/server.ts`
- Modify: `hub/src/sync/rpcGateway.ts`

- [ ] **Step 1: Add RPC methods to rpcGateway.ts**

In `hub/src/sync/rpcGateway.ts`, add methods for container operations. Follow the pattern of `spawnSession` (line 185) which calls `machineRpc`:

```typescript
async containerList(machineId: string): Promise<unknown> {
    return this.machineRpc(machineId, 'container-list', {})
}

async containerStopSession(machineId: string, containerId: string): Promise<unknown> {
    return this.machineRpc(machineId, 'container-stop-session', { containerId })
}

async containerStop(machineId: string, containerId: string): Promise<unknown> {
    return this.machineRpc(machineId, 'container-stop', { containerId })
}

async containerRemove(machineId: string, containerId: string): Promise<unknown> {
    return this.machineRpc(machineId, 'container-remove', { containerId })
}

async containerLogs(machineId: string, containerId: string): Promise<unknown> {
    return this.machineRpc(machineId, 'container-logs', { containerId })
}
```

- [ ] **Step 2: Create container routes**

```typescript
// hub/src/web/routes/containers.ts
import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const containerActionSchema = z.object({
    containerId: z.string().min(1)
})

export function createContainerRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    // List containers across all online workers
    app.get('/cloud/containers', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')

        const machines = engine.getOnlineMachinesByNamespace(namespace)
        const cloudMachines = machines.filter(m =>
            m.metadata?.executorType === 'cloud-self-hosted' || m.metadata?.executorType === 'cloud-managed'
        )

        const allContainers: Array<{ machineId: string; containers: unknown }> = []
        for (const machine of cloudMachines) {
            try {
                const containers = await engine.rpcContainerList(machine.id)
                allContainers.push({ machineId: machine.id, containers })
            } catch {
                allContainers.push({ machineId: machine.id, containers: [] })
            }
        }

        return c.json({ machines: allContainers })
    })

    // Stop session in container
    app.post('/machines/:machineId/containers/stop-session', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const body = await c.req.json().catch(() => null)
        const parsed = containerActionSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            await engine.rpcContainerStopSession(c.req.param('machineId'), parsed.data.containerId)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    // Stop container
    app.post('/machines/:machineId/containers/stop', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const body = await c.req.json().catch(() => null)
        const parsed = containerActionSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            await engine.rpcContainerStop(c.req.param('machineId'), parsed.data.containerId)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    // Remove container
    app.delete('/machines/:machineId/containers/:containerId', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        try {
            await engine.rpcContainerRemove(c.req.param('machineId'), c.req.param('containerId'))
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500)
        }
    })

    return app
}
```

- [ ] **Step 3: Add SyncEngine delegation methods**

In `hub/src/sync/syncEngine.ts`, add thin delegation methods:

```typescript
async rpcContainerList(machineId: string): Promise<unknown> {
    return this.rpcGateway.containerList(machineId)
}
async rpcContainerStopSession(machineId: string, containerId: string): Promise<unknown> {
    return this.rpcGateway.containerStopSession(machineId, containerId)
}
async rpcContainerStop(machineId: string, containerId: string): Promise<unknown> {
    return this.rpcGateway.containerStop(machineId, containerId)
}
async rpcContainerRemove(machineId: string, containerId: string): Promise<unknown> {
    return this.rpcGateway.containerRemove(machineId, containerId)
}
```

- [ ] **Step 4: Mount routes in server.ts**

In `hub/src/web/server.ts`, after the existing cloud routes:
```typescript
import { createContainerRoutes } from './routes/containers'
// After: app.route('/api', createCloudRoutes(getSyncEngine))
app.route('/api', createContainerRoutes(getSyncEngine))
```

- [ ] **Step 5: Write route tests**

```typescript
// hub/src/web/routes/containers.test.ts
import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import { createContainerRoutes } from './containers'

describe('container routes', () => {
    it('returns 503 when engine not connected', async () => {
        const app = new Hono()
        app.route('/api', createContainerRoutes(() => null))
        const res = await app.request('http://localhost/api/cloud/containers')
        expect(res.status).toBe(503)
    })

    it('lists containers from online workers', async () => {
        const app = new Hono()
        app.use('*', async (c, next) => { c.set('namespace', 'default'); await next() })
        app.route('/api', createContainerRoutes(() => ({
            getOnlineMachinesByNamespace: () => [{
                id: 'w1', metadata: { executorType: 'cloud-self-hosted' }
            }],
            rpcContainerList: async () => [{ id: 'c1', name: 'test', status: 'Up' }]
        }) as any))

        const res = await app.request('http://localhost/api/cloud/containers')
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.machines).toHaveLength(1)
        expect(data.machines[0].machineId).toBe('w1')
    })
})
```

- [ ] **Step 6: Run tests + typecheck**

```bash
bun typecheck
cd hub && bun test src/web/routes/containers.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add hub/src/web/routes/containers.ts hub/src/web/routes/containers.test.ts hub/src/web/server.ts hub/src/sync/rpcGateway.ts hub/src/sync/syncEngine.ts
git commit -m "feat(hub): add container management API endpoints"
```

---

### Task 5: Web UI Container Management Page

**Files:**
- Create: `web/src/routes/cloud/containers.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add API client methods**

In `web/src/api/client.ts`, add:

```typescript
async getCloudContainers(): Promise<{ machines: Array<{ machineId: string; containers: any[] }> }> {
    return await this.request('/api/cloud/containers')
}

async containerStopSession(machineId: string, containerId: string): Promise<void> {
    await this.request(`/api/machines/${machineId}/containers/stop-session`, {
        method: 'POST',
        body: JSON.stringify({ containerId })
    })
}

async containerStop(machineId: string, containerId: string): Promise<void> {
    await this.request(`/api/machines/${machineId}/containers/stop`, {
        method: 'POST',
        body: JSON.stringify({ containerId })
    })
}

async containerRemove(machineId: string, containerId: string): Promise<void> {
    await this.request(`/api/machines/${machineId}/containers/${containerId}`, {
        method: 'DELETE'
    })
}
```

- [ ] **Step 2: Create containers page**

```tsx
// web/src/routes/cloud/containers.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useTranslation } from '@/lib/use-translation'

type ContainerInfo = {
    id: string
    name: string
    status: string
    workspaceId: string
    runtime: string
    ports: string
}

type MachineContainers = {
    machineId: string
    containers: ContainerInfo[]
}

export default function CloudContainersPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: ['cloud-containers'],
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudContainers()
        }
    })

    const stopSessionMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerStopSession(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    const stopMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerStop(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    const removeMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerRemove(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    if (query.isLoading) {
        return <div className="flex min-h-[40vh] items-center justify-center"><LoadingState label="Loading..." /></div>
    }
    if (query.isError) {
        return <div className="p-4 text-sm text-red-500">Failed to load containers</div>
    }

    const machines: MachineContainers[] = query.data?.machines ?? []
    const allContainers = machines.flatMap(m => m.containers.map(c => ({ ...c, machineId: m.machineId })))

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.containers.title')}</h1>
            </div>

            {allContainers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center text-sm text-[var(--app-hint)]">
                    {t('cloud.containers.empty')}
                </div>
            ) : (
                <div className="grid gap-3">
                    {allContainers.map((c) => {
                        const isRunning = c.status?.includes('Up')
                        return (
                            <div key={c.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                isRunning
                                                    ? 'bg-emerald-500/15 text-emerald-700'
                                                    : 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
                                            }`}>
                                                {isRunning ? 'running' : 'stopped'}
                                            </span>
                                            <span className="font-mono text-sm">{c.name || c.id?.slice(0, 12)}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-[var(--app-hint)]">
                                            {c.runtime && <span className="mr-3">Runtime: {c.runtime}</span>}
                                            {c.workspaceId && <span className="mr-3">Workspace: {c.workspaceId}</span>}
                                            {c.ports && <span>Ports: {c.ports}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {isRunning && (
                                            <>
                                                <button
                                                    onClick={() => stopSessionMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                    className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/25"
                                                >
                                                    {t('cloud.containers.stopSession')}
                                                </button>
                                                <button
                                                    onClick={() => stopMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                    className="rounded bg-orange-500/15 px-2 py-1 text-xs text-orange-700 hover:bg-orange-500/25"
                                                >
                                                    {t('cloud.containers.stop')}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => removeMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                            className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-700 hover:bg-red-500/25"
                                        >
                                            {t('cloud.containers.remove')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 3: Add route to router.tsx**

```typescript
import CloudContainersPage from '@/routes/cloud/containers'

const cloudContainersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cloud/containers',
    component: CloudContainersPage,
})

// Add to routeTree
```

- [ ] **Step 4: Add locale strings**

In `en.ts`:
```typescript
cloud: {
    containers: {
        title: 'Containers',
        empty: 'No workspace containers running.',
        stopSession: 'Stop Session',
        stop: 'Stop Container',
        remove: 'Remove'
    }
}
```

In `zh-CN.ts`:
```typescript
cloud: {
    containers: {
        title: '容器管理',
        empty: '没有运行中的工作区容器。',
        stopSession: '停止会话',
        stop: '停止容器',
        remove: '删除'
    }
}
```

- [ ] **Step 5: Typecheck + build**

```bash
bun typecheck
cd web && bun run build
```

- [ ] **Step 6: Commit**

```bash
git add web/src/routes/cloud/containers.tsx web/src/router.tsx web/src/api/client.ts web/src/lib/locales/en.ts web/src/lib/locales/zh-CN.ts
git commit -m "feat(web): add container management page with stop/remove actions"
```

---

### Task 6: Verification

- [ ] **Step 1: Full typecheck**

```bash
bun typecheck
cd daemon && bun run typecheck
```

- [ ] **Step 2: Full tests**

```bash
bun run test
cd daemon && bun test
cd hub && bun test src/web/routes/containers.test.ts
```

- [ ] **Step 3: Manual test**

1. Start Hub + Worker
2. Spawn a daemon-session
3. `haqi workspace list` — verify container shows
4. `haqi workspace stop-session <id>` — verify agent stops, container stays
5. `haqi workspace stop <id>` — verify container stops
6. Web UI at `/cloud/containers` — verify list + buttons work

- [ ] **Step 4: Commit fixes**

```bash
git add -A && git commit -m "fix: address verification issues"
```
