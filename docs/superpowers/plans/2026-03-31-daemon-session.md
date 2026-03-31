# Daemon Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add container-isolated agent execution with an in-container `haqi-daemon` process that manages agent lifecycle, runtime preparation, and preview port forwarding.

**Architecture:** New `daemon/` workspace package provides an HTTP+WS server compiled to Bun single-exe. Worker creates Docker containers with daemon as entrypoint, controls agent via HTTP API, bridges stdout/preview to Hub. Hub adds a preview reverse proxy route that tunnels through Worker to daemon.

**Tech Stack:** TypeScript, Bun (compile to single-exe), Hono (HTTP server in daemon), WebSocket, Docker CLI, Zod

---

## File Structure

### New files
- `daemon/package.json` -- new workspace package @hapi/daemon
- `daemon/tsconfig.json`
- `daemon/src/index.ts` -- entry point, parse args, start server
- `daemon/src/server.ts` -- Hono HTTP server + WS upgrade
- `daemon/src/types.ts` -- API request/response types
- `daemon/src/process/manager.ts` -- child process spawn/kill/attach
- `daemon/src/process/output.ts` -- stdout/stderr stream buffer
- `daemon/src/preview/detector.ts` -- port scan for listening services
- `daemon/src/preview/proxy.ts` -- HTTP reverse proxy to local ports
- `daemon/src/runtime/prepare.ts` -- install/start hook execution
- `daemon/scripts/build.ts` -- Bun single-exe build
- `cli/src/cloud/executors/DaemonSessionExecutor.ts` -- new executor
- `cli/src/cloud/executors/DaemonClient.ts` -- HTTP+WS client for daemon API
- `cli/src/cloud/preview/previewBridge.ts` -- Worker-side preview WS bridge
- `hub/src/web/routes/preview.ts` -- Hub preview reverse proxy
- `hub/src/web/routes/preview.test.ts` -- preview route tests
- `Dockerfile.workspace` -- base container image

### Modified files
- `package.json` (root) -- add `daemon` to workspaces
- `shared/src/schemas.ts` -- add `daemon-session` to RuntimeKindSchema, add `preview-available` SyncEvent
- `cli/src/cloud/executors/WorkspaceContainerManager.ts` -- add daemon entrypoint mode
- `hub/src/web/server.ts` -- register preview route
- `hub/src/sync/syncEngine.ts` -- preview tunnel management
- `web/src/hooks/useSSE.ts` -- handle `preview-available` event

---

### Task 1: Scaffold daemon package

