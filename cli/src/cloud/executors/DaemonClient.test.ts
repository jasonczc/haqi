import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DaemonClient } from './DaemonClient'

const AUTH_TOKEN = 'test-token'
let mockServer: ReturnType<typeof Bun.serve>
let client: DaemonClient

describe('DaemonClient', () => {
    beforeAll(() => {
        mockServer = Bun.serve({
            async fetch(req) {
                const url = new URL(req.url)
                const auth = req.headers.get('Authorization')
                if (auth !== `Bearer ${AUTH_TOKEN}`) {
                    return new Response('Unauthorized', { status: 401 })
                }
                if (url.pathname === '/health') {
                    return Response.json({ status: 'ok', pid: 1, uptimeMs: 100 })
                }
                if (url.pathname === '/process/spawn' && req.method === 'POST') {
                    return Response.json({ pid: 42, status: 'running' })
                }
                if (url.pathname === '/process/kill' && req.method === 'POST') {
                    return Response.json({ ok: true })
                }
                if (url.pathname === '/process/status') {
                    return Response.json({ pid: 42, running: true, exitCode: null, signal: null, uptimeMs: 50 })
                }
                if (url.pathname === '/preview/ports') {
                    return Response.json({ ports: [{ port: 3000, process: 'node' }] })
                }
                return new Response('Not found', { status: 404 })
            }
        })
        client = new DaemonClient(`http://localhost:${mockServer.port}`, AUTH_TOKEN)
    })

    afterAll(() => { mockServer?.stop() })

    it('checks health', async () => {
        const health = await client.health()
        expect(health.status).toBe('ok')
    })

    it('spawns process', async () => {
        const result = await client.spawn({ command: ['echo', 'hi'], cwd: '/tmp' })
        expect(result.pid).toBe(42)
    })

    it('kills process', async () => {
        const result = await client.kill()
        expect(result).toBeUndefined()
    })

    it('gets process status', async () => {
        const status = await client.status()
        expect(status.running).toBe(true)
    })

    it('lists preview ports', async () => {
        const ports = await client.previewPorts()
        expect(ports).toHaveLength(1)
        expect(ports[0].port).toBe(3000)
    })
})
