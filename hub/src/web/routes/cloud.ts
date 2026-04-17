import { Hono } from 'hono'
import { z } from 'zod'
import { execFile, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'
import { CLOUD_PROVIDER_NAMES } from '../../cloud/provider'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

// `process.kill(pid, 0)` returns success for zombie (Z) and dying (X) processes
// because their pid entry still exists. Read /proc/<pid>/status and treat
// anything other than R/S/D/T as dead. Returns false on non-Linux too.
function isPidAlive(pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0) return false
    try {
        const status = readFileSync(`/proc/${pid}/status`, 'utf8')
        const match = status.match(/^State:\s+([A-Z])/m)
        if (!match) return false
        const state = match[1]
        return state === 'R' || state === 'S' || state === 'D' || state === 'T'
    } catch {
        return false
    }
}

const execFileAsync = promisify(execFile)
const LOCAL_RUNTIME_IMAGE = 'haqi-workspace:dev'

const cloudWorkersQuerySchema = z.object({
    provider: z.enum(CLOUD_PROVIDER_NAMES).optional()
})

const cloudRequestsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional()
})

const cloudSecretWriteSchema = z.object({
    name: z.string().trim().min(1).optional(),
    value: z.string().min(1).optional(),
    description: z.string().trim().optional(),
    mountAs: z.enum(['env', 'file']).optional().nullable(),
    envName: z.string().trim().optional(),
    filePath: z.string().trim().optional(),
    adapter: z.enum(['generic', 'git', 'claude', 'gemini', 'codex']).optional().nullable()
})

const cloudSecretCreateSchema = cloudSecretWriteSchema.extend({
    name: z.string().trim().min(1),
    value: z.string().min(1)
})

const cloudEnrollmentTokenCreateSchema = z.object({
    label: z.string().trim().optional(),
    machineId: z.string().trim().optional(),
    ttlMinutes: z.coerce.number().int().positive().optional()
})

function sanitizeMachineIdSegment(value: string): string {
    const sanitized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return sanitized || 'default'
}

export function buildLocalWorkerMachineId(namespace: string, hostname: string = os.hostname()): string {
    return `local-worker-${sanitizeMachineIdSegment(hostname)}-${sanitizeMachineIdSegment(namespace)}`
}

