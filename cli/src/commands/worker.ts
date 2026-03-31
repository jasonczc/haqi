import chalk from 'chalk'
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

        console.log(`
${chalk.bold('haqi worker')} - Self-hosted worker management

${chalk.bold('Usage:')}
  haqi worker start [--token <enrollment-token>] [--hub-url <url>]
                          Enroll (if needed) and start the worker (foreground)
  haqi worker stop        Show instructions to stop the running worker
  haqi worker status      Display saved worker configuration
  haqi worker reset       Clear saved worker configuration

${chalk.bold('Notes:')}
  - The worker runs in the ${chalk.yellow('foreground')} (not detached).
  - On first run, provide ${chalk.cyan('--token')} and ${chalk.cyan('--hub-url')} to enroll.
  - Subsequent runs reuse the saved config from ${chalk.dim('~/.haqi-worker/config.json')}.
`)
    }
}
