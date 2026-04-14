import { Hono } from 'hono'
import { execSync } from 'node:child_process'

function getContainerHostPort(containerId: string, containerPort: number): number | null {
    try {
        const output = execSync(
            `docker port ${containerId} ${containerPort}/tcp 2>/dev/null`,
            { timeout: 3000, encoding: 'utf-8' }
        ).trim()
        const match = output.match(/:(\d+)$/)
        return match ? parseInt(match[1], 10) : null
    } catch {
        return null
    }
}

function getContainerEnv(containerId: string, envName: string): string | null {
    try {
        const output = execSync(
            `docker exec ${containerId} printenv ${envName} 2>/dev/null`,
            { timeout: 3000, encoding: 'utf-8' }
        ).trim()
        return output || null
    } catch {
        return null
    }
}

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
    resolveSession: (sessionId: string) => { machineId: string; containerId?: string } | null
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

        const path = '/' + (c.req.path.split('/').slice(4).join('/') || '')
        const search = new URL(c.req.url).search
        const headers: Record<string, string> = {}
        c.req.raw.headers.forEach((value, key) => {
            if (key !== 'host') headers[key] = value
        })

        // Local fast-path for daemon/docker sessions running on the same host as hub.
        // This keeps preview/daemon APIs working even if the worker socket reconnects.
        if (session.containerId) {
            const hostPort = getContainerHostPort(session.containerId, port)
            if (hostPort) {
                const directHeaders = { ...headers }
                if (port === 9876) {
                    const daemonAuthToken = getContainerEnv(session.containerId, 'HAQI_DAEMON_AUTH_TOKEN')
                    if (daemonAuthToken) {
                        directHeaders.authorization = `Bearer ${daemonAuthToken}`
                    }
                }
                const directBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
                    ? await c.req.text()
                    : undefined
                const directResponse = await fetch(`http://127.0.0.1:${hostPort}${path}${search}`, {
                    method: c.req.method,
                    headers: directHeaders,
                    body: directBody
                }).catch(() => null)

                if (directResponse) {
                    return new Response(directResponse.body, {
                        status: directResponse.status,
                        headers: directResponse.headers
                    })
                }
            }
        }

        const tunnel = deps.resolvePreviewTunnel(session.machineId, sessionId, port)
        if (!tunnel) {
            return c.text('Preview tunnel not available', 502)
        }

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