**Files:**
- Create: `daemon/package.json`
- Create: `daemon/tsconfig.json`
- Create: `daemon/src/index.ts`
- Create: `daemon/src/types.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Create daemon/package.json**

```json
{
    "name": "@hapi/daemon",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "bun --watch src/index.ts",
        "build": "bun scripts/build.ts",
        "typecheck": "tsc --noEmit",
        "test": "bun test"
    },
    "dependencies": {
        "hono": "^4.0.0",
        "zod": "^3.23.0"
    },
    "devDependencies": {
        "@types/bun": "latest",
        "typescript": "^5.0.0"
    }
}
```

- [ ] **Step 2: Create daemon/tsconfig.json**

```json
{
    "extends": "../tsconfig.base.json",
    "compilerOptions": {
        "rootDir": "src",
        "outDir": "dist",
        "paths": {
            "@/*": ["./src/*"]
        }
    },
    "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create daemon/src/types.ts**

```typescript
import { z } from 'zod'

export const SpawnRequestSchema = z.object({
    command: z.array(z.string()).min(1),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional()
})

export type SpawnRequest = z.infer<typeof SpawnRequestSchema>

export const SpawnResponseSchema = z.object({
    pid: z.number(),
    status: z.enum(['running', 'failed']),
    error: z.string().optional()
})

export type SpawnResponse = z.infer<typeof SpawnResponseSchema>

export const ProcessStatusSchema = z.object({
    pid: z.number().nullable(),
    running: z.boolean(),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    uptimeMs: z.number().nullable()
})

export type ProcessStatus = z.infer<typeof ProcessStatusSchema>

export const PrepareRequestSchema = z.object({
    commands: z.array(z.string()),
    cwd: z.string(),
    env: z.record(z.string()).optional()
})

export type PrepareRequest = z.infer<typeof PrepareRequestSchema>

export const PrepareResponseSchema = z.object({
    success: z.boolean(),
    error: z.string().optional()
})

export type PrepareResponse = z.infer<typeof PrepareResponseSchema>

export const PortInfoSchema = z.object({
    port: z.number(),
    pid: z.number().optional(),
    process: z.string().optional()
})

export type PortInfo = z.infer<typeof PortInfoSchema>

export const HealthResponseSchema = z.object({
    status: z.literal('ok'),
    pid: z.number(),
    uptimeMs: z.number()
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

// WebSocket event types
export type OutputEvent = {
    type: 'stdout' | 'stderr'
    data: string
    timestamp: number
}

export type ProcessEvent = {
    type: 'exit' | 'error' | 'spawn'
    pid?: number
    exitCode?: number | null
    signal?: string | null
    error?: string
    timestamp: number
}

export type PreviewTunnelMessage =
    | {
        type: 'request'
        id: string
        method: string
        path: string
        headers: Record<string, string>
        body?: string
    }
    | {
        type: 'response'
        id: string
        status: number
        headers: Record<string, string>
        body?: string
    }
    | {
        type: 'ws-open'
        id: string
        path: string
        headers: Record<string, string>
    }
    | {
        type: 'ws-data'
        id: string
        data: string
    }
    | {
        type: 'ws-close'
        id: string
        code?: number
    }
```

- [ ] **Step 4: Create daemon/src/index.ts (minimal entry)**

```typescript
const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '9876', 10)
const authToken = process.argv.find((_, i, a) => a[i - 1] === '--auth-token') ?? process.env.HAQI_DAEMON_AUTH_TOKEN ?? ''

if (!authToken) {
    console.error('--auth-token or HAQI_DAEMON_AUTH_TOKEN required')
    process.exit(1)
}

console.log(`haqi-daemon starting on port ${port}`)

// Server will be added in Task 3
import { startServer } from './server'
startServer({ port, authToken })
```

- [ ] **Step 5: Add daemon to root workspaces**

In root `package.json`, add `"daemon"` to the workspaces array.

- [ ] **Step 6: Install deps and verify**

```bash
bun install
cd daemon && bun typecheck
```

- [ ] **Step 7: Commit**

```bash
git add daemon/ package.json bun.lock
git commit -m "feat(daemon): scaffold daemon package with types"
```

---

### Task 2: Process Manager

**Files:**
- Create: `daemon/src/process/manager.ts`
- Create: `daemon/src/process/output.ts`
- Test: `daemon/src/process/manager.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// daemon/src/process/manager.test.ts
import { describe, it, expect, afterEach } from 'bun:test'
import { ProcessManager } from './manager'

describe('ProcessManager', () => {
    let pm: ProcessManager

    afterEach(() => {
        pm?.kill()
    })

    it('spawns a process and reports running', async () => {
        pm = new ProcessManager()
        const result = await pm.spawn({
            command: ['sh', '-c', 'sleep 10'],
            cwd: '/tmp'
        })
        expect(result.pid).toBeGreaterThan(0)
        expect(result.status).toBe('running')

        const status = pm.status()
        expect(status.running).toBe(true)
        expect(status.pid).toBe(result.pid)
    })

    it('reports exit when process finishes', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'echo hello'], cwd: '/tmp' })

        const event = await new Promise<{ type: string; exitCode: number | null }>((resolve) => {
            pm.on('exit', (e) => resolve(e))
        })

        expect(event.type).toBe('exit')
        expect(event.exitCode).toBe(0)
        expect(pm.status().running).toBe(false)
    })

    it('kills a running process', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'sleep 60'], cwd: '/tmp' })
        expect(pm.status().running).toBe(true)

        pm.kill()
        await new Promise(r => setTimeout(r, 500))
        expect(pm.status().running).toBe(false)
    })

    it('collects stdout output', async () => {
        pm = new ProcessManager()
        await pm.spawn({ command: ['sh', '-c', 'echo hello-world'], cwd: '/tmp' })

        const chunks: string[] = []
        pm.on('stdout', (data: string) => chunks.push(data))
        await new Promise(r => setTimeout(r, 500))

        expect(chunks.join('')).toContain('hello-world')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd daemon && bun test src/process/manager.test.ts
```
Expected: FAIL -- module not found

- [ ] **Step 3: Implement ProcessManager**

```typescript
// daemon/src/process/manager.ts
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { SpawnRequest, SpawnResponse, ProcessStatus, ProcessEvent } from '../types'

export class ProcessManager extends EventEmitter {
    private child: ChildProcess | null = null
    private startedAt: number | null = null
    private exitCode: number | null = null
    private exitSignal: string | null = null

    async spawn(request: SpawnRequest): Promise<SpawnResponse> {
        if (this.child && this.status().running) {
            return { pid: 0, status: 'failed', error: 'Process already running' }
        }

        const [cmd, ...args] = request.command
        this.child = spawn(cmd, args, {
            cwd: request.cwd,
            env: { ...process.env, ...(request.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe']
        })

        this.startedAt = Date.now()
        this.exitCode = null
        this.exitSignal = null

        this.child.stdout?.on('data', (data: Buffer) => {
            this.emit('stdout', data.toString())
        })

        this.child.stderr?.on('data', (data: Buffer) => {
            this.emit('stderr', data.toString())
        })

        this.child.on('exit', (code, signal) => {
            this.exitCode = code
            this.exitSignal = signal?.toString() ?? null
            const event: ProcessEvent = {
                type: 'exit',
                pid: this.child?.pid ?? undefined,
                exitCode: code,
                signal: signal?.toString() ?? null,
                timestamp: Date.now()
            }
            this.emit('exit', event)
        })

        this.child.on('error', (err) => {
            const event: ProcessEvent = {
                type: 'error',
                error: err.message,
                timestamp: Date.now()
            }
            this.emit('error', event)
        })

        if (!this.child.pid) {
            return { pid: 0, status: 'failed', error: 'Failed to spawn -- no PID' }
        }

        this.emit('spawn', {
            type: 'spawn',
            pid: this.child.pid,
            timestamp: Date.now()
        } satisfies ProcessEvent)

        return { pid: this.child.pid, status: 'running' }
    }

    status(): ProcessStatus {
        const running = this.child !== null && this.child.exitCode === null && !this.child.killed
        return {
            pid: this.child?.pid ?? null,
            running,
            exitCode: this.exitCode,
            signal: this.exitSignal,
            uptimeMs: running && this.startedAt ? Date.now() - this.startedAt : null
        }
    }

    kill(signal: NodeJS.Signals = 'SIGTERM'): void {
        if (this.child && !this.child.killed) {
            this.child.kill(signal)
        }
    }
}
```

- [ ] **Step 4: Create output buffer**

```typescript
// daemon/src/process/output.ts
export class OutputBuffer {
    private chunks: Array<{ type: 'stdout' | 'stderr'; data: string; timestamp: number }> = []
    private maxChunks = 1000

    push(type: 'stdout' | 'stderr', data: string): void {
        this.chunks.push({ type, data, timestamp: Date.now() })
        if (this.chunks.length > this.maxChunks) {
            this.chunks.shift()
        }
    }

    recent(count = 100): typeof this.chunks {
        return this.chunks.slice(-count)
    }

    clear(): void {
        this.chunks = []
    }
}
```

- [ ] **Step 5: Run tests**

```bash
cd daemon && bun test src/process/manager.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add daemon/src/process/ daemon/src/types.ts
git commit -m "feat(daemon): add process manager with spawn/kill/output"
```

---

### Task 3: daemon HTTP+WS Server

**Files:**
- Create: `daemon/src/server.ts`
- Test: `daemon/src/server.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// daemon/src/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

const AUTH_TOKEN = 'test-token-123'
let baseUrl: string
let server: { stop: () => void }

describe('daemon server', () => {
    beforeAll(async () => {
        const { startServer } = await import('./server')
        server = await startServer({ port: 0, authToken: AUTH_TOKEN })
        baseUrl = `http://localhost:${(server as any).port}`
    })

    afterAll(() => {
        server?.stop()
    })

    it('returns 401 without auth token', async () => {
        const res = await fetch(`${baseUrl}/health`)
        expect(res.status).toBe(401)
    })

    it('returns health check with auth', async () => {
        const res = await fetch(`${baseUrl}/health`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.status).toBe('ok')
        expect(data.pid).toBeGreaterThan(0)
    })

    it('spawns and kills a process', async () => {
        const spawnRes = await fetch(`${baseUrl}/process/spawn`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: ['sleep', '30'], cwd: '/tmp' })
        })
        expect(spawnRes.status).toBe(200)
        const spawnData = await spawnRes.json()
        expect(spawnData.pid).toBeGreaterThan(0)
        expect(spawnData.status).toBe('running')

        const statusRes = await fetch(`${baseUrl}/process/status`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        const statusData = await statusRes.json()
        expect(statusData.running).toBe(true)

        const killRes = await fetch(`${baseUrl}/process/kill`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        expect(killRes.status).toBe(200)

        await new Promise(r => setTimeout(r, 300))
        const afterKill = await fetch(`${baseUrl}/process/status`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        const afterData = await afterKill.json()
        expect(afterData.running).toBe(false)
    })
})
```

- [ ] **Step 2: Implement the server**

```typescript
// daemon/src/server.ts
import { Hono } from 'hono'
import { ProcessManager } from './process/manager'
import { OutputBuffer } from './process/output'
import { SpawnRequestSchema, PrepareRequestSchema } from './types'
import type { HealthResponse } from './types'

