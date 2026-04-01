import { Hono } from 'hono'

type DesktopDeps = {
    resolveSession: (sessionId: string) => { machineId: string } | null
}

export function createDesktopRoutes(deps: DesktopDeps): Hono {
    const app = new Hono()

    // Serve noVNC iframe page
    app.get('/:sessionId', (c) => {
        const sessionId = c.req.param('sessionId')
        const session = deps.resolveSession(sessionId)
        if (!session) return c.text('Session not found', 404)

        const novncSrc = `/preview/${sessionId}/6080/vnc.html?autoconnect=true&resize=scale`

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
