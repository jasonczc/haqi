# Self-Hosted Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to register remote machines as Workers that connect to Hub via enrollment tokens and execute Agent sessions.

**Architecture:** Self-hosted Worker reuses the existing Runner loop (`run.ts`). The core spawn logic is extracted into a shared `runnerLoop.ts`, called by both local Runner and remote Worker. Worker authenticates via enrollment token, connects over Socket.IO, and receives spawn requests via RPC.

**Tech Stack:** TypeScript, Bun, Socket.IO, Zod, Hono, React/TanStack Query, Vitest

---

## File Structure

### New files
- `cli/src/worker/workerConfig.ts` — read/write `~/.haqi-worker/config.json`
- `cli/src/worker/workerStart.ts` — Worker entry point: enrollment handshake + launch runnerLoop
- `cli/src/worker/detectCapabilities.ts` — auto-detect docker, CPU, memory, disk
- `cli/src/commands/worker.ts` — CLI command: `haqi worker start|stop|status`
- `cli/src/runner/runnerLoop.ts` — extracted core loop from `run.ts`
- `web/src/routes/cloud/workers.tsx` — Worker management page

### Modified files
- `cli/src/commands/registry.ts` — register `workerCommand`
- `cli/src/runner/run.ts` — refactor to call `runnerLoop()`
- `hub/src/socket/server.ts` — emit `worker-enrolled` after enrollment auth
- `hub/src/cloud/spawnCoordinator.ts` — no changes needed (already complete)
- `web/src/router.tsx` — add `/cloud/workers` route
- `web/src/lib/locales/en.ts` — add Worker page strings
- `web/src/lib/locales/zh-CN.ts` — add Worker page strings

---

### Task 1: Worker Config Persistence

**Files:**
- Create: `cli/src/worker/workerConfig.ts`
- Test: `cli/src/worker/workerConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// cli/src/worker/workerConfig.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readWorkerConfig, writeWorkerConfig, clearWorkerConfig, type WorkerConfig } from './workerConfig'

describe('workerConfig', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haqi-worker-test-'))
    })

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('returns null when no config exists', async () => {
        const config = await readWorkerConfig(tempDir)
        expect(config).toBeNull()
    })

    it('writes and reads config', async () => {
        const config: WorkerConfig = {
            hubUrl: 'https://hub.example.com',
            workerSessionToken: 'wst_abc123',
            machineId: 'machine-1',
            namespace: 'default'
        }
        await writeWorkerConfig(config, tempDir)
        const read = await readWorkerConfig(tempDir)
        expect(read).toEqual(config)
    })

    it('clears config', async () => {
        await writeWorkerConfig({
            hubUrl: 'https://hub.example.com',
            workerSessionToken: 'wst_abc123',
            machineId: 'machine-1',
            namespace: 'default'
        }, tempDir)
        await clearWorkerConfig(tempDir)
        const read = await readWorkerConfig(tempDir)
        expect(read).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test src/worker/workerConfig.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// cli/src/worker/workerConfig.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export type WorkerConfig = {
    hubUrl: string
    workerSessionToken: string
    machineId: string
    namespace: string
}

const CONFIG_FILE = 'config.json'

function defaultConfigDir(): string {
    return path.join(os.homedir(), '.haqi-worker')
}

export async function readWorkerConfig(configDir?: string): Promise<WorkerConfig | null> {
    const dir = configDir ?? defaultConfigDir()
    const filePath = path.join(dir, CONFIG_FILE)
    try {
        const content = await fs.readFile(filePath, 'utf8')
        const parsed = JSON.parse(content)
        if (
            typeof parsed.hubUrl === 'string' &&
            typeof parsed.workerSessionToken === 'string' &&
            typeof parsed.machineId === 'string' &&
            typeof parsed.namespace === 'string'
        ) {
            return parsed as WorkerConfig
        }
        return null
    } catch {
        return null
    }
}

export async function writeWorkerConfig(config: WorkerConfig, configDir?: string): Promise<void> {
    const dir = configDir ?? defaultConfigDir()
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, CONFIG_FILE)
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8')
}

export async function clearWorkerConfig(configDir?: string): Promise<void> {
    const dir = configDir ?? defaultConfigDir()
    const filePath = path.join(dir, CONFIG_FILE)
    await fs.rm(filePath, { force: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test src/worker/workerConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add cli/src/worker/workerConfig.ts cli/src/worker/workerConfig.test.ts
git commit -m "feat(worker): add worker config persistence"
```