type ServerOptions = {
    port: number
    authToken: string
}

export async function startServer(options: ServerOptions) {
    const { port, authToken } = options
    const startedAt = Date.now()
    const processManager = new ProcessManager()
    const outputBuffer = new OutputBuffer()

    processManager.on('stdout', (data: string) => outputBuffer.push('stdout', data))
    processManager.on('stderr', (data: string) => outputBuffer.push('stderr', data))

    const app = new Hono()

    // Auth middleware
    app.use('*', async (c, next) => {
        if (c.req.path === '/health' && c.req.method === 'GET') {
            // Health check: still require auth
        }
        const auth = c.req.header('Authorization')
        if (auth !== `Bearer ${authToken}`) {
            return c.json({ error: 'Unauthorized' }, 401)
        }
        await next()
    })

    app.get('/health', (c) => {
        const response: HealthResponse = {
            status: 'ok',
            pid: process.pid,
            uptimeMs: Date.now() - startedAt
        }
        return c.json(response)
    })

    app.post('/process/spawn', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = SpawnRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid request', details: parsed.error.format() }, 400)
        }
        const result = await processManager.spawn(parsed.data)
        return c.json(result)
    })

    app.post('/process/kill', (c) => {
        processManager.kill()
        return c.json({ ok: true })
    })

    app.get('/process/status', (c) => {
        return c.json(processManager.status())
    })

    app.post('/runtime/prepare', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = PrepareRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid request' }, 400)
        }
        try {
            const { execSync } = await import('node:child_process')
            for (const cmd of parsed.data.commands) {
                execSync(cmd, {
                    cwd: parsed.data.cwd,
                    env: { ...process.env, ...(parsed.data.env ?? {}) },
                    stdio: 'pipe',
                    timeout: 300_000
                })
            }
            return c.json({ success: true })
        } catch (err) {
            return c.json({
                success: false,
                error: err instanceof Error ? err.message : String(err)
            })
        }
    })

    app.get('/preview/ports', async (c) => {
        // Port detection -- will be implemented in Task 4
        return c.json({ ports: [] })
    })

    const bunServer = Bun.serve({
        port: port === 0 ? undefined : port,
        fetch: app.fetch
    })

    const actualPort = bunServer.port
    console.log(`haqi-daemon listening on :${actualPort}`)

    return {
        port: actualPort,
        stop: () => {
            processManager.kill()
            bunServer.stop()
        },
        processManager
    }
}
```

- [ ] **Step 3: Update daemon/src/index.ts to use startServer**

```typescript
// daemon/src/index.ts
import { startServer } from './server'

