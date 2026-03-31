import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { DaemonClient } from './DaemonClient'

const AUTH_TOKEN = 'test-token'
let mockServer: http.Server
let serverPort: number
let client: DaemonClient

describe('DaemonClient', () => {
    beforeAll(async () => {
        mockServer = http.createServer((req, res) => {
            const auth = req.headers.authorization
            if (auth !== `Bearer ${AUTH_TOKEN}`) {
                res.writeHead(401)
                res.end('Unauthorized')
                return
            }

            res.setHeader('Content-Type', 'application/json')

            if (req.url === '/health' && req.method === 'GET') {
                res.end(JSON.stringify({ status: 'ok', pid: 1, uptimeMs: 100 }))
            } else if (req.url === '/process/spawn' && req.method === 'POST') {
                res.end(JSON.stringify({ pid: 42, status: 'running' }))
            } else if (req.url === '/process/kill' && req.method === 'POST') {
                res.end(JSON.stringify({ ok: true }))
            } else if (req.url === '/process/status' && req.method === 'GET') {
                res.end(JSON.stringify({ pid: 42, running: true, exitCode: null, signal: null, uptimeMs: 50 }))
            } else if (req.url === '/preview/ports' && req.method === 'GET') {
                res.end(JSON.stringify({ ports: [{ port: 3000, process: 'node' }] }))
            } else {
                res.writeHead(404)
                res.end('Not found')
            }
        })

        await new Promise<void>((resolve) => {
            mockServer.listen(0, () => {
                const addr = mockServer.address()
                serverPort = typeof addr === 'object' && addr ? addr.port : 0
                resolve()
            })
        })

        client = new DaemonClient(`http://localhost:${serverPort}`, AUTH_TOKEN)
    })

    afterAll(() => {
        mockServer?.close()
    })

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