---

### Task 2: Capability Auto-Detection

**Files:**
- Create: `cli/src/worker/detectCapabilities.ts`
- Test: `cli/src/worker/detectCapabilities.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// cli/src/worker/detectCapabilities.test.ts
import { describe, it, expect } from 'vitest'
import { detectWorkerCapabilities } from './detectCapabilities'

describe('detectWorkerCapabilities', () => {
    it('returns capabilities with numeric resource values', async () => {
        const caps = await detectWorkerCapabilities()
        expect(caps.resources).toBeDefined()
        expect(caps.resources!.cpu).toBeGreaterThan(0)
        expect(caps.resources!.memoryMb).toBeGreaterThan(0)
        expect(typeof caps.docker).toBe('boolean')
        expect(typeof caps.internetAccess).toBe('boolean')
        expect(caps.maxConcurrentSessions).toBeGreaterThan(0)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test src/worker/detectCapabilities.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// cli/src/worker/detectCapabilities.ts
import os from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorkerCapabilities } from '@hapi/protocol/types'

const execAsync = promisify(exec)

async function commandExists(cmd: string): Promise<boolean> {
    try {
        await execAsync(`command -v ${cmd}`)
        return true
    } catch {
        return false
    }
}

async function getAvailableDiskGb(): Promise<number> {
    try {
        const { stdout } = await execAsync("df -BG --output=avail / | tail -1")
        const match = stdout.trim().match(/(\d+)/)
        return match ? parseInt(match[1], 10) : 0
    } catch {
        try {
            // macOS fallback
            const { stdout } = await execAsync("df -g / | tail -1 | awk '{print $4}'")
            return parseInt(stdout.trim(), 10) || 0
        } catch {
            return 0
        }
    }
}

export async function detectWorkerCapabilities(): Promise<WorkerCapabilities> {
    const hasDocker = await commandExists('docker')
    const diskGb = await getAvailableDiskGb()

    return {
        docker: hasDocker,
        dockerSession: hasDocker,
        internetAccess: true,
        maxConcurrentSessions: os.cpus().length,
        resources: {
            cpu: os.cpus().length,
            memoryMb: Math.floor(os.totalmem() / 1024 / 1024),
            ...(diskGb > 0 ? { diskGb } : {})
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test src/worker/detectCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/worker/detectCapabilities.ts cli/src/worker/detectCapabilities.test.ts
git commit -m "feat(worker): add capability auto-detection"
```

---

### Task 3: Hub Socket.IO Enrollment Handshake

**Files:**
- Modify: `hub/src/socket/server.ts` (add `worker-enrolled` emit after enrollment auth)
- Test: `hub/src/cloud/resolveCliAuthToken.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test (extend existing)**

Add to `hub/src/cloud/resolveCliAuthToken.test.ts`:

```typescript
it('returns enrollment result with workerSessionToken', () => {
    // Create an enrollment token
    const tokenResult = secretBroker.createEnrollmentToken({
        namespace: 'default',
        label: 'test-worker'
    })

    // Exchange it
    const result = resolveCliAuthToken(store, tokenResult.token)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('enrollment')
    expect(result!.namespace).toBe('default')
    expect((result as any).workerSessionToken).toBeTruthy()
})