const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '9876', 10)
const authToken = process.argv.find((_, i, a) => a[i - 1] === '--auth-token') ?? process.env.HAQI_DAEMON_AUTH_TOKEN ?? ''

if (!authToken) {
    console.error('--auth-token or HAQI_DAEMON_AUTH_TOKEN required')
    process.exit(1)
}

const server = await startServer({ port, authToken })

process.on('SIGINT', () => { server.stop(); process.exit(0) })
process.on('SIGTERM', () => { server.stop(); process.exit(0) })
```

- [ ] **Step 4: Run tests**

```bash
cd daemon && bun test src/server.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add daemon/src/server.ts daemon/src/server.test.ts daemon/src/index.ts
git commit -m "feat(daemon): add HTTP server with process and runtime endpoints"
```

---

### Task 4: Preview Port Detector

**Files:**
- Create: `daemon/src/preview/detector.ts`
- Test: `daemon/src/preview/detector.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// daemon/src/preview/detector.test.ts
import { describe, it, expect } from 'bun:test'
import { parseListeningPorts } from './detector'

describe('parseListeningPorts', () => {
    it('parses ss output for listening TCP ports', () => {
        const ssOutput = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      128          0.0.0.0:3000       0.0.0.0:*    users:(("node",pid=1234,fd=20))
LISTEN 0      128          0.0.0.0:9876       0.0.0.0:*    users:(("haqi-daemon",pid=1,fd=10))
LISTEN 0      128       [::1]:5173          [::]:*    users:(("vite",pid=5678,fd=15))`

        const ports = parseListeningPorts(ssOutput, [9876])
        expect(ports).toHaveLength(2)
        expect(ports[0]).toEqual({ port: 3000, pid: 1234, process: 'node' })
        expect(ports[1]).toEqual({ port: 5173, pid: 5678, process: 'vite' })
    })

    it('returns empty array for no listeners', () => {
        const ports = parseListeningPorts('', [9876])
        expect(ports).toEqual([])
    })
})
```

- [ ] **Step 2: Implement detector**

```typescript
// daemon/src/preview/detector.ts
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { PortInfo } from '../types'

const execAsync = promisify(exec)

export function parseListeningPorts(ssOutput: string, excludePorts: number[]): PortInfo[] {
    const exclude = new Set(excludePorts)
    const ports: PortInfo[] = []
    const lines = ssOutput.split('\n').slice(1) // skip header

    for (const line of lines) {
        if (!line.includes('LISTEN')) continue
        const addrMatch = line.match(/:(\d+)\s/)
        if (!addrMatch) continue
        const port = parseInt(addrMatch[1], 10)
        if (exclude.has(port) || port === 0) continue

        const pidMatch = line.match(/\("([^"]+)",pid=(\d+)/)
        ports.push({
            port,
            pid: pidMatch ? parseInt(pidMatch[2], 10) : undefined,
            process: pidMatch?.[1]
        })
    }

    return ports
}

export async function detectListeningPorts(excludePorts: number[]): Promise<PortInfo[]> {
    try {
        const { stdout } = await execAsync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo ""')
        return parseListeningPorts(stdout, excludePorts)
    } catch {
        return []
    }
}
```

- [ ] **Step 3: Wire into server.ts**

Update the `/preview/ports` endpoint in `daemon/src/server.ts`:
```typescript
app.get('/preview/ports', async (c) => {
    const { detectListeningPorts } = await import('./preview/detector')
    const ports = await detectListeningPorts([actualPort])
    return c.json({ ports })
})
```

- [ ] **Step 4: Run tests**

```bash
cd daemon && bun test src/preview/detector.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add daemon/src/preview/
git commit -m "feat(daemon): add preview port detection"
```

---

### Task 5: Preview HTTP Proxy in daemon

**Files:**
- Create: `daemon/src/preview/proxy.ts`
- Test: `daemon/src/preview/proxy.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// daemon/src/preview/proxy.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createPreviewProxy } from './proxy'

describe('createPreviewProxy', () => {
    let targetServer: ReturnType<typeof Bun.serve>
    let targetPort: number

    beforeAll(() => {
        targetServer = Bun.serve({
            fetch(req) {
                const url = new URL(req.url)
                return new Response(JSON.stringify({
                    path: url.pathname,
                    method: req.method
                }), {
                    headers: { 'Content-Type': 'application/json' }
                })
            }
        })
        targetPort = targetServer.port
    })

    afterAll(() => {
        targetServer?.stop()
    })

    it('proxies HTTP request to target port', async () => {
        const proxy = createPreviewProxy()
        const response = await proxy.forward({
            port: targetPort,
            method: 'GET',
            path: '/hello',
            headers: {}
        })
        expect(response.status).toBe(200)
        const body = JSON.parse(response.body ?? '{}')
        expect(body.path).toBe('/hello')
    })
})
```

- [ ] **Step 2: Implement proxy**

```typescript
// daemon/src/preview/proxy.ts
export type ProxyRequest = {
    port: number
    method: string
    path: string
    headers: Record<string, string>
    body?: string
}

export type ProxyResponse = {
    status: number
    headers: Record<string, string>
    body?: string
}

export function createPreviewProxy() {
    return {
        async forward(req: ProxyRequest): Promise<ProxyResponse> {
            const url = `http://127.0.0.1:${req.port}${req.path}`
            const response = await fetch(url, {
                method: req.method,
                headers: req.headers,
                body: req.body
            })

            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value
            })

            const body = await response.text()
            return {
                status: response.status,
                headers: responseHeaders,
                body
            }
        }
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd daemon && bun test src/preview/proxy.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add daemon/src/preview/proxy.ts daemon/src/preview/proxy.test.ts
git commit -m "feat(daemon): add preview HTTP proxy"
```

---

### Task 6: daemon Build Script

**Files:**
- Create: `daemon/scripts/build.ts`

- [ ] **Step 1: Create build script**

```typescript
// daemon/scripts/build.ts
import { $ } from 'bun'
import { join } from 'node:path'

const outDir = join(import.meta.dir, '..', 'dist')

console.log('Building haqi-daemon single executable...')

await $`bun build ${join(import.meta.dir, '..', 'src', 'index.ts')} --compile --outfile ${join(outDir, 'haqi-daemon')}`

console.log(`Built: ${join(outDir, 'haqi-daemon')}`)
```

- [ ] **Step 2: Test build**

```bash
cd daemon && bun run build
ls -la dist/haqi-daemon
```
Expected: binary file exists

- [ ] **Step 3: Test built binary**

```bash
./dist/haqi-daemon --auth-token test --port 0 &
sleep 2
curl -s http://localhost:9876/health -H "Authorization: Bearer test" || echo "check port"
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add daemon/scripts/build.ts
git commit -m "feat(daemon): add Bun single-exe build script"
```

---

### Task 7: Add daemon-session to shared schemas

**Files:**
- Modify: `shared/src/schemas.ts`

- [ ] **Step 1: Add daemon-session RuntimeKind**

In `shared/src/schemas.ts`, find `RuntimeKindSchema` (line ~30):

```typescript
// Before:
export const RuntimeKindSchema = z.enum([
    'host-process',
    'docker-session'
])

// After:
export const RuntimeKindSchema = z.enum([
    'host-process',
    'docker-session',
    'daemon-session'
])
```

- [ ] **Step 2: Add preview-available SyncEvent**

In `shared/src/schemas.ts`, find the SyncEventSchema union (line ~1201). Add a new variant:

```typescript
z.object({
    type: z.literal('preview-available'),
    sessionId: z.string(),
    port: z.number(),
    url: z.string(),
    name: z.string().optional()
})
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas.ts
git commit -m "feat(shared): add daemon-session RuntimeKind and preview-available event"
```

---

### Task 8: DaemonClient (Worker -> daemon HTTP client)

**Files:**
- Create: `cli/src/cloud/executors/DaemonClient.ts`
- Test: `cli/src/cloud/executors/DaemonClient.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// cli/src/cloud/executors/DaemonClient.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DaemonClient } from './DaemonClient'

const AUTH_TOKEN = 'test-token'
let mockServer: ReturnType<typeof Bun.serve>
let client: DaemonClient

describe('DaemonClient', () => {
    beforeAll(() => {
        mockServer = Bun.serve({
            async fetch(req) {
                const url = new URL(req.url)
                const auth = req.headers.get('Authorization')
                if (auth !== `Bearer ${AUTH_TOKEN}`) {
                    return new Response('Unauthorized', { status: 401 })
                }
                if (url.pathname === '/health') {
                    return Response.json({ status: 'ok', pid: 1, uptimeMs: 100 })
                }
                if (url.pathname === '/process/spawn' && req.method === 'POST') {
                    return Response.json({ pid: 42, status: 'running' })
                }
                if (url.pathname === '/process/kill' && req.method === 'POST') {
                    return Response.json({ ok: true })
                }
                if (url.pathname === '/process/status') {
                    return Response.json({ pid: 42, running: true, exitCode: null, signal: null, uptimeMs: 50 })
                }
                if (url.pathname === '/preview/ports') {
                    return Response.json({ ports: [{ port: 3000, process: 'node' }] })
                }
                return new Response('Not found', { status: 404 })
            }
        })
        client = new DaemonClient(`http://localhost:${mockServer.port}`, AUTH_TOKEN)
    })

    afterAll(() => { mockServer?.stop() })

    it('checks health', async () => {
        const health = await client.health()
        expect(health.status).toBe('ok')
    })

    it('spawns process', async () => {
        const result = await client.spawn({ command: ['echo', 'hi'], cwd: '/tmp' })
        expect(result.pid).toBe(42)
    })

    it('kills process', async () => {
        await expect(client.kill()).resolves.not.toThrow()
    })

    it('gets process status', async () => {
        const status = await client.status()
        expect(status.running).toBe(true)
    })

    it('lists preview ports', async () => {
        const ports = await client.previewPorts()
        expect(ports).toHaveLength(1)
        expect(ports[0].port).toBe(3000)
    })
})
```

- [ ] **Step 2: Implement DaemonClient**

```typescript
// cli/src/cloud/executors/DaemonClient.ts
import type {
    SpawnRequest, SpawnResponse, ProcessStatus,
    HealthResponse, PortInfo, PrepareRequest, PrepareResponse
} from '@hapi/daemon/types'

export class DaemonClient {
    constructor(
        private readonly baseUrl: string,
        private readonly authToken: string
    ) {}

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json',
                ...(options?.headers ?? {})
            }
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Daemon ${path} failed (${response.status}): ${text}`)
        }
        return response.json() as Promise<T>
    }

    async health(): Promise<HealthResponse> {
        return this.request('/health')
    }

    async spawn(req: SpawnRequest): Promise<SpawnResponse> {
        return this.request('/process/spawn', {
            method: 'POST',
            body: JSON.stringify(req)
        })
    }

    async kill(): Promise<void> {
        await this.request('/process/kill', { method: 'POST' })
    }

    async status(): Promise<ProcessStatus> {
        return this.request('/process/status')
    }

    async prepare(req: PrepareRequest): Promise<PrepareResponse> {
        return this.request('/runtime/prepare', {
            method: 'POST',
            body: JSON.stringify(req)
        })
    }

    async previewPorts(): Promise<PortInfo[]> {
        const data = await this.request<{ ports: PortInfo[] }>('/preview/ports')
        return data.ports
    }

    async waitReady(timeoutMs = 30_000, intervalMs = 500): Promise<void> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            try {
                await this.health()
                return
            } catch {
                await new Promise(r => setTimeout(r, intervalMs))
            }
        }
        throw new Error(`Daemon not ready after ${timeoutMs}ms`)
    }
}
```

Note: The import from `@hapi/daemon/types` requires adding an `exports` field to `daemon/package.json`:
```json
"exports": {
    "./types": "./src/types.ts"
}
```

- [ ] **Step 3: Run tests**

```bash
cd cli && bun test src/cloud/executors/DaemonClient.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add cli/src/cloud/executors/DaemonClient.ts cli/src/cloud/executors/DaemonClient.test.ts daemon/package.json
git commit -m "feat(cli): add DaemonClient for daemon HTTP API"
```

---

### Task 9: DaemonSessionExecutor

**Files:**
- Create: `cli/src/cloud/executors/DaemonSessionExecutor.ts`
- Modify: `cli/src/cloud/executors/WorkspaceContainerManager.ts`

- [ ] **Step 1: Add daemon mode to WorkspaceContainerManager**

In `cli/src/cloud/executors/WorkspaceContainerManager.ts`, add a `daemonMode` parameter:

```typescript
export async function ensureWorkspaceContainer(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    checkpointId?: string
    sessionLabel: string
    daemonMode?: {
        daemonPort: number
        authToken: string
    }
}): Promise<{
    containerId: string
    previewTargets: PreviewTarget[]
}> {
    // ... existing image pull and port specs ...

    const command = params.daemonMode
        ? ['haqi-daemon', '--port', String(params.daemonMode.daemonPort), '--auth-token', params.daemonMode.authToken]
        : keepaliveCommand()

    const daemonPorts = params.daemonMode
        ? [{ containerPort: params.daemonMode.daemonPort }]
        : []

    const spec: DockerRunSpec = {
        image,
        name: `haqi-workspace-${params.sessionLabel}`,
        command,
        workingDir: params.workspace.workingDirectory,
        mounts,
        ports: [...portSpecs, ...daemonPorts],
        labels: {
            'haqi.runtime': params.daemonMode ? 'daemon-session' : 'docker-session',
            'haqi.workspace_id': params.workspace.workspaceId,
            ...(params.checkpointId ? { 'haqi.checkpoint_id': params.checkpointId } : {})
        },
        detach: true
    }

    // ... rest of existing code ...
}
```

- [ ] **Step 2: Implement DaemonSessionExecutor**

```typescript
// cli/src/cloud/executors/DaemonSessionExecutor.ts
import type { RuntimeKind } from '@hapi/protocol/types'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'
import { DaemonClient } from './DaemonClient'
import { buildSpawnArgs } from './HostProcessExecutor'

const DAEMON_PORT = 9876

export type DaemonSessionResult = {
    runtimeKind: 'daemon-session'
    containerId: string
    daemonClient: DaemonClient
    pid: number
    daemonUrl: string
}

export async function startDaemonSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
}): Promise<DaemonSessionResult> {
    const authToken = crypto.randomUUID()

    // Create container with daemon entrypoint
    const container = await ensureWorkspaceContainer({
        runtime: params.runtime,
        workspace: params.workspace,
        environment: params.environment,
        checkpointId: params.options.checkpointId,
        sessionLabel: params.sessionLabel,
        daemonMode: { daemonPort: DAEMON_PORT, authToken }
    })

    // Get container IP and mapped daemon port
    const inspect = await params.runtime.inspect(container.containerId)
    const daemonHostPort = inspect.portBindings[DAEMON_PORT]
    if (!daemonHostPort) {
        await params.runtime.remove(container.containerId).catch(() => {})
        throw new Error('Daemon port not mapped')
    }

    const daemonUrl = `http://127.0.0.1:${daemonHostPort}`
    const client = new DaemonClient(daemonUrl, authToken)

    // Wait for daemon to be ready
    try {
        await client.waitReady(30_000)
    } catch {
        await params.runtime.remove(container.containerId).catch(() => {})
        throw new Error('Daemon failed to start within 30s')
    }

    // Prepare runtime (install/start hooks)
    const installCommands = params.environment?.environment?.install
    if (installCommands) {
        const commands = Array.isArray(installCommands) ? installCommands : [installCommands]
        const prepResult = await client.prepare({
            commands,
            cwd: params.workspace.workingDirectory,
            env: params.env
        })
        if (!prepResult.success) {
            throw new Error(`Runtime preparation failed: ${prepResult.error}`)
        }
    }

    // Spawn agent process via daemon
    const agentCommand = ['haqi', ...buildSpawnArgs(params.options)]
    const spawnResult = await client.spawn({
        command: agentCommand,
        cwd: params.workspace.workingDirectory,
        env: {
            ...params.env,
            HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
            HAPI_CONTAINER_ID: container.containerId
        }
    })

    if (spawnResult.status !== 'running') {
        throw new Error(`Agent spawn failed: ${spawnResult.error}`)
    }

    return {
        runtimeKind: 'daemon-session',
        containerId: container.containerId,
        daemonClient: client,
        pid: spawnResult.pid,
        daemonUrl
    }
}
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/cloud/executors/DaemonSessionExecutor.ts cli/src/cloud/executors/DaemonClient.ts cli/src/cloud/executors/WorkspaceContainerManager.ts
git commit -m "feat(cli): add DaemonSessionExecutor with daemon lifecycle management"
```

---

### Task 10: Hub Preview Reverse Proxy

**Files:**
- Create: `hub/src/web/routes/preview.ts`
- Create: `hub/src/web/routes/preview.test.ts`
- Modify: `hub/src/web/server.ts`

- [ ] **Step 1: Write the test**

```typescript
// hub/src/web/routes/preview.test.ts
import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import { createPreviewRoutes } from './preview'

