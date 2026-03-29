import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { createMachinesRoutes } from './machines'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createMachinesRoutes(getSyncEngine as never))
    return app
}

describe('createMachinesRoutes cloud endpoints', () => {
    it('returns cloud environments when available', async () => {
        const app = createAuthedApp(() => ({
            getOnlineMachinesByNamespace: () => [],
            listCloudEnvironments: () => [
                {
                    id: 'node-dev',
                    version: '1',
                    runtime: { kind: 'docker-session', image: 'ghcr.io/acme/node:18' }
                }
            ],
            listCloudPreviews: () => []
        }))

        const response = await app.request('http://localhost/api/machines/cloud/environments')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({
            environments: [
                {
                    id: 'node-dev',
                    version: '1',
                    runtime: { kind: 'docker-session', image: 'ghcr.io/acme/node:18' }
                }
            ]
        })
    })

    it('returns cloud previews when available', async () => {
        const previews = [
            {
                sessionId: 'session-1',
                updatedAt: 1,
                previews: [
                    {
                        id: 'preview-1',
                        name: 'web',
                        port: 3000,
                        url: 'http://127.0.0.1:3000',
                        visibility: 'private'
                    }
                ]
            }
        ]

        const app = createAuthedApp(() => ({
            getOnlineMachinesByNamespace: () => [],
            listCloudEnvironments: () => [],
            listCloudPreviews: () => previews
        }))

        const response = await app.request('http://localhost/api/machines/cloud/previews')
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json).toEqual({ previews })
    })
})
