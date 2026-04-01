# Computer Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add graphical desktop (VNC), remote desktop access, agent computer use tools (Claude + Playwright), and video recording to daemon-session containers.

**Architecture:** Containers get XFCE + VNC + noVNC + Chrome. Daemon manages desktop lifecycle and exposes APIs for screenshots, mouse/keyboard, browser control, and recording. Hub proxies noVNC WebSocket for remote desktop. Agent uses daemon APIs for computer use loop.

**Tech Stack:** Xvfb, XFCE4, TigerVNC, noVNC/websockify, Chromium, xdotool, scrot, ffmpeg, Playwright, Hono

---

## File Structure

### New files
- `daemon/src/desktop/vnc.ts` — start/stop Xvfb, XFCE, VNC, websockify
- `daemon/src/desktop/computerUse.ts` — screenshot, click, type, key, scroll APIs
- `daemon/src/desktop/browser.ts` — Playwright browser control
- `daemon/src/desktop/recording.ts` — ffmpeg recording management
- `daemon/src/desktop/vnc.test.ts` — VNC startup tests
- `daemon/src/desktop/computerUse.test.ts` — computer use API tests
- `daemon/src/desktop/recording.test.ts` — recording tests
- `hub/src/web/routes/desktop.ts` — Hub desktop route + WS proxy
- `web/src/routes/sessions/desktop.tsx` — noVNC viewer page

### Modified files
- `Dockerfile.workspace` — install desktop packages
- `daemon/src/server.ts` — register desktop/browser/recording routes
- `daemon/src/index.ts` — initialize desktop on startup
- `daemon/src/types.ts` — desktop API types
- `cli/src/cloud/executors/WorkspaceContainerManager.ts` — map port 6080
- `hub/src/web/server.ts` — mount desktop route
- `web/src/router.tsx` — add desktop route

---

### Task 1: Dockerfile Desktop Packages

**Files:**
- Modify: `Dockerfile.workspace`

- [ ] **Step 1: Add desktop packages to Dockerfile**

In the runtime stage of `Dockerfile.workspace`, add after existing `apt-get install`:

```dockerfile
# Desktop environment for Computer Use
RUN apt-get update && apt-get install -y \
    xvfb xfce4 xfce4-terminal dbus-x11 \
    tigervnc-standalone-server tigervnc-common \
    novnc websockify \
    chromium-browser \
    xdotool scrot imagemagick \
    ffmpeg \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Playwright for browser automation
RUN cd /opt/haqi && bun add playwright && bunx playwright install chromium --with-deps || true

ENV DISPLAY=:1
```

- [ ] **Step 2: Test build**

```bash
cd /Users/jasonczc/workspace/haqi
docker build -f Dockerfile.workspace -t haqi-workspace:dev .
```

- [ ] **Step 3: Verify packages inside container**

```bash
docker run --rm haqi-workspace:dev --auth-token test --port 9876 &
sleep 3
CID=$(docker ps -q | head -1)
docker exec $CID which Xvfb xfce4-session vncserver websockify chromium-browser xdotool scrot ffmpeg
docker rm -f $CID
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.workspace
git commit -m "feat: add desktop environment packages to workspace image"
```

---

### Task 2: VNC Desktop Manager

**Files:**
- Create: `daemon/src/desktop/vnc.ts`
- Create: `daemon/src/desktop/vnc.test.ts`

- [ ] **Step 1: Create VNC manager**