it('rejects already-exchanged enrollment token', () => {
    const tokenResult = secretBroker.createEnrollmentToken({
        namespace: 'default',
        label: 'test-worker'
    })

    // First exchange succeeds
    const result1 = resolveCliAuthToken(store, tokenResult.token)
    expect(result1).not.toBeNull()

    // Second exchange fails
    const result2 = resolveCliAuthToken(store, tokenResult.token)
    expect(result2).toBeNull()
})
```

- [ ] **Step 2: Run test to verify current state**

Run: `cd hub && bun test src/cloud/resolveCliAuthToken.test.ts`

Check existing tests pass. The new tests may already pass if exchange logic is implemented — verify behavior.

- [ ] **Step 3: Add `worker-enrolled` emit to Socket.IO server**

In `hub/src/socket/server.ts`, find the `/cli` namespace middleware where `resolveCliAuthToken` is called. After a successful enrollment auth, emit the worker session token back to the connecting socket:

```typescript
// In the /cli namespace middleware, after resolveCliAuthToken returns kind: 'enrollment'
if (resolved.kind === 'enrollment') {
    socket.data.cliAuthKind = 'enrollment'
    socket.data.namespace = resolved.namespace
    socket.data.machineId = resolved.machineId
    // After connection is established, emit the worker session token
    socket.once('connect', () => {
        socket.emit('worker-enrolled', {
            workerSessionToken: resolved.workerSessionToken,
            machineId: resolved.machineId,
            namespace: resolved.namespace
        })
    })
}
```

Note: Check existing code — if the middleware already handles `enrollment` kind (it likely does for `socket.data` population), only the `worker-enrolled` emit needs to be added. Read `hub/src/socket/server.ts` to determine exact insertion point.

- [ ] **Step 4: Add `worker-enrolled` to socket event types**

In `shared/src/socket.ts` (or wherever `ServerToClientEvents` is defined), add:

```typescript
'worker-enrolled': (payload: {
    workerSessionToken: string
    machineId?: string
    namespace: string
}) => void
```

- [ ] **Step 5: Run tests**

Run: `cd hub && bun test src/cloud/resolveCliAuthToken.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add hub/src/socket/server.ts hub/src/cloud/resolveCliAuthToken.test.ts shared/src/socket.ts
git commit -m "feat(hub): emit worker-enrolled event on enrollment auth"
```

---

### Task 4: Extract Runner Loop from run.ts

This is the most critical refactoring task. Extract the core "connect to hub + register RPC handlers + spawn loop" into a reusable function.

**Files:**
- Create: `cli/src/runner/runnerLoop.ts`
- Modify: `cli/src/runner/run.ts`

- [ ] **Step 1: Identify the extraction boundary in run.ts**

Read `cli/src/runner/run.ts` from line 137 onwards. The extraction boundary is:
- **Before extraction point** (stays in `startRunner`): version check, lock acquisition, `maybeAutoStartServer()`, `authAndSetupMachineIfNeeded()`
- **Extraction target** (moves to `runnerLoop`): everything from line ~148 (pidToTrackedSession setup) through the end of the function — the spawn loop, RPC handlers, child tracking, heartbeat, shutdown handling

- [ ] **Step 2: Define the RunnerLoopOptions interface**

```typescript
// cli/src/runner/runnerLoop.ts
import type { ApiClient } from '@/api/api'

export type RunnerLoopOptions = {
    machineId: string
    apiClient: ApiClient
    metadata: {
        executorType?: 'local' | 'cloud-self-hosted' | 'cloud-managed'
        provider?: string
        labels?: string[]
        capabilities?: Record<string, unknown>
        resources?: Record<string, unknown>
    }
    onShutdownRequested: Promise<{ source: string; errorMessage?: string }>
    requestShutdown: (source: string, errorMessage?: string) => void
}

