import { Hono } from 'hono'
import { z } from 'zod'
import type { CloudProviderName } from '../../cloud/provider'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const cloudWorkersQuerySchema = z.object({
    provider: z.string().optional()
})

export function createCloudRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/cloud/workers', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const parsed = cloudWorkersQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const provider = parsed.data.provider as CloudProviderName | undefined

        return c.json({
            workers: engine.listCloudWorkers(provider)
        })
    })

    app.get('/cloud/providers', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        return c.json({
            providers: engine.listCloudProviders()
        })
    })

    return app
}