```typescript
// daemon/src/desktop/vnc.ts
import { spawn, exec, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export type DesktopConfig = {
    display: string       // ':1'
    resolution: string    // '1280x720'
    depth: number         // 24
    vncPort: number       // 5901
    novncPort: number     // 6080
}

const DEFAULT_CONFIG: DesktopConfig = {
    display: ':1',
    resolution: '1280x720',
    depth: 24,
    vncPort: 5901,
    novncPort: 6080
}

export class DesktopManager {
    private xvfb: ChildProcess | null = null
    private xfce: ChildProcess | null = null
    private vnc: ChildProcess | null = null
    private websockify: ChildProcess | null = null
    private config: DesktopConfig
    private started = false

    constructor(config?: Partial<DesktopConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config }
    }

    async start(): Promise<void> {
        if (this.started) return

        const { display, resolution, depth, vncPort, novncPort } = this.config

        // Start Xvfb
        this.xvfb = spawn('Xvfb', [display, '-screen', '0', `${resolution}x${depth}`], {
            stdio: 'ignore',
            env: { ...process.env }
        })

        await new Promise(r => setTimeout(r, 1000))

        // Start XFCE desktop
        this.xfce = spawn('startxfce4', [], {
            stdio: 'ignore',
            env: { ...process.env, DISPLAY: display }
        })

        await new Promise(r => setTimeout(r, 2000))

        // Start VNC server (x0vncserver connects to existing X display)
        this.vnc = spawn('x0vncserver', [
            '-display', display,
            '-rfbport', String(vncPort),
            '-SecurityTypes', 'None'
        ], {
            stdio: 'ignore',
            env: { ...process.env, DISPLAY: display }
        })

        await new Promise(r => setTimeout(r, 500))

        // Start websockify (VNC -> WebSocket bridge)
        const novncPath = '/usr/share/novnc'
        this.websockify = spawn('websockify', [
            '--web', novncPath,
            String(novncPort),
            `localhost:${vncPort}`
        ], {
            stdio: 'ignore',
            env: { ...process.env }
        })

        this.started = true
        console.log(`Desktop started: VNC on :${vncPort}, noVNC on :${novncPort}`)
    }

    stop(): void {
        for (const proc of [this.websockify, this.vnc, this.xfce, this.xvfb]) {
            proc?.kill()
        }
        this.started = false
    }

    isStarted(): boolean {
        return this.started
    }

    getConfig(): DesktopConfig {
        return this.config
    }

    async isDisplayReady(): Promise<boolean> {
        try {
            await execAsync(`xdpyinfo -display ${this.config.display}`, {
                env: { ...process.env, DISPLAY: this.config.display }
            })
            return true
        } catch {
            return false
        }
    }
}
```

- [ ] **Step 2: Write test**

```typescript
// daemon/src/desktop/vnc.test.ts
import { describe, it, expect } from 'bun:test'
import { DesktopManager } from './vnc'

describe('DesktopManager', () => {
    it('creates with default config', () => {
        const dm = new DesktopManager()
        expect(dm.getConfig().display).toBe(':1')
        expect(dm.getConfig().novncPort).toBe(6080)
        expect(dm.isStarted()).toBe(false)
    })

    it('accepts custom config', () => {
        const dm = new DesktopManager({ display: ':2', resolution: '1920x1080' })
        expect(dm.getConfig().display).toBe(':2')
        expect(dm.getConfig().resolution).toBe('1920x1080')
    })
})
```

Note: Full start/stop tests require X11 (run inside container). Unit tests verify config only.

- [ ] **Step 3: Run test**

```bash
cd daemon && bun test src/desktop/vnc.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add daemon/src/desktop/
git commit -m "feat(daemon): add VNC desktop manager"
```

---

### Task 3: Computer Use APIs

**Files:**
- Create: `daemon/src/desktop/computerUse.ts`
- Create: `daemon/src/desktop/computerUse.test.ts`
- Modify: `daemon/src/types.ts`

- [ ] **Step 1: Add types**

In `daemon/src/types.ts`:

