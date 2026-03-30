import { Hono } from 'hono'
import { z } from 'zod'
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

export function createCloudRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
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

    return app
}
