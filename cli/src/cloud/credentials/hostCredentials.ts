import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { DEFAULT_CONTAINER_HOME, getContainerHomeTargets } from '@/cloud/containerUser'

export type HostCredentialBundle = {
    env: Record<string, string>
    fileMounts: Array<{
        hostPath: string
        containerPath: string
        mode: 'ro' | 'rw'
    }>
}

async function runDockerExec(containerId: string, command: string[], options?: { user?: string }): Promise<void> {
    const args = ['exec']
    if (options?.user) {
        args.push('-u', options.user)
    }
    args.push(containerId, ...command)
    await runDockerCommand(args)
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
            containerPath: `${DEFAULT_CONTAINER_HOME}/.codex/auth.json`,
            mode: 'ro',
        })
        logger.debug('[host-creds] Mounting Codex auth.json')
    }
    // Codex config (model preferences etc)
    const codexConfigPath = join(homedir(), '.codex', 'config.toml')
    if (existsSync(codexConfigPath)) {
        fileMounts.push({
            hostPath: codexConfigPath,
            containerPath: `${DEFAULT_CONTAINER_HOME}/.codex/config.toml`,
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
export async function injectHostCredentialsIntoContainer(containerId: string, user?: string): Promise<void> {
    const homeTargets = getContainerHomeTargets(user)

    // Claude Code credentials
    const claudeToken = findClaudeOAuthToken()
    if (claudeToken) {
        try {
            const credJson = JSON.stringify({
                claudeAiOauth: { accessToken: claudeToken }
            })
            for (const target of homeTargets) {
                await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.claude`], { user: 'root' })
                await runDockerExec(containerId, [
                    'sh', '-c',
                    `cat > ${target.home}/.claude/.credentials.json <<'HAQI_CRED_EOF'\n${credJson}\nHAQI_CRED_EOF\nchmod 600 ${target.home}/.claude/.credentials.json\nchown ${target.owner} ${target.home}/.claude/.credentials.json`
                ], { user: 'root' })
            }
            logger.debug('[host-creds] Injected Claude credentials into container')
        } catch (err) {
            logger.debug('[host-creds] Failed to inject Claude credentials:', err)
        }
    }

    // Codex auth.json (full file copy)
    const codexAuth = join(homedir(), '.codex', 'auth.json')
    if (existsSync(codexAuth)) {
        try {
            for (const target of homeTargets) {
                await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.codex`], { user: 'root' })
                await runDockerCommand(['cp', codexAuth, `${containerId}:${target.home}/.codex/auth.json`])
                await runDockerExec(containerId, ['chmod', '600', `${target.home}/.codex/auth.json`], { user: 'root' })
                await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.codex/auth.json`], { user: 'root' }).catch(() => undefined)
            }
            logger.debug('[host-creds] Injected Codex auth into container')
        } catch (err) {
            logger.debug('[host-creds] Failed to inject Codex auth:', err)
        }
    }

    // Codex config.toml (model preferences)
    const codexConfig = join(homedir(), '.codex', 'config.toml')
    if (existsSync(codexConfig)) {
        try {
            for (const target of homeTargets) {
                await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.codex`], { user: 'root' })
                await runDockerCommand(['cp', codexConfig, `${containerId}:${target.home}/.codex/config.toml`])
                await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.codex/config.toml`], { user: 'root' }).catch(() => undefined)
            }
        } catch { /* ignore */ }
    }

    // Claude settings.json (model preferences, NOT credentials)
    const claudeSettings = join(homedir(), '.claude', 'settings.json')
    if (existsSync(claudeSettings)) {
        try {
            for (const target of homeTargets) {
                await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.claude`], { user: 'root' })
                await runDockerCommand(['cp', claudeSettings, `${containerId}:${target.home}/.claude/settings.json`])
                await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.claude/settings.json`], { user: 'root' }).catch(() => undefined)
            }
        } catch { /* ignore */ }
    }

    // ── Git identity + credentials ──────────────────────────────────
    // Copy the user's .gitconfig (name/email/aliases) so `git commit` inside
    // the container carries their identity. Host-specific helpers like
    // osxkeychain silently no-op in Linux; we override them below with a
    // store-based helper + a synthesized .git-credentials file when a token
    // is available.
    await injectGitConfig(containerId, user)
    await injectGitCredentials(containerId, user)
    await injectGhCli(containerId, user)
    await injectSshCredentials(containerId, user)
}

async function injectGitConfig(containerId: string, user?: string): Promise<void> {
    const gitconfig = join(homedir(), '.gitconfig')
    if (!existsSync(gitconfig)) return
    try {
        for (const target of getContainerHomeTargets(user)) {
            await runDockerCommand(['cp', gitconfig, `${containerId}:${target.home}/.gitconfig`])
            await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.gitconfig`], { user: 'root' }).catch(() => undefined)
            // Override credential.helper to "store" so the container reads from
            // the injected .git-credentials instead of host-only helpers.
            await runDockerExec(containerId, [
                'sh', '-c',
                `HOME=${target.home} git config --global --unset-all credential.helper 2>/dev/null; HOME=${target.home} git config --global credential.helper store`
            ], { user: 'root' }).catch(() => undefined)
        }
        logger.debug('[host-creds] Injected .gitconfig')
    } catch (err) {
        logger.debug('[host-creds] Failed to inject .gitconfig:', err)
    }
}

