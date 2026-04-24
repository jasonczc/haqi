import chalk from 'chalk'
import { configuration } from '@/configuration'
import {
    CREDENTIAL_KINDS,
    getHostCredentialStatuses,
    type CredentialKind,
} from '@/cloud/credentials/hostCredentials'
import type { CommandDefinition } from './types'

function parseKinds(raw: string | undefined): CredentialKind[] | null {
    if (!raw) return null
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    const valid: CredentialKind[] = []
    for (const part of parts) {
        if ((CREDENTIAL_KINDS as readonly string[]).includes(part)) {
            valid.push(part as CredentialKind)
        } else {
            throw new Error(`Unknown credential kind: ${part}. Valid: ${CREDENTIAL_KINDS.join(', ')}`)
        }
    }
    return valid.length > 0 ? valid : null
}

function formatExpiresAt(expiresAt: number | undefined): string {
    if (expiresAt === undefined) return chalk.gray('no expiry info')
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) return chalk.red(`expired ${new Date(expiresAt).toISOString()}`)
    const hours = remaining / 3_600_000
    if (hours < 1) return chalk.yellow(`expires in ${Math.round(remaining / 60_000)}m`)
    if (hours < 24) return chalk.yellow(`expires in ${hours.toFixed(1)}h`)
    return chalk.green(`expires in ${(hours / 24).toFixed(1)}d`)
}

async function runStatus(): Promise<void> {
    const statuses = await getHostCredentialStatuses()
    console.log(chalk.bold('\nHost credentials on this machine\n'))
    for (const s of statuses) {
        const tag = s.present ? chalk.green('●') : chalk.gray('○')
        console.log(`  ${tag} ${chalk.bold(s.kind.padEnd(10))} ${s.present ? formatExpiresAt(s.expiresAt) : chalk.gray('not found')}`)
        for (const src of s.sources) {
            console.log(chalk.gray(`      ← ${src}`))
        }
        if (s.note) {
            console.log(chalk.yellow(`      ! ${s.note}`))
        }
    }
    console.log()
}

async function runPush(args: string[]): Promise<void> {
    let sessionId: string | undefined
    let kindsArg: string | undefined
    for (let i = 0; i < args.length; i++) {
        const a = args[i]
        if (a === '--session' || a === '-s') {
            sessionId = args[++i]
        } else if (a === '--kind' || a === '-k') {
            kindsArg = args[++i]
        } else if (!sessionId && !a.startsWith('-')) {
            sessionId = a
        }
    }

    if (!sessionId) {
        throw new Error('Missing --session <id>')
    }

    const kinds = parseKinds(kindsArg)

    if (!configuration.cliApiToken) {
        throw new Error('CLI_API_TOKEN is not configured. Run `hapi auth login` first.')
    }

    const url = `${configuration.apiUrl.replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sessionId)}/host-credentials/reinject`
    const body = kinds ? { kinds } : {}

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${configuration.cliApiToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Hub rejected request (${res.status}): ${text.slice(0, 400)}`)
    }

    const result = await res.json() as { injected: string[]; failed: Array<{ kind: string; error: string }> }
    console.log(chalk.bold(`\nReinjected into session ${sessionId}:\n`))
    for (const k of result.injected) {
        console.log(`  ${chalk.green('✓')} ${k}`)
    }
    for (const f of result.failed) {
        console.log(`  ${chalk.red('✗')} ${f.kind} — ${f.error}`)
    }
    console.log()
}

function showHelp(): void {
    console.log(`
${chalk.bold('hapi creds')} - Host credential management

${chalk.bold('Usage:')}
  hapi creds status                              Show credentials available on this machine
  hapi creds push --session <id> [--kind list]  Push host credentials into a running session's container

${chalk.bold('Valid kinds:')}
  ${CREDENTIAL_KINDS.join(', ')}

${chalk.bold('Examples:')}
  hapi creds status
  hapi creds push --session abc123
  hapi creds push -s abc123 -k claude,gitcreds
`)
}

export async function handleCredsCommand(args: string[]): Promise<void> {
    const subcommand = args[0]

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showHelp()
        return
    }

    if (subcommand === 'status') {
        await runStatus()
        return
    }

    if (subcommand === 'push') {
        await runPush(args.slice(1))
        return
    }

    console.error(chalk.red(`Unknown creds subcommand: ${subcommand}`))
    showHelp()
    process.exit(1)
}

export const credsCommand: CommandDefinition = {
    name: 'creds',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            await handleCredsCommand(commandArgs)
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    },
}
