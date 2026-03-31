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
        targetPort = targetServer.port ?? 0
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
