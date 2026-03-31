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
                forward: async (_req) => ({
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
