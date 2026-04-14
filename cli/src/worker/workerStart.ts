import chalk from 'chalk'
import os from 'node:os'
import { readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { io } from 'socket.io-client'
import { logger } from '@/ui/logger'
import { isWindows } from '@/utils/process'
import { readWorkerConfig, writeWorkerConfig } from './workerConfig'
import { detectWorkerCapabilities } from './detectCapabilities'
import { runRunnerLoop } from '@/runner/runnerLoop'

const ENROLLMENT_TIMEOUT_MS = 30_000

export type WorkerStartOptions = {
    token?: string
    hubUrl?: string
}

export async function startWorker(options: WorkerStartOptions): Promise<void> {
    // 1. Read existing config
    let config = await readWorkerConfig()

    // 2. Determine if enrollment is needed
    // Re-enroll if: no session token, OR a new --token was provided, OR --hub-url differs from saved config
    const hubUrlChanged = options.hubUrl && config?.hubUrl && options.hubUrl !== config.hubUrl
    const hasNewToken = !!options.token
    const needsEnrollment = !config?.workerSessionToken || hasNewToken || hubUrlChanged

    if (needsEnrollment) {
        const enrollmentToken = options.token
        const hubUrl = options.hubUrl ?? config?.hubUrl

        if (!enrollmentToken || !hubUrl) {
            console.error(chalk.red('Error: No worker session found.'))
            console.error(chalk.yellow('Provide --token and --hub-url to enroll this worker.'))
            console.error('')
            console.error('Example:')
            console.error(chalk.cyan('  haqi worker start --token <enrollment-token> --hub-url https://your-hub.example.com'))
            process.exit(1)
        }

        // 3. Enroll via Socket.IO
        console.log(chalk.blue('Enrolling worker with hub...'))
        logger.debug('[WORKER START] Starting enrollment handshake', { hubUrl })

        const enrolledConfig = await new Promise<{ workerSessionToken: string; legacyAccessToken?: string; machineId: string; namespace: string }>((resolve, reject) => {
            const socket = io(`${hubUrl}/cli`, {
                transports: ['websocket'],
                auth: { token: enrollmentToken },
                path: '/socket.io/',
                reconnection: false
            })

            const timeout = setTimeout(() => {
                socket.disconnect()
                reject(new Error('Enrollment timed out after 30 seconds'))
            }, ENROLLMENT_TIMEOUT_MS)

            socket.on('connect', () => {
                logger.debug('[WORKER START] Connected to hub for enrollment')
            })

            socket.on('worker-enrolled', (data: { workerSessionToken: string; legacyAccessToken?: string; machineId?: string; namespace: string }) => {
                clearTimeout(timeout)
                logger.debug('[WORKER START] Received worker-enrolled event', { machineId: data.machineId, namespace: data.namespace })
                socket.disconnect()
                resolve({
                    workerSessionToken: data.workerSessionToken,
                    legacyAccessToken: data.legacyAccessToken,
                    machineId: data.machineId || `worker-${os.hostname()}-${Date.now().toString(36)}`,
                    namespace: data.namespace
                })
            })

            socket.on('connect_error', (error) => {
                clearTimeout(timeout)
                socket.disconnect()
                reject(new Error(`Failed to connect to hub: ${error.message}`))
            })

            socket.on('error', (payload: { message: string }) => {
                clearTimeout(timeout)
                socket.disconnect()
                reject(new Error(`Hub error during enrollment: ${payload.message}`))
            })
        })

        // Save config
        const newConfig = {
            hubUrl,
            workerSessionToken: enrolledConfig.workerSessionToken,
            legacyAccessToken: enrolledConfig.legacyAccessToken,
            machineId: enrolledConfig.machineId,
            namespace: enrolledConfig.namespace
        }
        await writeWorkerConfig(newConfig)
        config = newConfig

        console.log(chalk.green('Worker enrolled successfully!'))
        logger.debug('[WORKER START] Enrollment complete, config saved')
    } else {
        logger.debug('[WORKER START] Using existing worker config', { machineId: config?.machineId })
        console.log(chalk.blue(`Starting worker (machineId: ${config!.machineId})...`))
    }

    // At this point config is guaranteed to exist
    const workerConfig = config!

    // 4. Set up shutdown handlers
    let requestShutdown!: (source: 'hapi-app' | 'hapi-cli' | 'os-signal' | 'exception', errorMessage?: string) => void
    const onShutdownRequested = new Promise<{ source: 'hapi-app' | 'hapi-cli' | 'os-signal' | 'exception'; errorMessage?: string }>((resolve) => {
        requestShutdown = (source, errorMessage) => {
            logger.debug(`[WORKER START] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`)

            setTimeout(async () => {
                logger.debug('[WORKER START] Startup malfunctioned, forcing exit with code 1')
                await new Promise(res => setTimeout(res, 100))
                process.exit(1)
            }, 1_000)

            resolve({ source, errorMessage })
        }
    })

    process.on('SIGINT', () => {
        logger.debug('[WORKER START] Received SIGINT')
        requestShutdown('os-signal')
    })

    process.on('SIGTERM', () => {
        logger.debug('[WORKER START] Received SIGTERM')
        requestShutdown('os-signal')
    })

    if (isWindows()) {
        process.on('SIGBREAK', () => {
            logger.debug('[WORKER START] Received SIGBREAK')
            requestShutdown('os-signal')
        })
    }

    process.on('uncaughtException', (error) => {
        logger.debug('[WORKER START] FATAL: Uncaught exception', error)
        requestShutdown('exception', error.message)
    })

    process.on('unhandledRejection', (reason) => {
        logger.debug('[WORKER START] FATAL: Unhandled promise rejection', reason)
        const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`)
        requestShutdown('exception', error.message)
    })

    // 5. Acquire worker lock (separate from runner lock — they can coexist)
    const workerLockFile = join(os.homedir(), '.hapi', 'worker.lock')
    const lockHandle = await acquireWorkerLock(workerLockFile)
    if (!lockHandle) {
        console.error(chalk.red('Another worker is already running'))
        process.exit(1)
    }

    // 6. Detect capabilities
    logger.debug('[WORKER START] Detecting capabilities...')
    const capabilities = await detectWorkerCapabilities()
    logger.debug('[WORKER START] Capabilities detected', capabilities)

    console.log(chalk.green('Worker starting...'))

    try {
        await runRunnerLoop({
            mode: 'remote',
            machineId: workerConfig.machineId,
            getAuthToken: () => workerConfig.workerSessionToken,
            getChildAuthToken: () => workerConfig.legacyAccessToken ?? workerConfig.workerSessionToken,
            getApiUrl: () => workerConfig.hubUrl,
            metadata: {
                executorType: 'cloud-self-hosted',
                provider: 'manual',
                capabilities,
                resources: capabilities.resources
            },
            onShutdownRequested,
            requestShutdown,
            runnerLockHandle: lockHandle
        })
    } catch (error) {
        logger.debug('[WORKER START][FATAL] Failed unexpectedly - exiting with code 1', error)
        process.exit(1)
    }
}

function isProcessAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true } catch { return false }
}

async function acquireWorkerLock(lockFile: string, maxAttempts = 5): Promise<import('node:fs/promises').FileHandle | null> {
    const { open: openAsync } = await import('node:fs/promises')
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const fh = await openAsync(lockFile, 'wx')
            await fh.writeFile(String(process.pid))
            return fh
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                try {
                    const lockPid = readFileSync(lockFile, 'utf-8').trim()
                    if (lockPid && !isNaN(Number(lockPid)) && !isProcessAlive(Number(lockPid))) {
                        unlinkSync(lockFile)
                        continue
                    }
                } catch { /* corrupted lock */ }
            }
            if (attempt === maxAttempts) return null
            await new Promise(r => setTimeout(r, attempt * 200))
        }
    }
    return null
}
