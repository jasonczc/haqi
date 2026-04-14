import { Hono } from 'hono'
import { execSync } from 'node:child_process'

type DesktopDeps = {
    resolveSession: (sessionId: string) => { machineId: string; containerId?: string } | null
}

export function getContainerHostPort(containerId: string, containerPort: number): number | null {
    try {
        const output = execSync(
            `docker port ${containerId} ${containerPort}/tcp 2>/dev/null`,
            { timeout: 3000, encoding: 'utf-8' }
        ).trim()
        // Output: "0.0.0.0:12345" or ":::12345"
        const match = output.match(/:(\d+)$/)
        return match ? parseInt(match[1], 10) : null
    } catch {
        return null
    }
}

function buildDesktopProxyPath(sessionId: string, assetPath: string): string {
    const normalizedAssetPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath
    return `/desktop/proxy/${encodeURIComponent(sessionId)}/${normalizedAssetPath}`
}

export function resolveDesktopProxyTarget(
    deps: DesktopDeps,
    sessionId: string
): { hostPort: number } | null {
    const session = deps.resolveSession(sessionId)
    if (!session?.containerId) {
        return null
    }
    const hostPort = getContainerHostPort(session.containerId, 6080)
    if (!hostPort) {
        return null
    }
    return { hostPort }
}

export function createDesktopRoutes(deps: DesktopDeps): Hono {
    const app = new Hono()

    app.all('/proxy/:sessionId/*', async (c) => {
        const sessionId = c.req.param('sessionId')
        const target = resolveDesktopProxyTarget(deps, sessionId)
        if (!target) {
            return c.text('Desktop proxy unavailable', 502)
        }

        const path = '/' + (c.req.path.split('/').slice(4).join('/') || '')
        const search = new URL(c.req.url).search
        const headers: Record<string, string> = {}
        c.req.raw.headers.forEach((value, key) => {
            if (key !== 'host') headers[key] = value
        })
        const body = c.req.method !== 'GET' && c.req.method !== 'HEAD'
            ? await c.req.text()
            : undefined

        const response = await fetch(`http://127.0.0.1:${target.hostPort}${path}${search}`, {
            method: c.req.method,
            headers,
            body
        }).catch(() => null)

        if (!response) {
            return c.text('Desktop proxy error', 502)
        }

        return new Response(response.body, {
            status: response.status,
            headers: response.headers
        })
    })

    // Serve noVNC iframe page
    app.get('/:sessionId', (c) => {
        const sessionId = c.req.param('sessionId')
        const session = deps.resolveSession(sessionId)
        if (!session) return c.text('Session not found', 404)

        // For local Docker containers, connect directly to the host-mapped noVNC port.
        // Route both HTTP assets and the VNC WebSocket through same-origin
        // desktop proxy paths so remote browsers never see localhost URLs.
        const target = resolveDesktopProxyTarget(deps, sessionId)
        const novncSrc = target
            ? `${buildDesktopProxyPath(sessionId, 'vnc.html')}?autoconnect=true&resize=scale&path=${encodeURIComponent(`desktop/proxy/${sessionId}/websockify`)}`
            : `/preview/${sessionId}/6080/vnc.html?autoconnect=true&resize=scale`

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Desktop - ${sessionId.slice(0, 8)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a2e; overflow: hidden; }
        iframe { width: 100vw; height: 100vh; border: none; display: block; }
    </style>
</head>
<body>
    <iframe src="${novncSrc}" title="Remote Desktop"></iframe>
</body>
</html>`
        return c.html(html)
    })

    return app
}