```typescript
export const ScreenshotResponseSchema = z.object({
    image: z.string(),  // base64 PNG
    width: z.number(),
    height: z.number()
})

export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>

export const ClickRequestSchema = z.object({
    x: z.number(),
    y: z.number(),
    button: z.enum(['left', 'right', 'middle']).optional()
})

export type ClickRequest = z.infer<typeof ClickRequestSchema>

export const TypeRequestSchema = z.object({
    text: z.string()
})

export type TypeRequest = z.infer<typeof TypeRequestSchema>

export const KeyRequestSchema = z.object({
    key: z.string()  // e.g., 'ctrl+s', 'Return', 'Tab'
})

export type KeyRequest = z.infer<typeof KeyRequestSchema>

export const ScrollRequestSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    direction: z.enum(['up', 'down']),
    clicks: z.number().int().positive().optional()
})

export type ScrollRequest = z.infer<typeof ScrollRequestSchema>

export const OpenBrowserRequestSchema = z.object({
    url: z.string().url()
})

export type OpenBrowserRequest = z.infer<typeof OpenBrowserRequestSchema>
```

- [ ] **Step 2: Create computer use module**

```typescript
// daemon/src/desktop/computerUse.ts
import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import type { ScreenshotResponse, ClickRequest, TypeRequest, KeyRequest, ScrollRequest } from '../types'

const execAsync = promisify(exec)

const DISPLAY = process.env.DISPLAY || ':1'
const ENV = { ...process.env, DISPLAY }

export async function takeScreenshot(): Promise<ScreenshotResponse> {
    const path = `/tmp/screenshot-${Date.now()}.png`
    await execAsync(`scrot -o ${path}`, { env: ENV })
    const buffer = await readFile(path)
    const image = buffer.toString('base64')
    // Get dimensions
    const { stdout } = await execAsync(`identify -format '%wx%h' ${path}`, { env: ENV })
    const [width, height] = stdout.split('x').map(Number)
    return { image, width: width || 1280, height: height || 720 }
}

export async function click(req: ClickRequest): Promise<void> {
    const button = req.button === 'right' ? '3' : req.button === 'middle' ? '2' : '1'
    await execAsync(`xdotool mousemove --sync ${req.x} ${req.y} click ${button}`, { env: ENV })
}

export async function typeText(req: TypeRequest): Promise<void> {
    await execAsync(`xdotool type --delay 50 -- "${req.text.replace(/"/g, '\\"')}"`, { env: ENV })
}

export async function pressKey(req: KeyRequest): Promise<void> {
    await execAsync(`xdotool key -- ${req.key}`, { env: ENV })
}

export async function scroll(req: ScrollRequest): Promise<void> {
    const clicks = req.clicks ?? 3
    if (req.x !== undefined && req.y !== undefined) {
        await execAsync(`xdotool mousemove --sync ${req.x} ${req.y}`, { env: ENV })
    }
    const button = req.direction === 'up' ? '4' : '5'
    await execAsync(`xdotool click --repeat ${clicks} ${button}`, { env: ENV })
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
    const { stdout } = await execAsync('xdotool getmouselocation', { env: ENV })
    const match = stdout.match(/x:(\d+)\s+y:(\d+)/)
    return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) }
}

export function openBrowser(url: string): void {
    spawn('chromium-browser', ['--no-sandbox', '--disable-gpu', url], {
        stdio: 'ignore',
        detached: true,
        env: ENV
    }).unref()
}
```

- [ ] **Step 3: Write test**

```typescript
// daemon/src/desktop/computerUse.test.ts
import { describe, it, expect } from 'bun:test'

describe('computerUse', () => {
    it('module exports all functions', async () => {
        const mod = await import('./computerUse')
        expect(typeof mod.takeScreenshot).toBe('function')
        expect(typeof mod.click).toBe('function')
        expect(typeof mod.typeText).toBe('function')
        expect(typeof mod.pressKey).toBe('function')
        expect(typeof mod.scroll).toBe('function')
        expect(typeof mod.getCursorPosition).toBe('function')
        expect(typeof mod.openBrowser).toBe('function')
    })
})
```

- [ ] **Step 4: Run test + commit**

```bash
cd daemon && bun test src/desktop/computerUse.test.ts
git add daemon/src/desktop/computerUse.ts daemon/src/desktop/computerUse.test.ts daemon/src/types.ts
git commit -m "feat(daemon): add computer use APIs (screenshot, click, type, key, scroll)"
```

---

### Task 4: Playwright Browser Control

**Files:**
- Create: `daemon/src/desktop/browser.ts`

- [ ] **Step 1: Create browser control module**

```typescript
// daemon/src/desktop/browser.ts
let browserInstance: any = null
let pageInstance: any = null

