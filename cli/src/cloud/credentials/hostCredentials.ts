import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
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

    // ── Git identity + credentials ──────────────────────────────────
    // Copy the user's .gitconfig (name/email/aliases) so `git commit` inside
    // the container carries their identity. Host-specific helpers like
    // osxkeychain silently no-op in Linux; we override them below with a
    // store-based helper + a synthesized .git-credentials file when a token
    // is available.
    await injectGitConfig(containerId)
    await injectGitCredentials(containerId)
    await injectGhCli(containerId)
    await injectSshCredentials(containerId)
}

async function injectGitConfig(containerId: string): Promise<void> {
    const gitconfig = join(homedir(), '.gitconfig')
    if (!existsSync(gitconfig)) return
    try {
        await runDockerCommand(['cp', gitconfig, `${containerId}:/root/.gitconfig`])
        // Override credential.helper to "store" so the container reads from
        // /root/.git-credentials instead of trying to invoke the host's
        // credential helper binary (which doesn't exist in the container).
        await runDockerCommand([
            'exec', containerId, 'sh', '-c',
            'git config --global --unset-all credential.helper 2>/dev/null; git config --global credential.helper store'
        ]).catch(() => undefined)
        logger.debug('[host-creds] Injected .gitconfig')
    } catch (err) {
        logger.debug('[host-creds] Failed to inject .gitconfig:', err)
    }
}

async function injectGitCredentials(containerId: string): Promise<void> {
    // Prefer the host's .git-credentials file if present — it already has
    // whatever provider/token the user set up. Otherwise synthesize one from
    // the discovered GitHub token so HTTPS pushes/pulls work out of the box.
    const hostGitCreds = join(homedir(), '.git-credentials')
    try {
        if (existsSync(hostGitCreds)) {
            await runDockerCommand(['cp', hostGitCreds, `${containerId}:/root/.git-credentials`])
            await runDockerCommand(['exec', containerId, 'chmod', '600', '/root/.git-credentials'])
            logger.debug('[host-creds] Injected .git-credentials')
            return
        }
    } catch (err) {
        logger.debug('[host-creds] Failed to copy .git-credentials:', err)
    }

    const ghToken = findGitHubToken()
    if (!ghToken) return
    try {
        // x-access-token is GitHub's documented username for token-based
        // HTTPS auth. Works for classic PATs, fine-grained PATs, and gh OAuth.
        const line = `https://x-access-token:${ghToken}@github.com`
        await runDockerCommand([
            'exec', containerId, 'sh', '-c',
            `cat > /root/.git-credentials <<'HAQI_GIT_EOF'\n${line}\nHAQI_GIT_EOF\nchmod 600 /root/.git-credentials`
        ])
        logger.debug('[host-creds] Synthesized .git-credentials from GitHub token')
    } catch (err) {
        logger.debug('[host-creds] Failed to synthesize .git-credentials:', err)
    }
}

async function injectGhCli(containerId: string): Promise<void> {
    // gh CLI reads auth from ~/.config/gh/hosts.yml. Copy the whole gh
    // directory so `gh auth status`, `gh pr`, `gh issue` all work seamlessly.
    // Modern gh stores the oauth token in the OS keychain instead of
    // hosts.yml, so we append oauth_token ourselves when it's missing —
    // otherwise the container's gh binary can't authenticate without
    // access to the host keychain.
    const ghDir = join(homedir(), '.config', 'gh')
    if (!existsSync(ghDir)) return
    try {
        await runDockerCommand(['exec', containerId, 'mkdir', '-p', '/root/.config'])
        // `docker cp` copies directories recursively by default; there is no
        // `-r` flag (passing one fails with "unknown shorthand flag").
        await runDockerCommand(['cp', ghDir, `${containerId}:/root/.config/gh`])
        await runDockerCommand(['exec', containerId, 'chmod', '-R', 'go-rwx', '/root/.config/gh']).catch(() => undefined)

        const ghToken = findGitHubToken()
        if (ghToken) {
            // Append `oauth_token: …` under the first `github.com:` section
            // when it isn't already present. sed is universally available in
            // the base image; python/yq might not be.
            const sedProgram = `
if [ -f /root/.config/gh/hosts.yml ] && ! grep -q oauth_token /root/.config/gh/hosts.yml; then
  sed -i '/^github\\.com:/a\\    oauth_token: ${ghToken}' /root/.config/gh/hosts.yml
fi
`.trim()
            await runDockerCommand(['exec', containerId, 'sh', '-c', sedProgram]).catch(() => undefined)
        }
        logger.debug('[host-creds] Injected gh CLI config')
    } catch (err) {
        logger.debug('[host-creds] Failed to inject gh CLI config:', err instanceof Error ? err.message : String(err))
    }
}

async function injectSshCredentials(containerId: string): Promise<void> {
    // SSH keys are sensitive. They're baked into the checkpoint image if the
    // user saves one — same risk class as the OAuth tokens we already inject,
    // so the security model is consistent. Copy only the files that are
    // commonly needed (known_hosts, config, id_{ed25519,rsa,ecdsa} pairs).
    const sshDir = join(homedir(), '.ssh')
    if (!existsSync(sshDir)) return

    const candidates = [
        'known_hosts',
        'config',
        'id_ed25519', 'id_ed25519.pub',
        'id_rsa', 'id_rsa.pub',
        'id_ecdsa', 'id_ecdsa.pub',
    ]
    const presentFiles = candidates
        .map((name) => ({ name, hostPath: join(sshDir, name) }))
        .filter((entry) => {
            try {
                return statSync(entry.hostPath).isFile()
            } catch {
                return false
            }
        })
    if (presentFiles.length === 0) return

    try {
        await runDockerCommand(['exec', containerId, 'mkdir', '-p', '/root/.ssh'])
        await runDockerCommand(['exec', containerId, 'chmod', '700', '/root/.ssh']).catch(() => undefined)
        for (const entry of presentFiles) {
            await runDockerCommand(['cp', entry.hostPath, `${containerId}:/root/.ssh/${entry.name}`])
            // Private keys must be 0600; public keys / known_hosts / config can be 0644.
            const isPrivateKey = !entry.name.endsWith('.pub') && entry.name !== 'known_hosts' && entry.name !== 'config'
            await runDockerCommand([
                'exec', containerId, 'chmod', isPrivateKey ? '600' : '644', `/root/.ssh/${entry.name}`
            ]).catch(() => undefined)
        }
        logger.debug(`[host-creds] Injected ${presentFiles.length} SSH file(s)`)
    } catch (err) {
        logger.debug('[host-creds] Failed to inject SSH credentials:', err)
    }
}

function findGitHubToken(): string | undefined {
    // 1. Environment
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN

    // 2. gh CLI — modern versions store the token outside hosts.yml (in the
    // OS keychain with a service name that differs across setups), so the
    // only reliable way to extract it is to ask the gh binary itself.
    try {
        const raw = execSync('gh auth token', {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        if (raw && /^(gho|ghp|ghs|github_pat)_/.test(raw)) return raw
    } catch { /* gh not installed or not logged in */ }

    // 3. Legacy: older gh versions wrote the token directly into hosts.yml.
    try {
        const hostsPath = join(homedir(), '.config', 'gh', 'hosts.yml')
        if (existsSync(hostsPath)) {
            const raw = readFileSync(hostsPath, 'utf-8')
            const match = raw.match(/oauth_token:\s*(\S+)/)
            if (match?.[1]) return match[1]
        }
    } catch { /* ignore */ }

    // 4. macOS Keychain (gh CLI stores here under "gh:github.com" on some setups)
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
