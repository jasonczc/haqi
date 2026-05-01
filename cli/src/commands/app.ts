import chalk from 'chalk'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { resolve } from 'node:path'
import type { CommandDefinition } from './types'

const RELEASE_URL = 'https://github.com/jasonczc/haqi/releases'

type OpenResult = {
    success: boolean
    error?: string
}

export function buildDesktopAppUrl(pathArg: string | undefined, cwd: string = process.cwd()): string {
    const workspacePath = resolve(cwd, pathArg ?? '.')
    const params = new URLSearchParams({ folder: workspacePath })
    return `haqi://code/new?${params.toString()}`
}

function resultToOpenResult(result: SpawnSyncReturns<Buffer>): OpenResult {
    if (result.error) {
        return {
            success: false,
            error: result.error.message
        }
    }
    if (result.status && result.status !== 0) {
        const stderr = result.stderr?.toString('utf8').trim()
        return {
            success: false,
            error: stderr || `launcher exited with status ${result.status}`
        }
    }
    return { success: true }
}

export function openDesktopUrl(
    url: string,
    platform: NodeJS.Platform = process.platform,
    spawn: typeof spawnSync = spawnSync
): OpenResult {
    if (platform === 'darwin') {
        return resultToOpenResult(spawn('open', [url], { stdio: 'pipe' }))
    }

    if (platform === 'win32') {
        return resultToOpenResult(spawn('cmd', ['/c', 'start', '', url], {
            stdio: 'pipe',
            windowsHide: true
        }))
    }

    return {
        success: false,
        error: 'HAQI Desktop packaging is currently supported on macOS and Windows.'
    }
}

export const appCommand: CommandDefinition = {
    name: 'app',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const showHelp = commandArgs.includes('-h') || commandArgs.includes('--help')
        if (showHelp) {
            console.log(`
${chalk.bold('haqi app')} - Open HAQI Desktop

${chalk.bold('Usage:')}
  haqi app [path]

${chalk.bold('Examples:')}
  haqi app
  haqi app ~/workspace/project
`)
            return
        }

        const pathArg = commandArgs.find((arg) => !arg.startsWith('-'))
        const url = buildDesktopAppUrl(pathArg)
        const result = openDesktopUrl(url)

        if (!result.success) {
            console.error(chalk.red('Unable to open HAQI Desktop.'))
            if (result.error) {
                console.error(chalk.gray(`  ${result.error}`))
            }
            console.error(chalk.gray(`  Install HAQI Desktop from: ${RELEASE_URL}`))
            process.exit(1)
        }
    }
}