async function ensureBrowser(): Promise<{ browser: any; page: any }> {
    if (browserInstance && pageInstance) {
        return { browser: browserInstance, page: pageInstance }
    }

    try {
        const { chromium } = await import('playwright')
        browserInstance = await chromium.launch({
            headless: false, // Use the desktop's display
            args: ['--no-sandbox', '--disable-gpu']
        })
        pageInstance = await browserInstance.newPage()
        return { browser: browserInstance, page: pageInstance }
    } catch (err) {
        throw new Error(`Failed to launch browser: ${err instanceof Error ? err.message : err}`)
    }
}

export async function navigate(url: string): Promise<{ url: string; title: string }> {
    const { page } = await ensureBrowser()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return { url: page.url(), title: await page.title() }
}

export async function browserClick(selector: string): Promise<void> {
    const { page } = await ensureBrowser()
    await page.click(selector, { timeout: 10000 })
}

export async function browserType(selector: string, text: string): Promise<void> {
    const { page } = await ensureBrowser()
    await page.fill(selector, text, { timeout: 10000 })
}

export async function browserScreenshot(): Promise<string> {
    const { page } = await ensureBrowser()
    const buffer = await page.screenshot({ type: 'png' })
    return buffer.toString('base64')
}

export async function browserContent(): Promise<string> {
    const { page } = await ensureBrowser()
    return await page.content()
}

