import chalk from 'chalk'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { configuration } from '@/configuration'
import { startWorker } from '@/worker/workerStart'
import { readWorkerConfig, clearWorkerConfig } from '@/worker/workerConfig'
import type { CommandDefinition } from './types'

function parseWorkerStartArgs(args: string[]): { token?: string; hubUrl?: string } {
    let token: string | undefined
    let hubUrl: string | undefined

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--token' && i + 1 < args.length) {
            token = args[++i]
        } else if (args[i] === '--hub-url' && i + 1 < args.length) {
            hubUrl = args[++i]
        }
    }

    return { token, hubUrl }
}

function readWorkerLockPid(): number | null {
    const lockFile = join(configuration.happyHomeDir, 'worker.lock')
    if (!existsSync(lockFile)) return null
    try {
        const raw = readFileSync(lockFile, 'utf-8').trim()
        const pid = Number.parseInt(raw, 10)
        return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
        return null
    }
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function refreshWorker(): Promise<void> {
    const pid = readWorkerLockPid()
    if (pid && isPidAlive(pid)) {
        console.log(chalk.gray(`Stopping current worker (pid ${pid})…`))
        try {
            process.kill(pid, 'SIGTERM')
        } catch (err) {
            console.error(chalk.red(`Failed to signal pid ${pid}: ${err instanceof Error ? err.message : String(err)}`))
        }
        // Wait for it to exit so its worker.lock is released before the hub spawns a replacement
        for (let i = 0; i < 40; i++) {
            if (!isPidAlive(pid)) break
            await new Promise(r => setTimeout(r, 100))
        }
        if (isPidAlive(pid)) {
            console.log(chalk.yellow(`Worker pid ${pid} still alive after 4s — hub will evict it via worker.lock`))
        }
    } else {
        console.log(chalk.gray('No live worker detected from worker.lock — asking hub to spawn one…'))
    }

    if (!configuration.cliApiToken) {
        throw new Error('CLI_API_TOKEN is not configured. Run `hapi auth login` first.')
    }

    const url = `${configuration.apiUrl.replace(/\/$/, '')}/api/cloud/start-local-worker`
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${configuration.cliApiToken}`,
            'content-type': 'application/json',
        },
        body: '{}',
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Hub rejected request (${res.status}): ${text.slice(0, 400)}`)
    }

    const result = await res.json() as {
        started?: boolean
        pid?: number
        alreadyRunning?: boolean
        evictedPid?: number
        startedAt?: number
    }

    const parts: string[] = []
    if (result.pid) parts.push(`pid ${result.pid}`)
    if (result.evictedPid) parts.push(`evicted ${result.evictedPid}`)
    if (result.alreadyRunning) parts.push('already running')
    console.log(chalk.green(`Worker refreshed${parts.length ? ` — ${parts.join(', ')}` : ''}`))
}

export const workerCommand: CommandDefinition = {
    name: 'worker',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'start') {
            const { token, hubUrl } = parseWorkerStartArgs(commandArgs.slice(1))
            await startWorker({ token, hubUrl })
            return
        }

        if (subcommand === 'stop') {
            console.log(chalk.yellow('The worker runs in the foreground.'))
            console.log('To stop the worker, press ' + chalk.cyan('Ctrl+C') + ' in the terminal where it is running,')
            console.log('or send SIGTERM to the worker process.')
            return
        }

        if (subcommand === 'status') {
            const config = await readWorkerConfig()
            if (!config) {
                console.log(chalk.yellow('No worker config found.'))
                console.log('Run ' + chalk.cyan('haqi worker start --token <token> --hub-url <url>') + ' to enroll a worker.')
            } else {
                console.log(chalk.bold('Worker configuration:'))
                console.log(`  Hub URL:    ${chalk.cyan(config.hubUrl)}`)
                console.log(`  Machine ID: ${chalk.cyan(config.machineId)}`)
                console.log(`  Namespace:  ${chalk.cyan(config.namespace)}`)
                console.log(`  Token:      ${chalk.dim('[saved]')}`)
            }
            return
        }

        if (subcommand === 'reset') {
            await clearWorkerConfig()
            console.log(chalk.green('Worker config cleared.'))
            console.log('Run ' + chalk.cyan('haqi worker start --token <token> --hub-url <url>') + ' to re-enroll.')
            return
        }

        if (subcommand === 'refresh') {
            try {
                await refreshWorker()
            } catch (err) {
                console.error(chalk.red('Error:'), err instanceof Error ? err.message : 'Unknown error')
                process.exit(1)
            }
            return
        }

        console.log(`
${chalk.bold('haqi worker')} - Self-hosted worker management

${chalk.bold('Usage:')}
  haqi worker start [--token <enrollment-token>] [--hub-url <url>]
                          Enroll (if needed) and start the worker (foreground)
  haqi worker stop        Show instructions to stop the running worker
  haqi worker status      Display saved worker configuration
  haqi worker reset       Clear saved worker configuration
  haqi worker refresh     Kill the local worker + ask the hub to respawn it
                          (picks up updated CLI source without a full restart)

${chalk.bold('Notes:')}
  - The worker runs in the ${chalk.yellow('foreground')} (not detached).
  - On first run, provide ${chalk.cyan('--token')} and ${chalk.cyan('--hub-url')} to enroll.
  - Subsequent runs reuse the saved config from ${chalk.dim(`${configuration.happyHomeDir}/worker/config.json`)}.
`)
    }
}
