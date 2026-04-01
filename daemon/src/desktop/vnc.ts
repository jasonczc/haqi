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