export async function browserEvaluate(script: string): Promise<unknown> {
    const { page } = await ensureBrowser()
    return await page.evaluate(script)
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close().catch(() => {})
        browserInstance = null
        pageInstance = null
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add daemon/src/desktop/browser.ts
git commit -m "feat(daemon): add Playwright browser control API"
```

---

### Task 5: Video Recording

**Files:**
- Create: `daemon/src/desktop/recording.ts`
- Create: `daemon/src/desktop/recording.test.ts`

- [ ] **Step 1: Create recording module**

```typescript
// daemon/src/desktop/recording.ts
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const RECORDINGS_DIR = '/tmp/haqi-recordings'
const DISPLAY = process.env.DISPLAY || ':1'

export class RecordingManager {
    private ffmpeg: ChildProcess | null = null
    private currentFile: string | null = null
    private startedAt: number | null = null

    async start(sessionId: string, resolution = '1280x720', framerate = 5): Promise<string> {
        if (this.ffmpeg) {
            throw new Error('Recording already in progress')
        }

        await mkdir(RECORDINGS_DIR, { recursive: true })
        const filename = `session-${sessionId}-${Date.now()}.mp4`
        this.currentFile = join(RECORDINGS_DIR, filename)

        this.ffmpeg = spawn('ffmpeg', [
            '-f', 'x11grab',
            '-video_size', resolution,
            '-framerate', String(framerate),
            '-i', DISPLAY,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '30',
            '-y',
            this.currentFile
        ], {
            stdio: 'ignore',
            env: { ...process.env, DISPLAY }
        })

        this.startedAt = Date.now()
        return filename
    }

    stop(): string | null {
        if (!this.ffmpeg) return null
        this.ffmpeg.kill('SIGINT') // Graceful stop for ffmpeg
        this.ffmpeg = null
        const file = this.currentFile
        this.currentFile = null
        this.startedAt = null
        return file
    }

    isRecording(): boolean {
        return this.ffmpeg !== null
    }

    status(): { recording: boolean; file: string | null; durationMs: number | null } {
        return {
            recording: this.ffmpeg !== null,
            file: this.currentFile,
            durationMs: this.startedAt ? Date.now() - this.startedAt : null
        }
    }

    async listRecordings(): Promise<Array<{ name: string; size: number; createdAt: number }>> {
        try {
            const files = await readdir(RECORDINGS_DIR)
            const results = []
            for (const name of files) {
                if (!name.endsWith('.mp4') && !name.endsWith('.png')) continue
                const s = await stat(join(RECORDINGS_DIR, name))
                results.push({ name, size: s.size, createdAt: s.mtimeMs })
            }
            return results.sort((a, b) => b.createdAt - a.createdAt)
        } catch {
            return []
        }
    }

    getFilePath(name: string): string {
        return join(RECORDINGS_DIR, name)
    }
}
```

- [ ] **Step 2: Write test**

```typescript
// daemon/src/desktop/recording.test.ts
import { describe, it, expect } from 'bun:test'
import { RecordingManager } from './recording'

describe('RecordingManager', () => {
    it('starts not recording', () => {
        const rm = new RecordingManager()
        expect(rm.isRecording()).toBe(false)
        expect(rm.status().recording).toBe(false)
    })

    it('lists empty recordings', async () => {
        const rm = new RecordingManager()
        const list = await rm.listRecordings()
        expect(Array.isArray(list)).toBe(true)
    })
})
```

- [ ] **Step 3: Run test + commit**

```bash
cd daemon && bun test src/desktop/recording.test.ts
git add daemon/src/desktop/
git commit -m "feat(daemon): add video recording manager (ffmpeg)"
```

---

### Task 6: Wire Desktop APIs into Daemon Server

**Files:**
- Modify: `daemon/src/server.ts`
- Modify: `daemon/src/index.ts`

- [ ] **Step 1: Add desktop routes to server.ts**

Add after existing routes in `daemon/src/server.ts`:

```typescript
import { DesktopManager } from './desktop/vnc'
import * as computerUse from './desktop/computerUse'
import * as browser from './desktop/browser'
import { RecordingManager } from './desktop/recording'
import { ClickRequestSchema, TypeRequestSchema, KeyRequestSchema, ScrollRequestSchema, OpenBrowserRequestSchema } from './types'

// In startServer function, after existing routes:
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
    await computerUse.click(parsed.data)
    return c.json({ ok: true })
})

app.post('/desktop/type', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = TypeRequestSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    await computerUse.typeText(parsed.data)
    return c.json({ ok: true })
})

app.post('/desktop/key', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = KeyRequestSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    await computerUse.pressKey(parsed.data)
    return c.json({ ok: true })
})

app.post('/desktop/scroll', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = ScrollRequestSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    await computerUse.scroll(parsed.data)
    return c.json({ ok: true })
})

app.get('/desktop/cursor', async (c) => {
    const pos = await computerUse.getCursorPosition()
    return c.json(pos)
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
    const result = await browser.navigate(body.url)
    return c.json(result)
})

app.post('/browser/click', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body?.selector) return c.json({ error: 'selector required' }, 400)
    await browser.browserClick(body.selector)
    return c.json({ ok: true })
})

app.post('/browser/type', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body?.selector || !body?.text) return c.json({ error: 'selector and text required' }, 400)
    await browser.browserType(body.selector, body.text)
    return c.json({ ok: true })
})

app.post('/browser/screenshot', async (c) => {
    const image = await browser.browserScreenshot()
    return c.json({ image })
})

app.get('/browser/content', async (c) => {
    const html = await browser.browserContent()
    return c.json({ content: html })
})

app.post('/browser/evaluate', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body?.script) return c.json({ error: 'script required' }, 400)
    const result = await browser.browserEvaluate(body.script)
    return c.json({ result })
})