export function createCloudRoutes(getSyncEngine: () => SyncEngine | null, hubUrl?: string): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    function resolveLocalHubUrl(): string {
        const configuredHost = process.env.HAPI_LISTEN_HOST?.trim() || '127.0.0.1'
        const localHost = configuredHost === '0.0.0.0' || configuredHost === '::' ? '127.0.0.1' : configuredHost
        const configuredPort = process.env.HAPI_LISTEN_PORT?.trim()
        if (configuredPort) {
            return `http://${localHost}:${configuredPort}`
        }

        if (hubUrl) {
            try {
                const parsed = new URL(hubUrl)
                const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
                return `http://${localHost}:${port}`
            } catch {
                // Fall through to default.
            }
        }

        return `http://${localHost}:3006`
    }

    app.get('/cloud/workers', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')

        const parsed = cloudWorkersQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        return c.json({
            workers: engine.listCloudWorkers(parsed.data.provider, namespace)
        })
    })

    app.delete('/cloud/workers/:machineId', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const machineId = c.req.param('machineId')
        if (!machineId) {
            return c.json({ error: 'Missing machineId' }, 400)
        }

        const machine = engine.getMachineByNamespace(machineId, namespace)
        if (!machine) {
            return c.json({ error: 'Machine not found' }, 404)
        }
        if (machine.active) {
            return c.json({
                error: 'Machine is active. Stop the worker before removing it.'
            }, 409)
        }

        // If this machine is the locally-tracked worker, stop the process
        // first — the worker's still holding its lock file even though hub
        // marked it inactive after a heartbeat timeout. Without this the user
        // ends up with an orphan process blocking every future start attempt.
        const machinePid = (machine.runnerState as { pid?: number } | null)?.pid
        if (
            localWorkerProcess
            && localWorkerProcess.exitCode === null
            && typeof machinePid === 'number'
            && localWorkerProcess.pid === machinePid
            && isPidAlive(localWorkerProcess.pid)
        ) {
            try {
                process.kill(localWorkerProcess.pid, 'SIGTERM')
            } catch { /* process may be gone already */ }
            localWorkerProcess.exitCode = -1
            localWorkerProcess.logs.push('[hub] Worker process stopped as part of machine removal')
        }

        const removed = engine.removeMachineByNamespace(machineId, namespace)
        if (!removed) {
            return c.json({ error: 'Failed to remove machine' }, 500)
        }
        return c.json({ removed: true, machineId })
    })

    app.get('/cloud/providers', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')

        return c.json({
            providers: engine.listCloudProviders(namespace)
        })
    })

    app.get('/cloud/checkpoints', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')

        return c.json({
            checkpoints: engine.listCloudCheckpoints(namespace)
        })
    })

    app.get('/cloud/requests', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const parsed = cloudRequestsQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }
        const namespace = c.get('namespace')
        return c.json({
            requests: engine.listCloudRequests(namespace, parsed.data.limit)
        })
    })

    app.get('/cloud/requests/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const request = engine.getCloudRequestByNamespace(c.req.param('id'), namespace)
        if (!request) {
            return c.json({ error: 'Request not found' }, 404)
        }
        return c.json({ request })
    })

    app.post('/cloud/requests/:id/cancel', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const request = engine.cancelCloudRequest(c.req.param('id'), namespace)
        if (!request) {
            return c.json({ error: 'Request not found' }, 404)
        }
        return c.json({ request })
    })

    app.post('/cloud/requests/:id/retry', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const request = engine.retryCloudRequest(c.req.param('id'), namespace)
        if (!request) {
            return c.json({ error: 'Request not found' }, 404)
        }
        return c.json({ request })
    })

    app.get('/cloud/requests/:id/logs', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const requestId = c.req.param('id')
        const request = engine.getCloudRequestByNamespace(requestId, namespace)
        if (!request) {
            return c.json({ error: 'Request not found' }, 404)
        }
        // Prefer the machine that actually ran the spawn; fall back to any
        // online worker in the namespace (worker may have reassigned by now).
        const machineId = request.selectedMachineId
            ?? request.requestedMachineId
            ?? engine.getOnlineMachinesByNamespace(namespace)[0]?.id
        if (!machineId) {
            return c.json({ error: 'No worker available to fetch logs from' }, 503)
        }
        try {
            const result = await engine.rpcGetSpawnLog(machineId, requestId) as {
                content?: string
                truncated?: boolean
                found?: boolean
            } | null | undefined
            if (!result || !result.found) {
                return c.json({
                    content: '',
                    truncated: false,
                    found: false,
                    machineId
                })
            }
            return c.json({
                content: typeof result.content === 'string' ? result.content : '',
                truncated: Boolean(result.truncated),
                found: true,
                machineId
            })
        } catch (err) {
            return c.json({
                error: err instanceof Error ? err.message : 'Failed to fetch spawn log'
            }, 500)
        }
    })

    app.get('/cloud/workspaces', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const parsed = cloudRequestsQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }
        const namespace = c.get('namespace')
        return c.json({
            workspaces: engine.listCloudWorkspaces(namespace, parsed.data.limit)
        })
    })

    app.get('/cloud/workspaces/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const workspace = engine.getCloudWorkspaceByNamespace(c.req.param('id'), namespace)
        if (!workspace) {
            return c.json({ error: 'Workspace not found' }, 404)
        }
        return c.json({ workspace })
    })

    app.get('/cloud/secrets', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        return c.json({
            secrets: engine.listCloudSecrets(namespace)
        })
    })

    app.post('/cloud/secrets', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = cloudSecretCreateSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        const secret = engine.createCloudSecret({
            namespace,
            ...parsed.data
        })
        return c.json({ secret })
    })

    app.get('/cloud/secrets/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const secret = engine.getCloudSecretByNamespace(c.req.param('id'), namespace)
        if (!secret) {
            return c.json({ error: 'Secret not found' }, 404)
        }
        return c.json({ secret })
    })

    app.patch('/cloud/secrets/:id', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = cloudSecretWriteSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        const secret = engine.updateCloudSecret({
            namespace,
            id: c.req.param('id'),
            ...parsed.data
        })
        if (!secret) {
            return c.json({ error: 'Secret not found' }, 404)
        }
        return c.json({ secret })
    })

    app.delete('/cloud/secrets/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const deleted = engine.deleteCloudSecret(c.req.param('id'), namespace)
        if (!deleted) {
            return c.json({ error: 'Secret not found' }, 404)
        }
        return c.json({ ok: true })
    })

    app.get('/cloud/worker-enrollment-tokens', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        return c.json({
            tokens: engine.listCloudWorkerEnrollmentTokens(namespace)
        })
    })

    app.post('/cloud/worker-enrollment-tokens', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const body = await c.req.json().catch(() => ({}))
        const parsed = cloudEnrollmentTokenCreateSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        const token = engine.createCloudWorkerEnrollmentToken({
            namespace,
            ...parsed.data
        })
        return c.json(token)
    })

    app.patch('/cloud/worker-enrollment-tokens/:id', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')
        const body = await c.req.json().catch(() => ({}))
        const parsed = z.object({
            label: z.string().trim().nullable().optional(),
            extendMinutes: z.coerce.number().int().positive().optional()
        }).safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

        const updates: { label?: string | null; expiresAt?: number | null } = {}
        if ('label' in parsed.data) updates.label = parsed.data.label
        if (parsed.data.extendMinutes) {
            updates.expiresAt = Date.now() + parsed.data.extendMinutes * 60_000
        }

        const token = engine.updateCloudWorkerEnrollmentToken(c.req.param('id'), namespace, updates)
        if (!token) return c.json({ error: 'Token not found' }, 404)
        return c.json({ token })
    })

    app.delete('/cloud/worker-enrollment-tokens/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }
        const namespace = c.get('namespace')
        const token = engine.revokeCloudWorkerEnrollmentToken(c.req.param('id'), namespace)
        if (!token) {
            return c.json({ error: 'Token not found' }, 404)
        }
        return c.json({ token })
    })

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
            parsed.data.sessionId,
            namespace,
            parsed.data.name,
            parsed.data.parentCheckpointId
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

    // Local worker process state
    let localWorkerProcess: {
        pid: number
        exitCode: number | null
        logs: string[]
        startedAt: number
    } | null = null

    let localRuntimeProcess: {
        pid: number
        exitCode: number | null
        logs: string[]
        startedAt: number
    } | null = null

    async function hasLocalRuntimeImage(): Promise<boolean> {
        try {
            await execFileAsync('docker', ['image', 'inspect', LOCAL_RUNTIME_IMAGE])
            return true
        } catch {
            return false
        }
    }

    async function findExternalLocalRuntimeBuildPid(): Promise<number | null> {
        try {
            const { stdout } = await execFileAsync('pgrep', ['-f', `${LOCAL_RUNTIME_IMAGE} -f Dockerfile.workspace`])
            const pid = Number(stdout.trim().split('\n').find(Boolean) ?? '')
            return Number.isFinite(pid) && pid > 0 ? pid : null
        } catch {
            return null
        }
    }

    function localRuntimeBuildContext(): string {
        return resolve(import.meta.dir, '..', '..', '..', '..')
    }

    function appendLocalRuntimeLog(line: string) {
        if (!localRuntimeProcess) return
        localRuntimeProcess.logs.push(line)
        if (localRuntimeProcess.logs.length > 400) {
            localRuntimeProcess.logs.shift()
        }
    }

    async function buildLocalRuntimeStatus() {
        const ready = await hasLocalRuntimeImage()
        let running = false
        if (localRuntimeProcess && localRuntimeProcess.exitCode === null) {
            if (isPidAlive(localRuntimeProcess.pid)) {
                running = true
            } else {
                localRuntimeProcess.exitCode = -1
                appendLocalRuntimeLog('[hub] Runtime build process no longer running')
            }
        }

        if (!running && !ready) {
            const externalPid = await findExternalLocalRuntimeBuildPid()
            if (externalPid) {
                running = true
                if (!localRuntimeProcess || localRuntimeProcess.exitCode !== null) {
                    localRuntimeProcess = {
                        pid: externalPid,
                        exitCode: null,
                        startedAt: Date.now(),
                        logs: ['[hub] Detected external runtime build process']
                    }
                }
            }
        }

        return {
            image: LOCAL_RUNTIME_IMAGE,
            ready,
            running,
            pid: localRuntimeProcess?.pid,
            exitCode: localRuntimeProcess?.exitCode ?? null,
            startedAt: localRuntimeProcess?.startedAt,
            logs: localRuntimeProcess?.logs ?? []
        }
    }

    function ensureTrackedLocalWorkerFromSummary(engine: SyncEngine, namespace: string, machineId: string) {
        const workerSummary = engine
            .listCloudWorkers('auto', namespace)
            .find((worker) => worker.machineId === machineId)

        const summaryPid = workerSummary?.runnerState?.pid
        if (!summaryPid || !isPidAlive(summaryPid)) {
            // Summary pid is stale (zombie, gone, or never existed). If we were
            // previously tracking that same pid, clear the tracker so the next
            // start request spawns a fresh worker instead of pretending one is
            // still running.
            if (localWorkerProcess && summaryPid && localWorkerProcess.pid === summaryPid) {
                localWorkerProcess.exitCode = localWorkerProcess.exitCode ?? -1
            }
            return workerSummary ?? null
        }

        const isAlreadyTracked = localWorkerProcess
            && localWorkerProcess.exitCode === null
            && localWorkerProcess.pid === summaryPid

        if (!isAlreadyTracked) {
            localWorkerProcess = {
                pid: summaryPid,
                exitCode: null,
                startedAt: workerSummary?.runnerState?.startedAt ?? Date.now(),
                logs: ['[hub] Attached to existing local worker process from machine summary']
            }
        }

        return workerSummary ?? null
    }

    // Start a local worker process on this machine
    app.post('/cloud/start-local-worker', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')
        const localWorkerMachineId = buildLocalWorkerMachineId(namespace)
        const trackedWorkerSummary = ensureTrackedLocalWorkerFromSummary(engine, namespace, localWorkerMachineId)

        function appendTrackedWorkerLog(line: string) {
            if (!localWorkerProcess) return
            localWorkerProcess.logs.push(line)
            if (localWorkerProcess.logs.length > 200) {
                localWorkerProcess.logs.shift()
            }
        }

        function stopTrackedWorker(reason: string) {
            if (!localWorkerProcess) return
            appendTrackedWorkerLog(`[hub] Restarting local worker: ${reason}`)
            try {
                process.kill(localWorkerProcess.pid, 'SIGTERM')
            } catch {
                appendTrackedWorkerLog('[hub] Existing local worker process already exited')
            }
            localWorkerProcess.exitCode = -1
        }

        // If already running, return existing info
        if (localWorkerProcess && localWorkerProcess.exitCode === null) {
            if (isPidAlive(localWorkerProcess.pid)) {
                const workerSummary = trackedWorkerSummary ?? ensureTrackedLocalWorkerFromSummary(engine, namespace, localWorkerMachineId)

                const recentStartupGraceMs = 30_000
                const startedRecently = Date.now() - localWorkerProcess.startedAt < recentStartupGraceMs
                const shouldReuseRunningProcess = workerSummary
                    ? workerSummary.active && workerSummary.selectable !== false
                    : startedRecently

                if (shouldReuseRunningProcess) {
                    return c.json({
                        started: true,
                        alreadyRunning: true,
                        pid: localWorkerProcess.pid,
                        startedAt: localWorkerProcess.startedAt
                    })
                }

                stopTrackedWorker('existing process is alive but worker is not selectable')
            } else {
                // process died without us knowing (crash, kill, or zombie)
                localWorkerProcess.exitCode = -1
                localWorkerProcess.logs.push('[hub] Worker process no longer running')
            }
        }

        // Create enrollment token
        const tokenResult = engine.createCloudWorkerEnrollmentToken({
            namespace,
            label: 'local-worker (auto)',
            machineId: localWorkerMachineId,
            ttlMinutes: 10
        })

        // Local worker runs on the same machine as the hub, so it should always
        // connect to the local listener directly instead of the external origin.
        // Using request headers here breaks behind HTTPS tunnels/proxies because
        // the worker would try to dial e.g. https://127.0.0.1:3006.
        const effectiveHubUrl = resolveLocalHubUrl()

        const cliDir = resolve(import.meta.dir, '..', '..', '..', '..', 'cli')
        const cliEntryPoint = resolve(cliDir, 'src', 'index.ts')

        const logs: string[] = []
        const maxLogLines = 200

        function appendLog(line: string) {
            logs.push(line)
            if (logs.length > maxLogLines) logs.shift()
        }

        appendLog(`[hub] Starting worker: cwd=${cliDir} bun ${cliEntryPoint} worker start --hub-url ${effectiveHubUrl}`)

        // Use `bun <file>` directly, NOT `bun run <file>`, to avoid bun
        // interpreting script args (like --token) as its own flags.
        // Set cwd to cli/ so that tsconfig paths (@/*) resolve correctly.
        const child = spawn(
            'bun', [cliEntryPoint, 'worker', 'start', '--token', tokenResult.token, '--hub-url', effectiveHubUrl],
            {
                cwd: cliDir,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env }
            }
        )

        localWorkerProcess = {
            pid: child.pid!,
            exitCode: null,
            logs,
            startedAt: Date.now()
        }

        child.stdout?.on('data', (data: Buffer) => {
            for (const line of data.toString().split('\n').filter(Boolean)) {
                appendLog(`[stdout] ${line}`)
            }
        })
        child.stderr?.on('data', (data: Buffer) => {
            for (const line of data.toString().split('\n').filter(Boolean)) {
                appendLog(`[stderr] ${line}`)
            }
        })
        child.on('exit', (code) => {
            if (localWorkerProcess && localWorkerProcess.pid === child.pid) {
                localWorkerProcess.exitCode = code ?? -1
                appendLog(`[hub] Worker process exited with code ${code}`)
            }
        })
        child.unref()

        return c.json({
            started: true,
            pid: child.pid,
            startedAt: localWorkerProcess.startedAt
        })
    })

    // Get local worker status and logs
    app.get('/cloud/local-worker', (c) => {
        const engine = getSyncEngine()
        if (engine) {
            ensureTrackedLocalWorkerFromSummary(engine, c.get('namespace'), buildLocalWorkerMachineId(c.get('namespace')))
        }

        if (!localWorkerProcess) {
            return c.json({ running: false, logs: [] })
        }

        const alive = localWorkerProcess.exitCode === null && isPidAlive(localWorkerProcess.pid)
        if (!alive && localWorkerProcess.exitCode === null) {
            localWorkerProcess.exitCode = -1
        }

        return c.json({
            running: alive,
            pid: localWorkerProcess.pid,
            exitCode: localWorkerProcess.exitCode,
            startedAt: localWorkerProcess.startedAt,
            logs: localWorkerProcess.logs
        })
    })

    // Stop local worker
    app.delete('/cloud/local-worker', (c) => {
        const engine = getSyncEngine()
        if (engine) {
            ensureTrackedLocalWorkerFromSummary(engine, c.get('namespace'), buildLocalWorkerMachineId(c.get('namespace')))
        }

        if (!localWorkerProcess) {
            return c.json({ stopped: false, reason: 'No local worker running' })
        }
        try {
            process.kill(localWorkerProcess.pid, 'SIGTERM')
            return c.json({ stopped: true, pid: localWorkerProcess.pid })
        } catch {
            return c.json({ stopped: false, reason: 'Process already exited' })
        }
    })

    app.get('/cloud/local-runtime', async (c) => {
        return c.json(await buildLocalRuntimeStatus())
    })

    app.post('/cloud/prepare-local-runtime', async (c) => {
        const ready = await hasLocalRuntimeImage()
        if (ready) {
            return c.json({
                started: true,
                alreadyReady: true,
                ...(await buildLocalRuntimeStatus())
            })
        }

        const existingStatus = await buildLocalRuntimeStatus()
        if (existingStatus.running) {
            return c.json({
                started: true,
                alreadyRunning: true,
                ...existingStatus
            })
        }

        if (localRuntimeProcess && localRuntimeProcess.exitCode === null) {
            if (isPidAlive(localRuntimeProcess.pid)) {
                return c.json({
                    started: true,
                    alreadyRunning: true,
                    ...(await buildLocalRuntimeStatus())
                })
            } else {
                localRuntimeProcess.exitCode = -1
                appendLocalRuntimeLog('[hub] Runtime build process no longer running')
            }
        }

        const logs: string[] = []
        const child = spawn(
            'docker',
            ['build', '-t', LOCAL_RUNTIME_IMAGE, '-f', 'Dockerfile.workspace', '.'],
            {
                cwd: localRuntimeBuildContext(),
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env }
            }
        )

        localRuntimeProcess = {
            pid: child.pid!,
            exitCode: null,
            logs,
            startedAt: Date.now()
        }
        appendLocalRuntimeLog(`[hub] Building ${LOCAL_RUNTIME_IMAGE} from Dockerfile.workspace`)

        child.stdout?.on('data', (data: Buffer) => {
            for (const line of data.toString().split('\n').filter(Boolean)) {
                appendLocalRuntimeLog(`[stdout] ${line}`)
            }
        })
        child.stderr?.on('data', (data: Buffer) => {
            for (const line of data.toString().split('\n').filter(Boolean)) {
                appendLocalRuntimeLog(`[stderr] ${line}`)
            }
        })
        child.on('exit', (code) => {
            if (localRuntimeProcess && localRuntimeProcess.pid === child.pid) {
                localRuntimeProcess.exitCode = code ?? -1
                appendLocalRuntimeLog(`[hub] Runtime build exited with code ${code ?? -1}`)
            }
        })
        child.unref()

        return c.json({
            started: true,
            ...(await buildLocalRuntimeStatus())
        })
    })

    return app
}
