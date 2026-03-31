import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

const AUTH_TOKEN = 'test-token-123'
let baseUrl: string
let server: { stop: () => void }

describe('daemon server', () => {
    beforeAll(async () => {
        const { startServer } = await import('./server')
        server = await startServer({ port: 0, authToken: AUTH_TOKEN })
        baseUrl = `http://localhost:${(server as any).port}`
    })

    afterAll(() => {
        server?.stop()
    })

    it('returns 401 without auth token', async () => {
        const res = await fetch(`${baseUrl}/health`)
        expect(res.status).toBe(401)
    })

    it('returns health check with auth', async () => {
        const res = await fetch(`${baseUrl}/health`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.status).toBe('ok')
        expect(data.pid).toBeGreaterThan(0)
    })

    it('spawns and kills a process', async () => {
        const spawnRes = await fetch(`${baseUrl}/process/spawn`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: ['sleep', '30'], cwd: '/tmp' })
        })
        expect(spawnRes.status).toBe(200)
        const spawnData = await spawnRes.json()
        expect(spawnData.pid).toBeGreaterThan(0)
        expect(spawnData.status).toBe('running')

        const statusRes = await fetch(`${baseUrl}/process/status`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        const statusData = await statusRes.json()
        expect(statusData.running).toBe(true)

        const killRes = await fetch(`${baseUrl}/process/kill`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        expect(killRes.status).toBe(200)

        await new Promise(r => setTimeout(r, 300))
        const afterKill = await fetch(`${baseUrl}/process/status`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        })
        const afterData = await afterKill.json()
        expect(afterData.running).toBe(false)
    })
})