// Recording
app.post('/recording/start', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { sessionId?: string }
    const sessionId = body.sessionId ?? 'unknown'
    const filename = await recordingManager.start(sessionId)
    return c.json({ filename })
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
    const filePath = recordingManager.getFilePath(c.req.param('name'))
    const file = Bun.file(filePath)
    if (!await file.exists()) return c.json({ error: 'File not found' }, 404)
    return new Response(file.stream(), {
        headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename="${c.req.param('name')}"` }
    })
})

// Screenshot storage
app.post('/screenshot/capture', async (c) => {
    const result = await computerUse.takeScreenshot()
    const id = `screenshot-${Date.now()}`
    const path = `/tmp/haqi-recordings/${id}.png`
    await Bun.write(path, Buffer.from(result.image, 'base64'))
    return c.json({ id, width: result.width, height: result.height })
})

app.get('/screenshot/:id', async (c) => {
    const path = `/tmp/haqi-recordings/${c.req.param('id')}.png`
    const file = Bun.file(path)
    if (!await file.exists()) return c.json({ error: 'Not found' }, 404)
    return new Response(file.stream(), { headers: { 'Content-Type': 'image/png' } })
})
```

- [ ] **Step 2: Initialize desktop in daemon index.ts**

Update `daemon/src/index.ts` to start the desktop environment:

```typescript
import { DesktopManager } from './desktop/vnc'

// After startServer:
const desktop = new DesktopManager()
try {
    await desktop.start()
    console.log('Desktop environment started')
} catch (err) {
    console.warn('Desktop environment failed to start (may not be available):', err)
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd daemon && bun run typecheck
git add daemon/src/server.ts daemon/src/index.ts
git commit -m "feat(daemon): wire desktop, browser, and recording APIs into server"
```

---

### Task 7: Container Port Mapping

**Files:**
- Modify: `cli/src/cloud/executors/WorkspaceContainerManager.ts`

- [ ] **Step 1: Add noVNC port mapping**

In `WorkspaceContainerManager.ts`, find where daemon port is added to `portSpecs` (around the `if (params.daemonMode)` block). Add noVNC port:

```typescript
if (params.daemonMode) {
    portSpecs.push({
        containerPort: params.daemonMode.daemonPort,
        hostPort: undefined,
        protocol: 'tcp'
    })
    // noVNC port for remote desktop
    portSpecs.push({
        containerPort: 6080,
        hostPort: undefined,
        protocol: 'tcp'
    })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun typecheck
git add cli/src/cloud/executors/WorkspaceContainerManager.ts
git commit -m "feat(cli): map noVNC port 6080 in daemon-session containers"
```

---

### Task 8: Hub Desktop Route

**Files:**
- Create: `hub/src/web/routes/desktop.ts`
- Modify: `hub/src/web/server.ts`

- [ ] **Step 1: Create desktop route**

```typescript
// hub/src/web/routes/desktop.ts
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'

type DesktopDeps = {
    resolveSession: (sessionId: string) => { machineId: string } | null
    resolveDesktopUrl: (machineId: string, sessionId: string) => Promise<string | null>
}

export function createDesktopRoutes(deps: DesktopDeps): Hono {
    const app = new Hono()

    // Serve noVNC HTML page
    app.get('/:sessionId', async (c) => {
        const sessionId = c.req.param('sessionId')
        const session = deps.resolveSession(sessionId)
        if (!session) return c.text('Session not found', 404)

        const novncUrl = await deps.resolveDesktopUrl(session.machineId, sessionId)
        if (!novncUrl) return c.text('Desktop not available', 502)

        // Return HTML page with embedded noVNC client
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>HAQI Desktop - ${sessionId.slice(0, 8)}</title>
    <style>
        body { margin: 0; overflow: hidden; background: #1a1a2e; }
        #vnc { width: 100vw; height: 100vh; }
        iframe { border: none; width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="vnc">
        <iframe src="${novncUrl}/vnc.html?autoconnect=true&resize=scale"></iframe>
    </div>
</body>
</html>`
        return c.html(html)
    })

    return app
}
```

- [ ] **Step 2: Mount in server.ts**

In `hub/src/web/server.ts`, add before auth middleware:

```typescript
import { createDesktopRoutes } from './routes/desktop'

