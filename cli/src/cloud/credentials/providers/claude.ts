import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { ensureContainerDirOwned, runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'

type ClaudePayload = {
    /** Raw JSON string to write verbatim into `.credentials.json`. Preserves
     *  refreshToken + expiresAt so Claude Code can self-refresh the access
     *  token inside the container instead of hitting 401 when it expires. */
    raw: string
    expiresAt?: number
    source: string
}

function readClaudeFromFile(): ClaudePayload | null {
    const credPath = join(homedir(), '.claude', '.credentials.json')
    if (!existsSync(credPath)) return null
    try {
        const raw = readFileSync(credPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (!parsed?.claudeAiOauth?.accessToken) return null
        const expiresAt = typeof parsed.claudeAiOauth.expiresAt === 'number'
            ? parsed.claudeAiOauth.expiresAt
            : undefined
        return { raw, expiresAt, source: credPath }
    } catch {
        return null
    }
}

function readClaudeFromKeychain(): ClaudePayload | null {
    if (process.platform !== 'darwin') return null
    try {
        const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.claudeAiOauth?.accessToken) return null
        const expiresAt = typeof parsed.claudeAiOauth.expiresAt === 'number'
            ? parsed.claudeAiOauth.expiresAt
            : undefined
        return { raw, expiresAt, source: 'macOS Keychain: Claude Code-credentials' }
    } catch {
        return null
    }
}

function readClaudeFromEnv(): ClaudePayload | null {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (!token) return null
    // Env only carries the access token — no refreshToken, no expiresAt. This
    // path does NOT survive token expiry mid-session, but is kept for explicit
    // override / CI scenarios where file/keychain isn't available.
    const raw = JSON.stringify({ claudeAiOauth: { accessToken: token } })
    return { raw, source: 'env: CLAUDE_CODE_OAUTH_TOKEN' }
}

function readClaudePayload(): ClaudePayload | null {
    // Prefer file / keychain over env: the first two preserve refreshToken +
    // expiresAt (Claude Code can self-refresh inside the container); env-only
    // loses them and causes 401 once the access token expires.
    return readClaudeFromFile() ?? readClaudeFromKeychain() ?? readClaudeFromEnv()
}

export const claudeProvider: CredentialProvider = {
    kind: 'claude',

    async status(): Promise<CredentialStatus> {
        const payload = readClaudePayload()
        if (!payload) {
            return { kind: 'claude', present: false, sources: [] }
        }
        return {
            kind: 'claude',
            present: true,
            sources: [payload.source],
            expiresAt: payload.expiresAt,
            note: payload.expiresAt === undefined
                ? 'No refresh metadata — will fail on token expiry.'
                : undefined,
        }
    },

    async inject(target: ContainerTarget): Promise<void> {
        const payload = readClaudePayload()
        if (!payload) return

        const homeTargets = getContainerHomeTargets(target.user)

        // Write the full credentials.json verbatim. Unlike the previous
        // implementation this preserves refreshToken + expiresAt, so Claude
        // Code can transparently refresh the access token when it expires.
        for (const ht of homeTargets) {
            try {
                await ensureContainerDirOwned(target.containerId, `${ht.home}/.claude`, ht.owner)
                await runDockerExec(target.containerId, [
                    'sh', '-c',
                    `cat > ${ht.home}/.claude/.credentials.json <<'HAQI_CRED_EOF'\n${payload.raw}\nHAQI_CRED_EOF\nchmod 600 ${ht.home}/.claude/.credentials.json\nchown ${ht.owner} ${ht.home}/.claude/.credentials.json`,
                ], { user: 'root' })
            } catch (err) {
                logger.debug('[host-creds] Failed to inject Claude credentials:', err)
            }
        }
        logger.debug('[host-creds] Injected Claude credentials into container')

        // settings.json (model preferences, NOT credentials) — separate file,
        // best-effort copy.
        const settingsPath = join(homedir(), '.claude', 'settings.json')
        if (existsSync(settingsPath)) {
            for (const ht of homeTargets) {
                try {
                    await ensureContainerDirOwned(target.containerId, `${ht.home}/.claude`, ht.owner)
                    await runDockerCommand(['cp', settingsPath, `${target.containerId}:${ht.home}/.claude/settings.json`])
                    await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.claude/settings.json`], { user: 'root' }).catch(() => undefined)
                } catch { /* ignore */ }
            }
        }
    },
}