export async function runRunnerLoop(options: RunnerLoopOptions): Promise<void> {
    // Move core loop here from run.ts
}
```

- [ ] **Step 3: Extract the core loop**

Move everything from `startRunner()` after `authAndSetupMachineIfNeeded()` (line ~143) into `runRunnerLoop()`. This includes:
- `pidToTrackedSession` Map setup
- `spawnSession()` function
- `stopSession()` function
- `onChildExited()` handler
- `syncCloudRunnerState()` helper
- `onHappySessionWebhook()` handler
- `ApiMachineClient` creation and registration
- RPC handler registration
- Control server startup
- Runner state persistence
- Shutdown handling

Replace direct references to `machineId` (from `authAndSetupMachineIfNeeded()`) with `options.machineId`, and references to the API client with `options.apiClient`.

The `buildMachineMetadata()` call that computes metadata should be merged with `options.metadata` so the worker can inject `executorType: 'cloud-self-hosted'`.

- [ ] **Step 4: Update startRunner() to call runRunnerLoop()**

```typescript
// cli/src/runner/run.ts (simplified)
export async function startRunner(): Promise<void> {
    // ... existing setup: signal handlers, version check, lock, auto-start hub ...

    const { machineId } = await authAndSetupMachineIfNeeded()

    await runRunnerLoop({
        machineId,
        apiClient: await ApiClient.create(),
        metadata: {
            executorType: 'local'
        },
        onShutdownRequested: resolvesWhenShutdownRequested,
        requestShutdown
    })
}
```

- [ ] **Step 5: Run existing tests to verify no regression**

Run: `cd cli && bun test`
Expected: All existing tests pass. The refactoring should be behavior-preserving.

- [ ] **Step 6: Commit**

```bash
git add cli/src/runner/runnerLoop.ts cli/src/runner/run.ts
git commit -m "refactor(runner): extract core loop into runnerLoop.ts"
```

---

### Task 5: Worker Start Command

**Files:**
- Create: `cli/src/worker/workerStart.ts`
- Create: `cli/src/commands/worker.ts`
- Modify: `cli/src/commands/registry.ts`

- [ ] **Step 1: Write workerStart.ts**

```typescript
// cli/src/worker/workerStart.ts
import os from 'node:os'
import { io } from 'socket.io-client'
import { logger } from '@/ui/logger'
import { readWorkerConfig, writeWorkerConfig, type WorkerConfig } from './workerConfig'
import { detectWorkerCapabilities } from './detectCapabilities'
import { runRunnerLoop } from '@/runner/runnerLoop'
import { ApiClient } from '@/api/api'

export type WorkerStartOptions = {
    token?: string
    hubUrl?: string
}

export async function startWorker(options: WorkerStartOptions): Promise<void> {
    let config = await readWorkerConfig()

    if (!config && (!options.token || !options.hubUrl)) {
        console.error('First-time setup requires --token and --hub-url')
        console.error('Usage: haqi worker start --token <enrollment-token> --hub-url <url>')
        process.exit(1)
    }

    const hubUrl = options.hubUrl ?? config!.hubUrl
    const authToken = config?.workerSessionToken ?? options.token!
    const isEnrollment = !config?.workerSessionToken

    // Setup shutdown handling
    let requestShutdown: (source: string, errorMessage?: string) => void
    const onShutdownRequested = new Promise<{ source: string; errorMessage?: string }>((resolve) => {
        requestShutdown = (source, errorMessage) => {
            resolve({ source, errorMessage })
        }
    })

    process.on('SIGINT', () => requestShutdown('os-signal'))
    process.on('SIGTERM', () => requestShutdown('os-signal'))

    // Connect via Socket.IO to perform enrollment or reconnect
    logger.debug(`[WORKER] Connecting to hub at ${hubUrl}`)
    console.log(`Connecting to hub at ${hubUrl}...`)

    const socket = io(`${hubUrl}/cli`, {
        auth: { token: authToken },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000
    })

    // Handle enrollment handshake
    if (isEnrollment) {
        const enrolled = await new Promise<WorkerConfig>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Enrollment timeout — check hub URL and token'))
            }, 30_000)

            socket.on('worker-enrolled', (payload: {
                workerSessionToken: string
                machineId?: string
                namespace: string
            }) => {
                clearTimeout(timeout)
                resolve({
                    hubUrl,
                    workerSessionToken: payload.workerSessionToken,
                    machineId: payload.machineId ?? `worker-${os.hostname()}-${Date.now().toString(36)}`,
                    namespace: payload.namespace
                })
            })

            socket.on('connect_error', (err) => {
                clearTimeout(timeout)
                reject(new Error(`Connection failed: ${err.message}`))
            })
        })

        config = enrolled
        await writeWorkerConfig(config)
        console.log(`Enrolled as ${config.machineId} in namespace ${config.namespace}`)
        logger.debug(`[WORKER] Enrollment complete`, config)
        socket.disconnect()
    } else {
        socket.disconnect()
    }

    // Detect capabilities
    const capabilities = await detectWorkerCapabilities()
    logger.debug(`[WORKER] Detected capabilities`, capabilities)

    // Create API client pointing at remote hub
    const apiClient = ApiClient.createWithToken(config!.workerSessionToken, hubUrl)

    // Run the main loop
    console.log(`Worker ${config!.machineId} starting...`)
    await runRunnerLoop({
        machineId: config!.machineId,
        apiClient,
        metadata: {
            executorType: 'cloud-self-hosted',
            provider: 'manual',
            capabilities,
            resources: capabilities.resources
        },
        onShutdownRequested,
        requestShutdown: requestShutdown!
    })
}
```

Note: `ApiClient.createWithToken(token, hubUrl)` is a new static factory method that needs to be added to `ApiClient`. It bypasses `getAuthToken()` and `configuration.apiUrl`, using the provided token and URL directly.

- [ ] **Step 2: Add `ApiClient.createWithToken()` factory**

In `cli/src/api/api.ts`, add:

```typescript
static createWithToken(token: string, hubUrl: string): ApiClient {
    const client = new ApiClient(token)
    client.hubUrlOverride = hubUrl
    return client
}

