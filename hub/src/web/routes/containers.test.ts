import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import { createContainerRoutes } from './containers'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createContainerRoutes(getSyncEngine as never))
    return app
}

describe('container routes', () => {
    it('returns 503 when engine not connected', async () => {
        const app = new Hono()
        app.route('/api', createContainerRoutes(() => null))
        const res = await app.request('http://localhost/api/cloud/containers')
        expect(res.status).toBe(503)
    })

    it('lists containers from online workers', async () => {
        const app = createAuthedApp(() => ({
            getOnlineMachinesByNamespace: () => [{
                id: 'w1', metadata: { executorType: 'cloud-self-hosted' }
            }],
            rpcContainerList: async () => [{ id: 'c1', name: 'test', status: 'Up' }]
        }))

        const res = await app.request('http://localhost/api/cloud/containers')
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.machines).toHaveLength(1)
        expect(data.machines[0].machineId).toBe('w1')
    })

    it('returns 503 on stop-session when engine not connected', async () => {
        const app = new Hono()
        app.route('/api', createContainerRoutes(() => null))
        const res = await app.request('http://localhost/api/machines/m1/containers/stop-session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ containerId: 'c1' })
        })
        expect(res.status).toBe(503)
    })

    it('returns 400 on stop-session with invalid body', async () => {
        const app = createAuthedApp(() => ({
            rpcContainerStopSession: async () => {}
        }))
        const res = await app.request('http://localhost/api/machines/m1/containers/stop-session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })
        expect(res.status).toBe(400)
    })

    it('stops session in container', async () => {
        const app = createAuthedApp(() => ({
            rpcContainerStopSession: async () => {}
        }))
        const res = await app.request('http://localhost/api/machines/m1/containers/stop-session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ containerId: 'c1' })
        })
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.ok).toBe(true)
    })

    it('stops container', async () => {
        const app = createAuthedApp(() => ({
            rpcContainerStop: async () => {}
        }))
        const res = await app.request('http://localhost/api/machines/m1/containers/stop', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ containerId: 'c1' })
        })
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.ok).toBe(true)
    })

    it('removes container', async () => {
        const app = createAuthedApp(() => ({
            rpcContainerRemove: async () => {}
        }))
        const res = await app.request('http://localhost/api/machines/m1/containers/c1', {
            method: 'DELETE'
        })
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.ok).toBe(true)
    })
})
