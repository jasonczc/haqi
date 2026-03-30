import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { EnvironmentTemplate } from '@hapi/protocol/types'

const execFileAsync = promisify(execFile)

export function normalizeEnvironmentCommands(
    commands: EnvironmentTemplate['install'] | EnvironmentTemplate['start']
): string[] {
    if (!commands) {
        return []
    }

    const list = Array.isArray(commands) ? commands : [commands]
    return list.map((command) => command.trim()).filter((command) => command.length > 0)
}

function quoteShellArg(value: string): string {
    if (value.length === 0) {
        return "''"
    }
    return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildShellCommand(args: string[]): string {
    return args.map((arg) => quoteShellArg(arg)).join(' ')
}

export function buildBootstrapScript(params: {
    commands: Array<string | string[] | undefined>
    agentCommand: string[]
}): string {
    const lines: string[] = [
        'set -eu'
    ]

    for (const command of params.commands) {
        for (const normalized of normalizeEnvironmentCommands(command as EnvironmentTemplate['install'] | EnvironmentTemplate['start'])) {
            lines.push(normalized)
        }
    }

    lines.push(`exec ${buildShellCommand(params.agentCommand)}`)
    return lines.join('\n')
}

export async function runEnvironmentCommands(params: {
    commands: EnvironmentTemplate['install'] | EnvironmentTemplate['start']
    cwd: string
    env?: NodeJS.ProcessEnv
    label: string
}): Promise<void> {
    for (const command of normalizeEnvironmentCommands(params.commands)) {
        await execFileAsync('sh', ['-lc', command], {
            cwd: params.cwd,
            env: {
                ...process.env,
                ...(params.env ?? {})
            }
        }).catch((error) => {
            const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
            const stderr = execError.stderr?.trim() ?? ''
            const stdout = execError.stdout?.trim() ?? ''
            const detail = stderr || stdout || execError.message || 'environment command failed'
            throw new Error(`${params.label} command failed: ${detail}`)
        })
    }
}