private hubUrlOverride?: string

private get apiUrl(): string {
    return this.hubUrlOverride ?? configuration.apiUrl
}
```

Then update all `configuration.apiUrl` references in the class to use `this.apiUrl`.

- [ ] **Step 3: Write the worker command**

```typescript
// cli/src/commands/worker.ts
import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const workerCommand: CommandDefinition = {
    name: 'worker',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'start') {
            const tokenIndex = commandArgs.indexOf('--token')
            const hubUrlIndex = commandArgs.indexOf('--hub-url')
            const token = tokenIndex >= 0 ? commandArgs[tokenIndex + 1] : undefined
            const hubUrl = hubUrlIndex >= 0 ? commandArgs[hubUrlIndex + 1] : undefined

            const { startWorker } = await import('@/worker/workerStart')
            await startWorker({ token, hubUrl })
            process.exit(0)
        }

        if (subcommand === 'stop') {
            const { clearWorkerConfig } = await import('@/worker/workerConfig')
            // Worker stop is just killing the process — it's foreground
            console.log('Worker stop: kill the running worker process (Ctrl+C)')
            process.exit(0)
        }

        if (subcommand === 'status') {
            const { readWorkerConfig } = await import('@/worker/workerConfig')
            const config = await readWorkerConfig()
            if (config) {
                console.log(`Registered: ${config.machineId}`)
                console.log(`Hub: ${config.hubUrl}`)
                console.log(`Namespace: ${config.namespace}`)
            } else {
                console.log('Not registered. Run: haqi worker start --token <token> --hub-url <url>')
            }
            process.exit(0)
        }

        console.log(`
${chalk.bold('haqi worker')} - Self-hosted worker management

${chalk.bold('Usage:')}
  haqi worker start --token <token> --hub-url <url>   Register and start worker
  haqi worker start                                     Reconnect (already registered)
  haqi worker stop                                      Stop worker
  haqi worker status                                    Show registration status
`)
    }
}
```

- [ ] **Step 4: Register in registry.ts**

```typescript
// cli/src/commands/registry.ts — add import and entry
import { workerCommand } from './worker'

const COMMANDS: CommandDefinition[] = [
    // ... existing commands ...
    workerCommand
]
```

- [ ] **Step 5: Run typecheck**

Run: `bun typecheck`
Expected: PASS — all types align

- [ ] **Step 6: Commit**

```bash
git add cli/src/worker/workerStart.ts cli/src/commands/worker.ts cli/src/commands/registry.ts cli/src/api/api.ts
git commit -m "feat(worker): add haqi worker start/stop/status commands"
```

---

### Task 6: Worker Management Web Page

**Files:**
- Create: `web/src/routes/cloud/workers.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Read existing cloud route patterns**