describe('preview routes', () => {
    it('returns 404 for unknown session', async () => {
        const app = new Hono()
        app.route('/preview', createPreviewRoutes({
            resolveSession: () => null,
            resolvePreviewTunnel: () => null
        }))

        const res = await app.request('http://localhost/preview/unknown-session/3000/')
        expect(res.status).toBe(404)
    })

    it('returns 502 when no tunnel available', async () => {
        const app = new Hono()
        app.route('/preview', createPreviewRoutes({
            resolveSession: (id) => id === 'sess-1' ? { machineId: 'machine-1' } : null,
            resolvePreviewTunnel: () => null
        }))

        const res = await app.request('http://localhost/preview/sess-1/3000/')
        expect(res.status).toBe(502)
    })

    it('proxies request through tunnel', async () => {
        const app = new Hono()
        app.route('/preview', createPreviewRoutes({
            resolveSession: () => ({ machineId: 'machine-1' }),
            resolvePreviewTunnel: () => ({
                forward: async (req) => ({
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    body: '<h1>Preview</h1>'
                })
            })
        }))

        const res = await app.request('http://localhost/preview/sess-1/3000/index.html')
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('<h1>Preview</h1>')
    })
})
```

- [ ] **Step 2: Implement preview routes**

```typescript
// hub/src/web/routes/preview.ts
import { Hono } from 'hono'

