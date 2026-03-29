import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { createCloudRoutes } from './cloud'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createCloudRoutes(getSyncEngine as never))
    return app
}

describe('createCloudRoutes', () => {
    it('returns worker summaries by provider', async () => {
        const app = createAuthedApp(() => ({
            listCloudWorkers: (provider?: string) => [{
                machineId: 'machine-1',
                provider: provider ?? 'auto',
                active: true,
                executorType: 'cloud-self-hosted',
                lifecycle: 'idle',
                region: 'us-east-1',
                labels: ['docker', 'warm-cache'],
                updatedAt: 1
            }]
        }))

        const response = await app.request('http://localhost/api/cloud/workers?provider=docker')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({
            workers: [
                {
                    machineId: 'machine-1',
                    provider: 'docker',
                    active: true,
                    executorType: 'cloud-self-hosted',
                    lifecycle: 'idle',
                    region: 'us-east-1',
                    labels: ['docker', 'warm-cache'],
                    updatedAt: 1
                }
            ]
        })
    })

    it('returns cloud providers summary', async () => {
        const app = createAuthedApp(() => ({
            listCloudWorkers: () => [],
            listCloudProviders: () => [
                { id: 'docker', type: 'self-hosted', count: 2 },
                { id: 'managed', type: 'managed', count: 1 }
            ]
        }))

        const response = await app.request('http://localhost/api/cloud/providers')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({
            providers: [
                { id: 'docker', type: 'self-hosted', count: 2 },
                { id: 'managed', type: 'managed', count: 1 }
            ]
        })
    })

    it('returns 503 when sync engine is unavailable', async () => {
        const app = createAuthedApp(() => null)
        const response = await app.request('http://localhost/api/cloud/workers')
        expect(response.status).toBe(503)
    })
})