Read `web/src/routes/cloud/secrets.tsx` and `web/src/routes/cloud/request.tsx` to understand page structure, API client usage, TanStack Query patterns, and styling conventions.

- [ ] **Step 2: Create workers page**

```tsx
// web/src/routes/cloud/workers.tsx
import { useState } from 'react'
import { useCloudWorkers } from '@/hooks/queries/useCloudWorkers'
import { useCloudProviders } from '@/hooks/queries/useCloudProviders'
import { apiClient } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export function CloudWorkersPage() {
    const { t } = useTranslation()
    const { data: workersData } = useCloudWorkers()
    const { data: providersData } = useCloudProviders()
    const [newTokenLabel, setNewTokenLabel] = useState('')
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)

    const workers = workersData?.workers ?? []
    const providers = providersData?.providers ?? []

    const generateToken = async () => {
        const result = await apiClient.createEnrollmentToken({
            label: newTokenLabel || undefined,
            ttlMinutes: 60
        })
        setGeneratedToken(result.token)
    }

    const copyInstallCommand = () => {
        const hubUrl = window.location.origin
        const cmd = `haqi worker start --token ${generatedToken} --hub-url ${hubUrl}`
        navigator.clipboard.writeText(cmd)
    }

    return (
        <div className="space-y-6 p-4">
            <h2 className="text-lg font-semibold">{t('cloud.workers.title')}</h2>

            {/* Enrollment Token Generation */}
            <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-medium">{t('cloud.workers.addWorker')}</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder={t('cloud.workers.labelPlaceholder')}
                        value={newTokenLabel}
                        onChange={(e) => setNewTokenLabel(e.target.value)}
                        className="flex-1 rounded border px-3 py-1.5 text-sm"
                    />
                    <button
                        onClick={generateToken}
                        className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    >
                        {t('cloud.workers.generateToken')}
                    </button>
                </div>
                {generatedToken && (
                    <div className="rounded bg-muted p-3 space-y-2">
                        <p className="text-sm text-muted-foreground">
                            {t('cloud.workers.installHint')}
                        </p>
                        <code className="block rounded bg-background p-2 text-xs break-all">
                            haqi worker start --token {generatedToken} --hub-url {window.location.origin}
                        </code>
                        <button
                            onClick={copyInstallCommand}
                            className="text-xs text-primary underline"
                        >
                            {t('cloud.workers.copyCommand')}
                        </button>
                    </div>
                )}
            </div>

            {/* Worker List */}
            <div className="space-y-2">
                <h3 className="font-medium">{t('cloud.workers.list')}</h3>
                {workers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('cloud.workers.noWorkers')}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {workers.map((worker) => (
                            <div
                                key={worker.machineId}
                                className="rounded-lg border p-3 flex items-center justify-between"
                            >
                                <div>
                                    <div className="font-medium text-sm">
                                        {worker.machineId}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {worker.provider} · {worker.lifecycle ?? 'unknown'}
                                        {worker.resources?.cpu ? ` · ${worker.resources.cpu} CPU` : ''}
                                        {worker.resources?.memoryMb ? ` · ${Math.round(worker.resources.memoryMb / 1024)}GB RAM` : ''}
                                    </div>
                                </div>
                                <div className={`text-xs px-2 py-0.5 rounded-full ${
                                    worker.active
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>
                                    {worker.active ? t('cloud.workers.online') : t('cloud.workers.offline')}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Add route to router.tsx**

Find the cloud routes section in `web/src/router.tsx` and add:

```tsx
import { CloudWorkersPage } from '@/routes/cloud/workers'

// In the route tree, under the cloud section:
{
    path: '/cloud/workers',
    component: CloudWorkersPage
}
```

Note: Read `router.tsx` to match the exact TanStack Router pattern used.

- [ ] **Step 4: Add locale strings**

In `web/src/lib/locales/en.ts`:
```typescript
cloud: {
    // ... existing ...
    workers: {
        title: 'Workers',
        addWorker: 'Add Worker',
        labelPlaceholder: 'Worker label (optional)',
        generateToken: 'Generate Token',
        installHint: 'Run this command on the target machine:',
        copyCommand: 'Copy command',
        list: 'Registered Workers',
        noWorkers: 'No workers registered. Generate a token above to add one.',
        online: 'Online',
        offline: 'Offline'
    }
}
```

In `web/src/lib/locales/zh-CN.ts`:
```typescript
cloud: {
    // ... existing ...
    workers: {
        title: 'Worker 管理',
        addWorker: '添加 Worker',
        labelPlaceholder: 'Worker 标签（可选）',
        generateToken: '生成 Token',
        installHint: '在目标机器上执行此命令：',
        copyCommand: '复制命令',
        list: '已注册 Worker',
        noWorkers: '暂无 Worker。使用上方按钮生成 Token 注册一台。',
        online: '在线',
        offline: '离线'
    }
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && bun run build`
Expected: PASS — no type errors

- [ ] **Step 6: Commit**

```bash
git add web/src/routes/cloud/workers.tsx web/src/router.tsx web/src/lib/locales/en.ts web/src/lib/locales/zh-CN.ts
git commit -m "feat(web): add worker management page"
```

---

### Task 7: New Session Form — No-Worker Guidance

**Files:**
- Modify: `web/src/components/NewSession/CloudSettingsSection.tsx`

- [ ] **Step 1: Read CloudSettingsSection.tsx**

Read the file to understand current provider selection logic and where to add the no-worker guidance.

- [ ] **Step 2: Add no-worker guidance**

When `executionBackend` is `cloud-self-hosted` and `useCloudWorkers` returns zero active workers, display a guidance message:

```tsx
// Inside CloudSettingsSection, where the worker/provider selection UI lives:
{executionBackend === 'cloud-self-hosted' && activeWorkerCount === 0 && (
    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
        <p>{t('cloud.workers.noWorkers')}</p>
        <a href="/cloud/workers" className="text-primary underline">
            {t('cloud.workers.goToManagement')}
        </a>
    </div>
)}
```

Add locale string `cloud.workers.goToManagement`: `"Go to Worker management"` / `"前往 Worker 管理"`

- [ ] **Step 3: Verify build**

Run: `cd web && bun run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/NewSession/CloudSettingsSection.tsx web/src/lib/locales/en.ts web/src/lib/locales/zh-CN.ts
git commit -m "feat(web): add no-worker guidance in session form"
```

---

### Task 8: Integration Test — Worker Connects and Receives Spawn

**Files:**
- Modify: `cli/src/runner/runner.integration.test.ts`

- [ ] **Step 1: Read existing integration test**

Read `cli/src/runner/runner.integration.test.ts` to understand the test harness setup.

- [ ] **Step 2: Add worker enrollment integration test**

```typescript
// Add to runner.integration.test.ts
describe('worker enrollment', () => {
    it('worker connects with enrollment token and receives workerSessionToken', async () => {
        // This test verifies the enrollment flow at the protocol level.
        // It creates an enrollment token via the Hub API,
        // connects a socket with that token,
        // and verifies the worker-enrolled event is received.

        // Setup: create enrollment token
        const tokenResult = await fetch(`${hubUrl}/api/cloud/enrollment-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cliApiToken}`
            },
            body: JSON.stringify({ label: 'test-worker', ttlMinutes: 5 })
        })
        const { token } = await tokenResult.json()
        expect(token).toBeTruthy()

        // Connect with enrollment token
        const socket = io(`${hubUrl}/cli`, {
            auth: { token },
            transports: ['websocket']
        })

        const enrolled = await new Promise<{ workerSessionToken: string; namespace: string }>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('timeout')), 10_000)
            socket.on('worker-enrolled', (payload) => {
                clearTimeout(timeout)
                resolve(payload)
            })
            socket.on('connect_error', (err) => {
                clearTimeout(timeout)
                reject(err)
            })
        })

        expect(enrolled.workerSessionToken).toBeTruthy()
        expect(enrolled.namespace).toBeTruthy()

        socket.disconnect()

        // Reconnect with workerSessionToken
        const socket2 = io(`${hubUrl}/cli`, {
            auth: { token: enrolled.workerSessionToken },
            transports: ['websocket']
        })

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('reconnect timeout')), 5_000)
            socket2.on('connect', () => {
                clearTimeout(timeout)
                resolve()
            })
            socket2.on('connect_error', (err) => {
                clearTimeout(timeout)
                reject(err)
            })
        })

        socket2.disconnect()
    })
})
```

