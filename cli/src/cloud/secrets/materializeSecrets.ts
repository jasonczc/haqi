import fs from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ResolvedSecret } from '@hapi/protocol/types'

export type MaterializedSecrets = {
    env: Record<string, string>
    cleanupPaths: string[]
}

function defaultEnvName(secretName: string): string {
    const normalized = secretName
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase()
    return normalized || 'HAPI_SECRET'
}

function resolveRelativeSecretPath(rootDir: string, filePath: string | undefined, secretName: string): string {
    if (!filePath) {
        return resolve(rootDir, `${secretName}.secret`)
    }
    const relative = filePath.replace(/^\/+/, '')
    return resolve(rootDir, relative)
}

async function writeSecretFile(filePath: string, value: string): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, value, { mode: 0o600 })
}

export async function materializeResolvedSecrets(options: {
    secrets: ResolvedSecret[]
    workspacePath: string
    requestId: string
}): Promise<MaterializedSecrets> {
    if (options.secrets.length === 0) {
        return {
            env: {},
            cleanupPaths: []
        }
    }

    const rootDir = join(options.workspacePath, '.haqi-cloud-secrets', options.requestId)
    await fs.mkdir(rootDir, { recursive: true })

    const env: Record<string, string> = {}
    const cleanupPaths = [rootDir]

    for (const secret of options.secrets) {
        const mountAs = secret.mountAs ?? 'env'

        if (secret.adapter === 'claude') {
            env.CLAUDE_CODE_OAUTH_TOKEN = secret.value
            continue
        }

        if (secret.adapter === 'gemini' && mountAs === 'env') {
            env[secret.envName || 'GEMINI_API_KEY'] = secret.value
            continue
        }

        if (secret.adapter === 'codex') {
            const codexHome = join(rootDir, 'codex', secret.secretName)
            await fs.mkdir(codexHome, { recursive: true })
            await fs.writeFile(join(codexHome, 'auth.json'), secret.value, { mode: 0o600 })
            env.CODEX_HOME = codexHome
            continue
        }

        if (mountAs === 'file') {
            const filePath = resolveRelativeSecretPath(rootDir, secret.filePath, secret.secretName)
            await writeSecretFile(filePath, secret.value)
            if (secret.envName) {
                env[secret.envName] = filePath
            }
            continue
        }

        env[secret.envName || defaultEnvName(secret.secretName)] = secret.value
    }

    return {
        env,
        cleanupPaths
    }
}

export function applyRepositoryCredential(repositoryUrl: string, secret: ResolvedSecret | undefined): string {
    if (!secret) {
        return repositoryUrl
    }

    try {
        const url = new URL(repositoryUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return repositoryUrl
        }

        if (secret.value.includes(':')) {
            const [username, ...passwordParts] = secret.value.split(':')
            url.username = username || 'oauth2'
            url.password = passwordParts.join(':')
            return url.toString()
        }

        url.username = secret.envName || 'oauth2'
        url.password = secret.value
        return url.toString()
    } catch {
        return repositoryUrl
    }
}