app.route('/desktop', createDesktopRoutes({
    resolveSession: (sessionId) => {
        const engine = options.getSyncEngine()
        if (!engine) return null
        const session = engine.getSession(sessionId)
        if (!session) return null
        const metadata = session.metadata as any
        if (!metadata?.machineId) return null
        const machines = engine.getOnlineMachinesByNamespace(session.namespace)
        const cloudWorker = machines.find(m =>
            m.metadata?.executorType === 'cloud-self-hosted' || m.metadata?.executorType === 'cloud-managed'
        )
        return cloudWorker ? { machineId: cloudWorker.id } : { machineId: metadata.machineId }
    },
    resolveDesktopUrl: async (machineId, sessionId) => {
        const engine = options.getSyncEngine()
        if (!engine) return null
        try {
            const result = await engine.rpcPreviewForward(machineId, {
                sessionId,
                port: 6080,
                method: 'GET',
                path: '/',
                headers: {}
            }) as any
            // If reachable, the noVNC is at the preview tunnel URL
            if (result?.status === 200) {
                return `/preview/${sessionId}/6080`
            }
        } catch {}
        return null
    }
}))
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun typecheck
git add hub/src/web/routes/desktop.ts hub/src/web/server.ts
git commit -m "feat(hub): add desktop route with noVNC proxy"
```

---

### Task 9: Web UI Desktop Page

**Files:**
- Create: `web/src/routes/sessions/desktop.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Create desktop viewer page**

```tsx
// web/src/routes/sessions/desktop.tsx
import { useParams } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'

export default function DesktopPage() {
    const { sessionId } = useParams({ strict: false }) as { sessionId: string }
    const { api } = useAppContext()

    if (!sessionId) {
        return <div className="p-4 text-red-500">Session ID required</div>
    }

    const desktopUrl = `/desktop/${sessionId}`

    return (
        <div className="flex h-screen flex-col">
            <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4 py-2">
                <a href={`/sessions/${sessionId}`} className="text-sm text-[var(--app-link)]">
                    ← Back to session
                </a>
                <span className="text-sm font-medium">Desktop</span>
                <span className="text-xs text-[var(--app-hint)]">{sessionId.slice(0, 8)}...</span>
            </div>
            <iframe
                src={desktopUrl}
                className="flex-1 border-0"
                title="Remote Desktop"
            />
        </div>
    )
}
```

- [ ] **Step 2: Add route**

In `web/src/router.tsx`:

```typescript
import DesktopPage from '@/routes/sessions/desktop'

const desktopRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/$sessionId/desktop',
    component: DesktopPage,
})

// Add to routeTree
```

- [ ] **Step 3: Build + commit**

```bash
bun typecheck
cd web && bun run build
git add web/src/routes/sessions/desktop.tsx web/src/router.tsx
git commit -m "feat(web): add remote desktop viewer page"
```

---

### Task 10: Rebuild Image + E2E Verification

- [ ] **Step 1: Rebuild workspace image**

```bash
docker build -f Dockerfile.workspace -t haqi-workspace:dev .
```

- [ ] **Step 2: Full typecheck + tests**

```bash
bun typecheck
cd daemon && bun run typecheck && bun test
```

- [ ] **Step 3: Manual e2e test**

1. Start Hub + Worker
2. Spawn daemon-session
3. Check daemon desktop status: `GET /desktop/status` → `started: true`
4. Take screenshot: `POST /desktop/screenshot` → base64 PNG
5. Open browser: `POST /desktop/open-browser` → { url: "https://example.com" }
6. Take another screenshot (should show browser)
7. Open `/desktop/:sessionId/` in browser → see noVNC desktop
8. Start recording: `POST /recording/start`
9. Stop recording: `POST /recording/stop`
10. Download video: `GET /recording/download/:name`

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address computer use e2e issues"
```