type PreviewTunnel = {
    forward: (req: {
        method: string
        path: string
        headers: Record<string, string>
        body?: string
    }) => Promise<{
        status: number
        headers: Record<string, string>
        body?: string
    }>
}

type PreviewDeps = {
    resolveSession: (sessionId: string) => { machineId: string } | null
    resolvePreviewTunnel: (machineId: string, sessionId: string, port: number) => PreviewTunnel | null
}

export function createPreviewRoutes(deps: PreviewDeps): Hono {
    const app = new Hono()

    app.all('/:sessionId/:port/*', async (c) => {
        const sessionId = c.req.param('sessionId')
        const port = parseInt(c.req.param('port'), 10)
        if (isNaN(port)) {
            return c.text('Invalid port', 400)
        }

        const session = deps.resolveSession(sessionId)
        if (!session) {
            return c.text('Session not found', 404)
        }

        const tunnel = deps.resolvePreviewTunnel(session.machineId, sessionId, port)
        if (!tunnel) {
            return c.text('Preview tunnel not available', 502)
        }

        const path = '/' + (c.req.path.split('/').slice(4).join('/') || '')
        const headers: Record<string, string> = {}
        c.req.raw.headers.forEach((value, key) => {
            if (key !== 'host') headers[key] = value
        })

        const body = c.req.method !== 'GET' && c.req.method !== 'HEAD'
            ? await c.req.text()
            : undefined

        try {
            const response = await tunnel.forward({
                method: c.req.method,
                path,
                headers,
                body
            })

            return new Response(response.body, {
                status: response.status,
                headers: response.headers
            })
        } catch (err) {
            return c.text('Preview proxy error', 502)
        }
    })

    return app
}
```

- [ ] **Step 3: Register route in server.ts**

In `hub/src/web/server.ts`, add the preview route. It should be BEFORE the auth middleware (preview URLs may be public):

```typescript
import { createPreviewRoutes } from './routes/preview'

