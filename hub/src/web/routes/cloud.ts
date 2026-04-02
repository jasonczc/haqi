import { Hono } from 'hono'
import { z } from 'zod'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { CLOUD_PROVIDER_NAMES } from '../../cloud/provider'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

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

export function createCloudRoutes(getSyncEngine: () => SyncEngine | null, hubUrl?: string): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

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

    // Start a local worker process on this machine
    app.post('/cloud/start-local-worker', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ error: 'Not connected' }, 503)
        const namespace = c.get('namespace')

        // If already running, return existing info
        if (localWorkerProcess && localWorkerProcess.exitCode === null) {
            try {
                process.kill(localWorkerProcess.pid, 0) // check if alive
                return c.json({
                    started: true,
                    alreadyRunning: true,
                    pid: localWorkerProcess.pid,
                    startedAt: localWorkerProcess.startedAt
                })
            } catch {
                // process died without us knowing
                localWorkerProcess.exitCode = -1
                localWorkerProcess.logs.push('[hub] Worker process no longer running')
            }
        }

        // Create enrollment token
        const tokenResult = engine.createCloudWorkerEnrollmentToken({
            namespace,
            label: 'local-worker (auto)',
            ttlMinutes: 10
        })

        // Hub URL for the worker to connect to.
        // Derive from the actual request origin to avoid stale publicUrl config.
        const requestHost = c.req.header('host') || `localhost:${process.env.PORT || '3006'}`
        const requestProto = c.req.header('x-forwarded-proto') || 'http'
        const effectiveHubUrl = `${requestProto}://${requestHost}`

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
        if (!localWorkerProcess) {
            return c.json({ running: false, logs: [] })
        }

        let alive = localWorkerProcess.exitCode === null
        if (alive) {
            try { process.kill(localWorkerProcess.pid, 0) } catch { alive = false }
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

    return app
}
