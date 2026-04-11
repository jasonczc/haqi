import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'

export type HostCredentialBundle = {
    env: Record<string, string>
    fileMounts: Array<{
        hostPath: string
        containerPath: string
        mode: 'ro' | 'rw'
    }>
}

/**
 * Collect credentials from the host that should be passed to a container session.
 * This is a best-effort scan — missing credentials are silently skipped.
 *
 * Sources checked (in order of precedence, first match wins per credential):
 *   1. Process environment variables
 *   2. Credential files in ~/.claude, ~/.codex, ~/.config
 *   3. macOS Keychain entries
 */
export function collectHostCredentials(): HostCredentialBundle {
    const env: Record<string, string> = {}
    const fileMounts: HostCredentialBundle['fileMounts'] = []

    // ── Claude Code OAuth token ──────────────────────────────────────
    const claudeToken = findClaudeOAuthToken()
    if (claudeToken) {
        env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken
        logger.debug('[host-creds] Found Claude OAuth token')
    }
    if (process.env.ANTHROPIC_API_KEY) {
        env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    }

    // ── Codex auth ──────────────────────────────────────────────────
    // Codex uses a JSON file. Two options: inject as env OR mount the file.
    // Mounting is more complete (preserves refresh tokens etc), but adds a
    // volume. We mount it read-only.
    const codexAuthPath = join(homedir(), '.codex', 'auth.json')
    if (existsSync(codexAuthPath)) {
        fileMounts.push({
            hostPath: codexAuthPath,
            containerPath: '/root/.codex/auth.json',
            mode: 'ro',
        })
        logger.debug('[host-creds] Mounting Codex auth.json')
    }
    // Codex config (model preferences etc)
    const codexConfigPath = join(homedir(), '.codex', 'config.toml')
    if (existsSync(codexConfigPath)) {
        fileMounts.push({
            hostPath: codexConfigPath,
            containerPath: '/root/.codex/config.toml',
            mode: 'ro',
        })
    }

    // OpenAI API key (Codex alternate auth)
    if (process.env.OPENAI_API_KEY) {
        env.OPENAI_API_KEY = process.env.OPENAI_API_KEY
    }

    // ── GitHub token ────────────────────────────────────────────────
    const ghToken = findGitHubToken()
    if (ghToken) {
        env.GITHUB_TOKEN = ghToken
        logger.debug('[host-creds] Found GitHub token')
    }

    // ── Gemini ──────────────────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) env.GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (process.env.GOOGLE_API_KEY) env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

    // ── Other common AI/dev tokens (passthrough if set) ─────────────
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

function findClaudeOAuthToken(): string | undefined {
    // 1. Environment override
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN

    // 2. Credentials file (Linux/Windows)
    try {
        const credPath = join(homedir(), '.claude', '.credentials.json')
        if (existsSync(credPath)) {
            const raw = readFileSync(credPath, 'utf-8')
            const parsed = JSON.parse(raw)
            const token = parsed?.claudeAiOauth?.accessToken
            if (typeof token === 'string') return token
        }
    } catch { /* ignore */ }

    // 3. macOS Keychain
    if (process.platform === 'darwin') {
        try {
            const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim()
            if (raw) {
                const parsed = JSON.parse(raw)
                const token = parsed?.claudeAiOauth?.accessToken
                if (typeof token === 'string') return token
            }
        } catch { /* ignore */ }
    }

    return undefined
}

/**
 * Inject host credentials into a running container's filesystem.
 * This writes files to the container's overlay layer (not mounts),
 * so a subsequent `docker commit` will capture them in the image.
 *
 * Called after container creation and before the agent starts.
 */
export async function injectHostCredentialsIntoContainer(containerId: string): Promise<void> {
    // Claude Code credentials
    const claudeToken = findClaudeOAuthToken()
    if (claudeToken) {
        try {
            const credJson = JSON.stringify({
                claudeAiOauth: { accessToken: claudeToken }
            })
            await runDockerCommand(['exec', containerId, 'mkdir', '-p', '/root/.claude'])
            await runDockerCommand([
                'exec', containerId, 'sh', '-c',
                `cat > /root/.claude/.credentials.json <<'HAQI_CRED_EOF'\n${credJson}\nHAQI_CRED_EOF\nchmod 600 /root/.claude/.credentials.json`
            ])
            logger.debug('[host-creds] Injected Claude credentials into container')
        } catch (err) {
            logger.debug('[host-creds] Failed to inject Claude credentials:', err)
        }
    }

    // Codex auth.json (full file copy)
    const codexAuth = join(homedir(), '.codex', 'auth.json')
    if (existsSync(codexAuth)) {
        try {
            await runDockerCommand(['exec', containerId, 'mkdir', '-p', '/root/.codex'])
            // Use docker cp to copy the file into the container layer
            await runDockerCommand(['cp', codexAuth, `${containerId}:/root/.codex/auth.json`])
            await runDockerCommand(['exec', containerId, 'chmod', '600', '/root/.codex/auth.json'])
            logger.debug('[host-creds] Injected Codex auth into container')
        } catch (err) {
            logger.debug('[host-creds] Failed to inject Codex auth:', err)
        }
    }

    // Codex config.toml (model preferences)
    const codexConfig = join(homedir(), '.codex', 'config.toml')
    if (existsSync(codexConfig)) {
        try {
            await runDockerCommand(['cp', codexConfig, `${containerId}:/root/.codex/config.toml`])
        } catch { /* ignore */ }
    }

    // Claude settings.json (model preferences, NOT credentials)
    const claudeSettings = join(homedir(), '.claude', 'settings.json')
    if (existsSync(claudeSettings)) {
        try {
            await runDockerCommand(['cp', claudeSettings, `${containerId}:/root/.claude/settings.json`])
        } catch { /* ignore */ }
    }
}

function findGitHubToken(): string | undefined {
    // 1. Environment
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN

    // 2. gh CLI hosts.yml (YAML, contains oauth_token)
    try {
        const hostsPath = join(homedir(), '.config', 'gh', 'hosts.yml')
        if (existsSync(hostsPath)) {
            const raw = readFileSync(hostsPath, 'utf-8')
            // Simple YAML parse: look for "oauth_token: xxx"
            const match = raw.match(/oauth_token:\s*(\S+)/)
            if (match?.[1]) return match[1]
        }
    } catch { /* ignore */ }

    // 3. macOS Keychain (gh CLI stores here on some setups)
    if (process.platform === 'darwin') {
        try {
            const raw = execSync('security find-internet-password -s "github.com" -a "gh" -w', {
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim()
            if (raw && raw.startsWith('gho_')) return raw
        } catch { /* ignore */ }
    }

    return undefined
}