// Add before auth middleware line:
app.route('/preview', createPreviewRoutes({
    resolveSession: (sessionId) => {
        // ... resolve from syncEngine
    },
    resolvePreviewTunnel: (machineId, sessionId, port) => {
        // ... resolve from preview tunnel registry (Task 11)
        return null // placeholder
    }
}))
```

- [ ] **Step 4: Run tests**

```bash
cd hub && bun test src/web/routes/preview.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hub/src/web/routes/preview.ts hub/src/web/routes/preview.test.ts hub/src/web/server.ts
git commit -m "feat(hub): add preview reverse proxy route"
```

---

### Task 11: Dockerfile + Integration Wiring

**Files:**
- Create: `Dockerfile.workspace`
- Modify: `web/src/hooks/useSSE.ts`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# Dockerfile.workspace
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    git curl jq ca-certificates iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy daemon binary (built from daemon/scripts/build.ts)
COPY daemon/dist/haqi-daemon /usr/local/bin/haqi-daemon
RUN chmod +x /usr/local/bin/haqi-daemon

# Copy CLI binary (for running agents inside container)
COPY cli/dist-exe/bun-linux-x64/hapi /usr/local/bin/haqi
RUN chmod +x /usr/local/bin/haqi

WORKDIR /workspace
ENTRYPOINT ["haqi-daemon"]
```

