import { Hono } from 'hono'
import { ProcessManager } from './process/manager'
import { OutputBuffer } from './process/output'
import { SpawnRequestSchema, PrepareRequestSchema, ClickRequestSchema, TypeRequestSchema, KeyRequestSchema, ScrollRequestSchema, OpenBrowserRequestSchema } from './types'
import type { HealthResponse } from './types'
import { DesktopManager } from './desktop/vnc'
import * as computerUse from './desktop/computerUse'
import * as browser from './desktop/browser'
import { RecordingManager } from './desktop/recording'

type ServerOptions = {
    port: number
    authToken: string
}

export async function startServer(options: ServerOptions) {
    const { port, authToken } = options
    const startedAt = Date.now()
    const processManager = new ProcessManager()
    const outputBuffer = new OutputBuffer()
    // Mutable so a reused container across worker restarts can be updated via
    // each /process/spawn request env, not just at daemon boot.
    let runnerCallbackUrl: string | undefined = process.env.HAPI_RUNNER_CALLBACK_URL
    let runnerCallbackToken: string | undefined = process.env.HAPI_RUNNER_CALLBACK_TOKEN

    const postRunnerCallback = async (path: string, body: Record<string, unknown>) => {
        if (!runnerCallbackUrl) {
            return
        }
        try {
            await fetch(`${runnerCallbackUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...body,
                    ...(runnerCallbackToken ? { callbackToken: runnerCallbackToken } : {})
                }),
                signal: AbortSignal.timeout(5_000)
            })
        } catch {
            // Best effort only. Runner cleanup should not depend on callback success.
        }
    }

    processManager.on('stdout', (data: string) => outputBuffer.push('stdout', data))
    processManager.on('stderr', (data: string) => outputBuffer.push('stderr', data))
    processManager.on('exit', (event) => {
        if (typeof event.pid !== 'number') {
            return
        }
        void postRunnerCallback('/process-exited', {
            pid: event.pid,
            exitCode: event.exitCode ?? null,
            signal: event.signal ?? null
        })
    })

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
        // Refresh callback URL from each spawn env: a reused container may
        // outlive the worker that created it (e.g., worker restart), and the
        // freshly issued callback URL rides in with the spawn request.
        const envUrl = parsed.data.env?.HAPI_RUNNER_CALLBACK_URL
        const envToken = parsed.data.env?.HAPI_RUNNER_CALLBACK_TOKEN
        if (envUrl) runnerCallbackUrl = envUrl
        if (envToken) runnerCallbackToken = envToken
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

    app.get('/process/output', (c) => {
        const countParam = c.req.query('count')
        const count = countParam ? Math.max(1, Math.min(1000, parseInt(countParam, 10) || 100)) : 100
        return c.json({ chunks: outputBuffer.recent(count) })
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

    const desktopManager = new DesktopManager()
    const recordingManager = new RecordingManager()

    // Desktop control
    app.get('/desktop/status', (c) => {
        return c.json({ started: desktopManager.isStarted(), config: desktopManager.getConfig() })
    })

    app.post('/desktop/screenshot', async (c) => {
        try {
            const result = await computerUse.takeScreenshot()
            return c.json(result)
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Screenshot failed' }, 500)
        }
    })

    app.post('/desktop/click', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = ClickRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
        try {
            await computerUse.click(parsed.data)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Click failed' }, 500)
        }
    })

    app.post('/desktop/type', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = TypeRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
        try {
            await computerUse.typeText(parsed.data)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Type failed' }, 500)
        }
    })

    app.post('/desktop/key', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = KeyRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
        try {
            await computerUse.pressKey(parsed.data)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Key press failed' }, 500)
        }
    })

    app.post('/desktop/scroll', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = ScrollRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
        try {
            await computerUse.scroll(parsed.data)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Scroll failed' }, 500)
        }
    })

    app.get('/desktop/cursor', async (c) => {
        try {
            const pos = await computerUse.getCursorPosition()
            return c.json(pos)
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Failed to get cursor' }, 500)
        }
    })

    app.post('/desktop/open-browser', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = OpenBrowserRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
        computerUse.openBrowser(parsed.data.url)
        return c.json({ ok: true })
    })

    // Browser (Playwright)
    app.post('/browser/navigate', async (c) => {
        const body = await c.req.json().catch(() => null)
        if (!body?.url) return c.json({ error: 'url required' }, 400)
        try {
            const result = await browser.navigate(body.url)
            return c.json(result)
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Navigate failed' }, 500)
        }
    })

    app.post('/browser/click', async (c) => {
        const body = await c.req.json().catch(() => null)
        if (!body?.selector) return c.json({ error: 'selector required' }, 400)
        try {
            await browser.browserClick(body.selector)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Browser click failed' }, 500)
        }
    })

    app.post('/browser/type', async (c) => {
        const body = await c.req.json().catch(() => null)
        if (!body?.selector || !body?.text) return c.json({ error: 'selector and text required' }, 400)
        try {
            await browser.browserType(body.selector, body.text)
            return c.json({ ok: true })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Browser type failed' }, 500)
        }
    })

    app.post('/browser/screenshot', async (c) => {
        try {
            const image = await browser.browserScreenshot()
            return c.json({ image })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Browser screenshot failed' }, 500)
        }
    })

    app.get('/browser/content', async (c) => {
        try {
            const html = await browser.browserContent()
            return c.json({ content: html })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Browser content failed' }, 500)
        }
    })

    app.post('/browser/evaluate', async (c) => {
        const body = await c.req.json().catch(() => null)
        if (!body?.script) return c.json({ error: 'script required' }, 400)
        try {
            const result = await browser.browserEvaluate(body.script)
            return c.json({ result })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Evaluate failed' }, 500)
        }
    })

    // Recording
    app.post('/recording/start', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { sessionId?: string }
        const sessionId = body.sessionId ?? 'unknown'
        try {
            const filename = await recordingManager.start(sessionId)
            return c.json({ filename })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Recording start failed' }, 500)
        }
    })

    app.post('/recording/stop', (c) => {
        const file = recordingManager.stop()
        return c.json({ file })
    })

    app.get('/recording/status', (c) => {
        return c.json(recordingManager.status())
    })

    app.get('/recording/list', async (c) => {
        return c.json({ recordings: await recordingManager.listRecordings() })
    })

    app.get('/recording/download/:name', async (c) => {
        const name = c.req.param('name')
        const filePath = recordingManager.getFilePath(name)
        const file = Bun.file(filePath)
        if (!await file.exists()) return c.json({ error: 'File not found' }, 404)
        return new Response(file.stream(), {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="${name}"`
            }
        })
    })

    // Screenshot storage
    app.post('/screenshot/capture', async (c) => {
        try {
            const result = await computerUse.takeScreenshot()
            const id = `screenshot-${Date.now()}`
            const path = `/tmp/haqi-recordings/${id}.png`
            await Bun.write(path, Buffer.from(result.image, 'base64'))
            return c.json({ id, width: result.width, height: result.height })
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Screenshot capture failed' }, 500)
        }
    })

    app.get('/screenshot/:id', async (c) => {
        const path = `/tmp/haqi-recordings/${c.req.param('id')}.png`
        const file = Bun.file(path)
        if (!await file.exists()) return c.json({ error: 'Not found' }, 404)
        return new Response(file.stream(), { headers: { 'Content-Type': 'image/png' } })
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
