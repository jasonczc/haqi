import type {
    ComputerAction,
    ComputerActionOutcome,
    DisplayInfo
} from './types'

/**
 * Abstract backend for computer-use actions.
 *
 * Default implementation talks to the per-session daemon HTTP API
 * (running inside the workspace container), but the interface is
 * deliberately transport-agnostic so a test double or a remote
 * daemon variant can drop in.
 */
export interface ComputerUseRuntime {
    execute(action: ComputerAction): Promise<ComputerActionOutcome>
    getDisplayInfo(): Promise<DisplayInfo>
}

const DEFAULT_DAEMON_BASE = 'http://127.0.0.1:9876'

/**
 * Daemon route table. Keep in sync with daemon/src/server.ts —
 * unit tests guard against drift.
 *
 * Naming notes (got me once):
 *   - daemon uses `/desktop/cursor` (GET) — NOT `/desktop/cursor-position`
 *   - daemon uses `/desktop/open-browser` — NOT `/desktop/browser`
 */
type DaemonRoute = { method: 'GET' | 'POST'; path: string }

const ACTION_TO_ROUTE: Record<ComputerAction['kind'], DaemonRoute> = {
    screenshot:       { method: 'POST', path: '/desktop/screenshot' },
    cursor_position:  { method: 'GET',  path: '/desktop/cursor' },
    click:            { method: 'POST', path: '/desktop/click' },
    type:             { method: 'POST', path: '/desktop/type' },
    key:              { method: 'POST', path: '/desktop/key' },
    scroll:           { method: 'POST', path: '/desktop/scroll' },
    open_browser:     { method: 'POST', path: '/desktop/open-browser' }
}

function resolveDaemonBase(override?: string | null): string {
    if (override && override.trim()) return override.trim().replace(/\/$/, '')
    const envUrl = process.env.HAQI_DAEMON_URL
    if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '')
    return DEFAULT_DAEMON_BASE
}

/** Strip the `kind` discriminator so the body matches daemon's expected shape. */
function bodyFor(action: ComputerAction): Record<string, unknown> {
    const { kind: _kind, ...rest } = action as Record<string, unknown> & { kind: string }
    return rest
}

export class DaemonComputerUseRuntime implements ComputerUseRuntime {
    private cachedDisplay: DisplayInfo | null = null

    constructor(private readonly daemonBase: string = resolveDaemonBase()) {}

    async execute(action: ComputerAction): Promise<ComputerActionOutcome> {
        const route = ACTION_TO_ROUTE[action.kind]
        if (!route) {
            return { kind: 'error', action: action.kind, message: `Unknown action ${action.kind}` }
        }

        try {
            const init: RequestInit = {
                method: route.method,
                headers: route.method === 'POST' ? { 'content-type': 'application/json' } : undefined
            }
            if (route.method === 'POST') {
                init.body = JSON.stringify(bodyFor(action))
            }
            const res = await fetch(`${this.daemonBase}${route.path}`, init)
            const text = await res.text()
            const parsed = text ? safeJson(text) : null

            if (!res.ok) {
                const message = extractError(parsed) ?? `HTTP ${res.status}`
                return { kind: 'error', action: action.kind, message }
            }

            return this.decodeResult(action, parsed)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { kind: 'error', action: action.kind, message }
        }
    }

    async getDisplayInfo(): Promise<DisplayInfo> {
        if (this.cachedDisplay) return this.cachedDisplay

        const outcome = await this.execute({ kind: 'screenshot' })
        if (outcome.kind === 'screenshot') {
            this.cachedDisplay = { width: outcome.width, height: outcome.height }
            return this.cachedDisplay
        }
        // Fall back to a sensible default; adapters can override via their own probes.
        return { width: 1280, height: 720 }
    }

    private decodeResult(action: ComputerAction, body: unknown): ComputerActionOutcome {
        if (action.kind === 'screenshot') {
            if (isObject(body) && typeof body.image === 'string') {
                return {
                    kind: 'screenshot',
                    imageBase64: body.image,
                    width: typeof body.width === 'number' ? body.width : 0,
                    height: typeof body.height === 'number' ? body.height : 0
                }
            }
            return { kind: 'error', action: 'screenshot', message: 'daemon returned no image data' }
        }
        if (action.kind === 'cursor_position') {
            if (isObject(body) && typeof body.x === 'number' && typeof body.y === 'number') {
                return { kind: 'cursor_position', x: body.x, y: body.y }
            }
            return { kind: 'error', action: 'cursor_position', message: 'daemon returned no cursor coords' }
        }
        return { kind: 'ok' }
    }
}

function safeJson(text: string): unknown {
    try { return JSON.parse(text) } catch { return null }
}

function extractError(body: unknown): string | null {
    if (isObject(body) && typeof body.error === 'string') return body.error
    return null
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