- [ ] **Step 3: Run integration test**

Run: `cd cli && bun test src/runner/runner.integration.test.ts`

Note: This test requires a running Hub. If the existing test file has a setup/teardown that starts a Hub, use it. Otherwise, this test may need to be run manually with `HAPI_HOME` configured.

- [ ] **Step 4: Commit**

```bash
git add cli/src/runner/runner.integration.test.ts
git commit -m "test: add worker enrollment integration test"
```

---

### Task 9: Scheduler Test — Self-Hosted Worker Selection

**Files:**
- Modify: `hub/src/cloud/scheduler.test.ts`

- [ ] **Step 1: Read existing scheduler tests**

Read `hub/src/cloud/scheduler.test.ts` to understand test patterns.

- [ ] **Step 2: Add self-hosted worker tests**

```typescript
describe('selectWorker with self-hosted workers', () => {
    it('excludes draining workers', () => {
        const machines = [
            createMachine({
                id: 'draining-1',
                active: true,
                metadata: { executorType: 'cloud-self-hosted' },
                runnerState: { lifecycle: 'draining', capacity: { total: 4, used: 0 } }
            }),
            createMachine({
                id: 'idle-1',
                active: true,
                metadata: { executorType: 'cloud-self-hosted' },
                runnerState: { lifecycle: 'idle', capacity: { total: 4, used: 0 } }
            })
        ]
        const selected = selectWorker(machines)
        expect(selected?.id).toBe('idle-1')
    })

    it('filters by docker capability', () => {
        const machines = [
            createMachine({
                id: 'no-docker',
                active: true,
                metadata: { executorType: 'cloud-self-hosted', capabilities: { docker: false } },
                runnerState: { lifecycle: 'idle', capacity: { total: 4, used: 0 } }
            }),
            createMachine({
                id: 'has-docker',
                active: true,
                metadata: { executorType: 'cloud-self-hosted', capabilities: { docker: true } },
                runnerState: { lifecycle: 'idle', capacity: { total: 4, used: 0 } }
            })
        ]
        const selected = selectWorker(machines, { requireDocker: true })
        expect(selected?.id).toBe('has-docker')
    })

    it('balances load across workers', () => {
        const machines = [
            createMachine({
                id: 'busy',
                active: true,
                metadata: { executorType: 'cloud-self-hosted' },
                runnerState: { lifecycle: 'busy', capacity: { total: 4, used: 3 } }
            }),
            createMachine({
                id: 'light',
                active: true,
                metadata: { executorType: 'cloud-self-hosted' },
                runnerState: { lifecycle: 'busy', capacity: { total: 4, used: 1 } }
            })
        ]
        const selected = selectWorker(machines)
        expect(selected?.id).toBe('light')
    })
})
```

Note: `createMachine` is a test helper — check if it exists in the test file; if not, define it as a factory that returns a `Machine` object with sensible defaults.

- [ ] **Step 3: Run tests**

Run: `cd hub && bun test src/cloud/scheduler.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add hub/src/cloud/scheduler.test.ts
git commit -m "test: add self-hosted worker scheduler tests"
```

---

### Task 10: End-to-End Verification

- [ ] **Step 1: Run full test suite**

```bash
bun run test
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

```bash
bun typecheck
```

Expected: No type errors.

- [ ] **Step 3: Manual smoke test (if Hub available)**

1. Start Hub: `bun run dev`
2. Open Web UI, go to `/cloud/workers`
3. Generate enrollment token
4. In another terminal: `haqi worker start --token <token> --hub-url http://localhost:3016`
5. Verify Worker appears in Worker list as online
6. Try spawning a session targeting `cloud-self-hosted`

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address integration issues from end-to-end testing"
```
