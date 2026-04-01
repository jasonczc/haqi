import { Hono } from 'hono'
import { ProcessManager } from './process/manager'
import { OutputBuffer } from './process/output'
import { SpawnRequestSchema, PrepareRequestSchema } from './types'
import type { HealthResponse } from './types'

type ServerOptions = {
    port: number
    authToken: string
}

export async function startServer(options: ServerOptions) {
    const { port, authToken } = options
    const startedAt = Date.now()
    const processManager = new ProcessManager()
    const outputBuffer = new OutputBuffer()

    processManager.on('stdout', (data: string) => outputBuffer.push('stdout', data))
    processManager.on('stderr', (data: string) => outputBuffer.push('stderr', data))

    const app = new Hono()

    // Auth middleware
    app.use('*', async (c, next) => {
        const auth = c.req.header('Authorization')
        if (auth !== `Bearer ${authToken}`) {
            return c.json({ error: 'Unauthorized' }, 401)
        }
        return next()
    })

    app.get('/health', (c) => {
        const response: HealthResponse = {
            status: 'ok',
            pid: process.pid,
            uptimeMs: Date.now() - startedAt
        }
        return c.json(response)
    })

    app.post('/process/spawn', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = SpawnRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid request', details: parsed.error.format() }, 400)
        }
        const result = await processManager.spawn(parsed.data)
        return c.json(result)
    })

    app.post('/process/kill', (c) => {
        processManager.kill()
        return c.json({ ok: true })
    })

    app.get('/process/status', (c) => {
        return c.json(processManager.status())
    })

    app.post('/checkpoint/save', async (c) => {
        const { execSync } = await import('node:child_process')
        const hostname = execSync('hostname').toString().trim()
        return c.json({ containerId: hostname, success: true })
    })

    app.post('/runtime/prepare', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = PrepareRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid request' }, 400)
        }
        try {
            const { execSync } = await import('node:child_process')
            for (const cmd of parsed.data.commands) {
                execSync(cmd, {
                    cwd: parsed.data.cwd,
                    env: { ...process.env, ...(parsed.data.env ?? {}) },
                    stdio: 'pipe',
                    timeout: 300_000
                })
            }
            return c.json({ success: true })
        } catch (err) {
            return c.json({
                success: false,
                error: err instanceof Error ? err.message : String(err)
            })
        }
    })

    const bunServer = Bun.serve({
        port: port === 0 ? undefined : port,
        fetch: app.fetch
    })

    const actualPort: number = bunServer.port ?? port

    app.get('/preview/ports', async (c) => {
        const { detectListeningPorts } = await import('./preview/detector')
        const ports = await detectListeningPorts([actualPort])
        return c.json({ ports })
    })

    app.post('/preview/proxy', async (c) => {
        const body = await c.req.json().catch(() => null)
        if (!body?.port || !body?.method || !body?.path) {
            return c.json({ status: 400, headers: {}, body: 'Missing port/method/path' })
        }
        try {
            const url = `http://127.0.0.1:${body.port}${body.path}`
            const response = await fetch(url, {
                method: body.method,
                headers: body.headers ?? {},
                body: body.method !== 'GET' && body.method !== 'HEAD' ? body.body : undefined
            })
            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((v, k) => { responseHeaders[k] = v })
            const responseBody = await response.text()
            return c.json({
                status: response.status,
                headers: responseHeaders,
                body: responseBody
            })
        } catch (err) {
            return c.json({
                status: 502,
                headers: {},
                body: `Preview proxy error: ${err instanceof Error ? err.message : err}`
            })
        }
    })

    console.log(`haqi-daemon listening on :${actualPort}`)

    return {
        port: actualPort,
        stop: () => {
            processManager.kill()
            bunServer.stop()
        },
        processManager
    }
}