- [ ] **Step 2: Add preview-available SSE handling**

In `web/src/hooks/useSSE.ts`, add to the `pendingInvalidationsRef` initial value:
```typescript
cloudPreviews: false,
```

Add a queue helper:
```typescript
const queueCloudPreviewsInvalidation = () => {
    pendingInvalidationsRef.current.cloudPreviews = true
}
```

Add event handler:
```typescript
if (event.type === 'preview-available') {
    queueCloudPreviewsInvalidation()
}
```

Add flush:
```typescript
if (pending.cloudPreviews) {
    pending.cloudPreviews = false
    queryClient.invalidateQueries({ queryKey: queryKeys.previewUrlHistory })
}
```

- [ ] **Step 3: Typecheck all packages**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.workspace web/src/hooks/useSSE.ts
git commit -m "feat: add workspace Dockerfile and preview SSE handling"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Build daemon binary**

```bash
cd daemon && bun run build
ls -la dist/haqi-daemon
```

- [ ] **Step 2: Run all tests**

```bash
bun typecheck
bun run test
cd daemon && bun test
```

- [ ] **Step 3: Manual smoke test**

1. Build container image: `docker build -f Dockerfile.workspace -t haqi-workspace:dev .`
2. Start Hub: `HAPI_HOME=~/.hapi-e2e HAPI_LISTEN_PORT=3016 bun run dev`
3. Start Worker: `cd cli && HAPI_HOME=~/.hapi-worker-e2e bun src/index.ts worker start --token <token> --hub-url http://localhost:3016`
4. Spawn daemon-session via API with `runtimeKind: daemon-session`
5. Verify agent runs inside container
6. Start a dev server inside container, check preview URL works

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues from e2e testing"
```
