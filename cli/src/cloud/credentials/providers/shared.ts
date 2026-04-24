import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function findGitHubToken(): string | undefined {
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
