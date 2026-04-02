import { Hono } from 'hono'
import { execSync } from 'node:child_process'

type DesktopDeps = {
    resolveSession: (sessionId: string) => { machineId: string; containerId?: string } | null
}

function getContainerHostPort(containerId: string, containerPort: number): number | null {
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

export function createDesktopRoutes(deps: DesktopDeps): Hono {
    const app = new Hono()

    // Serve noVNC iframe page
    app.get('/:sessionId', (c) => {
        const sessionId = c.req.param('sessionId')
        const session = deps.resolveSession(sessionId)
        if (!session) return c.text('Session not found', 404)

        // For local Docker containers, connect directly to the host-mapped noVNC port.
        // This is necessary because the preview proxy doesn't support WebSocket.
        const hostPort = session.containerId
            ? getContainerHostPort(session.containerId, 6080)
            : null
        const novncSrc = hostPort
            ? `http://localhost:${hostPort}/vnc.html?autoconnect=true&resize=scale`
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
