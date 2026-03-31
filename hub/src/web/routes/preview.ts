import { Hono } from 'hono'

type PreviewTunnel = {
    forward: (req: {
        method: string
        path: string
        headers: Record<string, string>
        body?: string
    }) => Promise<{
        status: number
        headers: Record<string, string>
        body?: string
    }>
}

type PreviewDeps = {
    resolveSession: (sessionId: string) => { machineId: string } | null
    resolvePreviewTunnel: (machineId: string, sessionId: string, port: number) => PreviewTunnel | null
}

export function createPreviewRoutes(deps: PreviewDeps): Hono {
    const app = new Hono()

    app.all('/:sessionId/:port/*', async (c) => {
        const sessionId = c.req.param('sessionId')
        const port = parseInt(c.req.param('port'), 10)
        if (isNaN(port)) {
            return c.text('Invalid port', 400)
        }

        const session = deps.resolveSession(sessionId)
        if (!session) {
            return c.text('Session not found', 404)
        }

        const tunnel = deps.resolvePreviewTunnel(session.machineId, sessionId, port)
        if (!tunnel) {
            return c.text('Preview tunnel not available', 502)
        }

        const path = '/' + (c.req.path.split('/').slice(4).join('/') || '')
        const headers: Record<string, string> = {}
        c.req.raw.headers.forEach((value, key) => {
            if (key !== 'host') headers[key] = value
        })

        const body = c.req.method !== 'GET' && c.req.method !== 'HEAD'
            ? await c.req.text()
            : undefined

        try {
            const response = await tunnel.forward({
                method: c.req.method,
                path,
                headers,
                body
            })

            return new Response(response.body, {
                status: response.status,
                headers: response.headers
            })
        } catch (err) {
            return c.text('Preview proxy error', 502)
        }
    })

    return app
}
