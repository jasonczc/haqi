import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { DEFAULT_CONTAINER_HOME } from '@/cloud/containerUser'
import { ALL_PROVIDERS, getProvider } from './providers'
import { findGitHubToken } from './providers/shared'
import type { CredentialKind, CredentialStatus } from './types'

export type { CredentialKind, CredentialStatus } from './types'
export { CREDENTIAL_KINDS } from './types'

export type HostCredentialBundle = {
    env: Record<string, string>
    fileMounts: Array<{
        hostPath: string
        containerPath: string
        mode: 'ro' | 'rw'
    }>
}

/**
 * Collect host environment variables + file mounts that should flow into a
 * session's process environment. Separate plane from filesystem credential
 * injection (which is handled by the CredentialProvider set below).
 */
export function collectHostCredentials(): HostCredentialBundle {
    const env: Record<string, string> = {}
    const fileMounts: HostCredentialBundle['fileMounts'] = []

    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
        env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN
        logger.debug('[host-creds] Found Claude OAuth token')
    }
    if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

    // Codex file mounts (read-only) in addition to the FS-inject path handled
    // by codexProvider — keeps the pre-existing executor/daemon behavior.
    const codexAuth = join(homedir(), '.codex', 'auth.json')
    if (existsSync(codexAuth)) {
        fileMounts.push({
            hostPath: codexAuth,
            containerPath: `${DEFAULT_CONTAINER_HOME}/.codex/auth.json`,
            mode: 'ro',
        })
        logger.debug('[host-creds] Mounting Codex auth.json')
    }
    const codexConfig = join(homedir(), '.codex', 'config.toml')
    if (existsSync(codexConfig)) {
        fileMounts.push({
            hostPath: codexConfig,
            containerPath: `${DEFAULT_CONTAINER_HOME}/.codex/config.toml`,
            mode: 'ro',
        })
    }

    if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY

    const ghToken = findGitHubToken()
    if (ghToken) {
        env.GITHUB_TOKEN = ghToken
        logger.debug('[host-creds] Found GitHub token')
    }

    if (process.env.GEMINI_API_KEY) env.GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (process.env.GOOGLE_API_KEY) env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

    const passthrough = [
        'ANTHROPIC_AUTH_TOKEN',
        'CLAUDE_API_KEY',
        'MISTRAL_API_KEY',
        'OPENROUTER_API_KEY',
        'GROQ_API_KEY',
        'TOGETHER_API_KEY',
        'FIREWORKS_API_KEY',
        'HUGGINGFACE_TOKEN',
        'REPLICATE_API_TOKEN',
        'NPM_TOKEN',
    ]
    for (const key of passthrough) {
        if (process.env[key]) env[key] = process.env[key]
    }

    return { env, fileMounts }
}

/**
 * Inject all available host credentials into a running container's filesystem.
 * Writes to the container's overlay layer (not mounts), so a subsequent
 * `docker commit` captures them in the image. Called after container creation
 * and before the agent starts. Each provider is best-effort; failures are
 * logged and skipped so one broken source doesn't block the others.
 */
export async function injectHostCredentialsIntoContainer(
    containerId: string,
    user?: string,
): Promise<void> {
    for (const provider of ALL_PROVIDERS) {
        try {
            await provider.inject({ containerId, user })
        } catch (err) {
            logger.debug(`[host-creds] ${provider.kind} injection failed:`, err)
        }
    }
}

/**
 * Re-inject a specific subset of credentials. Used by the re-push flow (L2) so
 * a running session can pick up rotated tokens or refreshed Claude credentials
 * without tearing down the container.
 */
export async function injectHostCredentialByKind(
    containerId: string,
    kind: CredentialKind,
    user?: string,
): Promise<void> {
    const provider = getProvider(kind)
    if (!provider) {
        throw new Error(`Unknown credential kind: ${kind}`)
    }
    await provider.inject({ containerId, user })
}

/**
 * Report what host credentials are currently available and (where known) when
 * they expire. Powers the web Credentials panel + `haqi creds status`.
 */
export async function getHostCredentialStatuses(): Promise<CredentialStatus[]> {
    return Promise.all(ALL_PROVIDERS.map(p => p.status()))
}
