import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { Readable } from 'node:stream'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveHaqiBinary, type ResolvedBinary } from './binaryResolver'

const DEFAULT_HUB_PORT = 3006
const HEALTH_TIMEOUT_MS = 250
const STARTUP_TIMEOUT_MS = 15_000
const STARTUP_POLL_INTERVAL_MS = 250
const SHUTDOWN_TIMEOUT_MS = 5_000
const LOG_TAIL_BYTES = 12_000

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type SpawnLike = typeof spawn

export interface HubManagerOptions {
    env?: NodeJS.ProcessEnv
    homeDir?: string
    logDir?: string
    isPackaged?: boolean
    resourcesPath?: string
    cwd?: string
    fetchImpl?: FetchLike
    spawnImpl?: SpawnLike
    resolveBinary?: () => ResolvedBinary
    startupTimeoutMs?: number
    pollIntervalMs?: number
}

interface HubState {
    child: ChildProcessByStdio<null, Readable, Readable> | null
    weStarted: boolean
    logPath: string | null
}

const state: HubState = {
    child: null,
    weStarted: false,
    logPath: null
}

function expandHome(path: string): string {
    return path.replace(/^~/, homedir())
}

export function resolveHubPort(options: { env?: NodeJS.ProcessEnv; homeDir?: string } = {}): number {
    const env = options.env ?? process.env
    const envPort = env.HAPI_LISTEN_PORT ? Number.parseInt(env.HAPI_LISTEN_PORT, 10) : NaN
    if (Number.isFinite(envPort) && envPort > 0) {
        return envPort
    }

    const homeDir = expandHome(options.homeDir ?? env.HAPI_HOME ?? join(homedir(), '.hapi'))
    const settingsPath = join(homeDir, 'settings.json')
    try {
        if (!existsSync(settingsPath)) {
            return DEFAULT_HUB_PORT
        }
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
            listenPort?: unknown
            webappPort?: unknown
        }
        const filePort = typeof settings.listenPort === 'number'
            ? settings.listenPort
            : (typeof settings.webappPort === 'number' ? settings.webappPort : NaN)
        if (Number.isFinite(filePort) && filePort > 0) {
            return filePort
        }
    } catch {
        return DEFAULT_HUB_PORT
    }

    return DEFAULT_HUB_PORT
}

async function probeHealth(port: number, fetchImpl: FetchLike): Promise<boolean> {
    try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
        })
        return response.ok
    } catch {
        return false
    }
}

function resolveLogPath(logDir: string | undefined): string {
    const directory = logDir ?? join(homedir(), '.hapi', 'logs')
    mkdirSync(directory, { recursive: true })
    return join(directory, 'hub.log')
}

function appendLog(path: string, chunk: Buffer | string): void {
    appendFileSync(path, chunk)
}

function spawnHubChild(
    binary: ResolvedBinary,
    port: number,
    options: {
        env: NodeJS.ProcessEnv
        logPath: string
        spawnImpl: SpawnLike
    }
): ChildProcessByStdio<null, Readable, Readable> {
    const env = {
        ...options.env,
        HAPI_LISTEN_PORT: String(port),
        HAPI_PUBLIC_URL: options.env.HAPI_PUBLIC_URL || `http://localhost:${port}`
    }

    const child = options.spawnImpl(binary.command, [...binary.args, 'hub'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    })

    child.stdout.on('data', (chunk: Buffer) => appendLog(options.logPath, chunk))
    child.stderr.on('data', (chunk: Buffer) => appendLog(options.logPath, chunk))
    child.on('error', (error) => appendLog(options.logPath, `\n[desktop] Failed to spawn hub: ${error.message}\n`))

    return child
}

async function waitForHub(port: number, options: {
    fetchImpl: FetchLike
    timeoutMs: number
    pollIntervalMs: number
}): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < options.timeoutMs) {
        if (await probeHealth(port, options.fetchImpl)) {
            return true
        }
        await new Promise(resolve => setTimeout(resolve, options.pollIntervalMs))
    }
    return false
}

export function readHubLogTail(logPath: string | null = state.logPath): string {
    if (!logPath || !existsSync(logPath)) {
        return ''
    }
    try {
        const data = readFileSync(logPath)
        return data.subarray(Math.max(0, data.length - LOG_TAIL_BYTES)).toString('utf8')
    } catch {
        return ''
    }
}

export async function ensureHubRunning(options: HubManagerOptions = {}): Promise<number> {
    const env = options.env ?? process.env
    const port = resolveHubPort({ env, homeDir: options.homeDir })
    const fetchImpl = options.fetchImpl ?? fetch

    if (await probeHealth(port, fetchImpl)) {
        state.child = null
        state.weStarted = false
        state.logPath = null
        return port
    }

    const logPath = resolveLogPath(options.logDir)
    state.logPath = logPath
    appendLog(logPath, `\n[desktop] Starting HAQI hub on port ${port}\n`)

    const binary = options.resolveBinary
        ? options.resolveBinary()
        : resolveHaqiBinary({
            isPackaged: options.isPackaged,
            resourcesPath: options.resourcesPath,
            cwd: options.cwd,
            env
        })
    appendLog(logPath, `[desktop] Hub binary: ${binary.kind} ${binary.command} ${binary.args.join(' ')}\n`)

    state.child = spawnHubChild(binary, port, {
        env,
        logPath,
        spawnImpl: options.spawnImpl ?? spawn
    })
    state.weStarted = true

    const ready = await waitForHub(port, {
        fetchImpl,
        timeoutMs: options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS,
        pollIntervalMs: options.pollIntervalMs ?? STARTUP_POLL_INTERVAL_MS
    })
    if (!ready) {
        await shutdownIfWeStartedIt()
        throw new Error(`HAQI hub did not become ready on port ${port}.\n\n${readHubLogTail(logPath)}`)
    }

    return port
}

export async function shutdownIfWeStartedIt(): Promise<void> {
    if (!state.weStarted || !state.child) {
        return
    }

    const child = state.child
    state.child = null
    state.weStarted = false

    if (child.exitCode !== null || child.signalCode !== null) {
        return
    }

    const exited = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS)
        child.once('exit', () => {
            clearTimeout(timeout)
            resolve(true)
        })
        child.kill('SIGTERM')
    })

    if (!exited && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
    }
}