async function injectGitCredentials(containerId: string, user?: string): Promise<void> {
    // Prefer the host's .git-credentials file if present — it already has
    // whatever provider/token the user set up. Otherwise synthesize one from
    // the discovered GitHub token so HTTPS pushes/pulls work out of the box.
    const hostGitCreds = join(homedir(), '.git-credentials')
    try {
        if (existsSync(hostGitCreds)) {
            for (const target of getContainerHomeTargets(user)) {
                await runDockerCommand(['cp', hostGitCreds, `${containerId}:${target.home}/.git-credentials`])
                await runDockerExec(containerId, ['chmod', '600', `${target.home}/.git-credentials`], { user: 'root' })
                await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.git-credentials`], { user: 'root' }).catch(() => undefined)
            }
            logger.debug('[host-creds] Injected .git-credentials')
            return
        }
    } catch (err) {
        logger.debug('[host-creds] Failed to copy .git-credentials:', err)
    }

    const ghToken = findGitHubToken()
    if (!ghToken) return
    try {
        const line = `https://x-access-token:${ghToken}@github.com`
        for (const target of getContainerHomeTargets(user)) {
            await runDockerExec(containerId, [
                'sh', '-c',
                `cat > ${target.home}/.git-credentials <<'HAQI_GIT_EOF'\n${line}\nHAQI_GIT_EOF\nchmod 600 ${target.home}/.git-credentials\nchown ${target.owner} ${target.home}/.git-credentials`
            ], { user: 'root' })
        }
        logger.debug('[host-creds] Synthesized .git-credentials from GitHub token')
    } catch (err) {
        logger.debug('[host-creds] Failed to synthesize .git-credentials:', err)
    }
}

async function injectGhCli(containerId: string, user?: string): Promise<void> {
    // gh CLI reads auth from ~/.config/gh/hosts.yml. Copy the whole gh
    // directory so `gh auth status`, `gh pr`, `gh issue` all work seamlessly.
    // Modern gh stores the oauth token in the OS keychain instead of
    // hosts.yml, so we append oauth_token ourselves when it's missing —
    // otherwise the container's gh binary can't authenticate without
    // access to the host keychain.
    const ghDir = join(homedir(), '.config', 'gh')
    if (!existsSync(ghDir)) return
    try {
        for (const target of getContainerHomeTargets(user)) {
            await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.config`], { user: 'root' })
            await runDockerCommand(['cp', ghDir, `${containerId}:${target.home}/.config/gh`])
            await runDockerExec(containerId, ['chmod', '-R', 'go-rwx', `${target.home}/.config/gh`], { user: 'root' }).catch(() => undefined)
            await runDockerExec(containerId, ['chown', '-R', target.owner, `${target.home}/.config/gh`], { user: 'root' }).catch(() => undefined)

            const ghToken = findGitHubToken()
            if (ghToken) {
                const sedProgram = `
if [ -f ${target.home}/.config/gh/hosts.yml ] && ! grep -q oauth_token ${target.home}/.config/gh/hosts.yml; then
  sed -i '/^github\\.com:/a\\    oauth_token: ${ghToken}' ${target.home}/.config/gh/hosts.yml
fi
`.trim()
                await runDockerExec(containerId, ['sh', '-c', sedProgram], { user: 'root' }).catch(() => undefined)
            }
        }
        logger.debug('[host-creds] Injected gh CLI config')
    } catch (err) {
        logger.debug('[host-creds] Failed to inject gh CLI config:', err instanceof Error ? err.message : String(err))
    }
}

async function injectSshCredentials(containerId: string, user?: string): Promise<void> {
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
        for (const target of getContainerHomeTargets(user)) {
            await runDockerExec(containerId, ['mkdir', '-p', `${target.home}/.ssh`], { user: 'root' })
            await runDockerExec(containerId, ['chmod', '700', `${target.home}/.ssh`], { user: 'root' }).catch(() => undefined)
            await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.ssh`], { user: 'root' }).catch(() => undefined)
            for (const entry of presentFiles) {
                await runDockerCommand(['cp', entry.hostPath, `${containerId}:${target.home}/.ssh/${entry.name}`])
                const isPrivateKey = !entry.name.endsWith('.pub') && entry.name !== 'known_hosts' && entry.name !== 'config'
                await runDockerExec(containerId, ['chmod', isPrivateKey ? '600' : '644', `${target.home}/.ssh/${entry.name}`], { user: 'root' }).catch(() => undefined)
                await runDockerExec(containerId, ['chown', target.owner, `${target.home}/.ssh/${entry.name}`], { user: 'root' }).catch(() => undefined)
            }
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
