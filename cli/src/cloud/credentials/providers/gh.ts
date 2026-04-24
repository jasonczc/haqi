import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { ensureContainerDirOwned, runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'
import { findGitHubToken } from './shared'

function ghDirPath(): string {
    return join(homedir(), '.config', 'gh')
}

export const ghProvider: CredentialProvider = {
    kind: 'gh',

    async status(): Promise<CredentialStatus> {
        const dir = ghDirPath()
        const exists = existsSync(dir)
        return {
            kind: 'gh',
            present: exists,
            sources: exists ? [dir] : [],
        }
    },

    async inject(target: ContainerTarget): Promise<void> {
        const dir = ghDirPath()
        if (!existsSync(dir)) return

        // gh CLI reads auth from ~/.config/gh/hosts.yml. Modern gh stores the
        // oauth token in the OS keychain instead of hosts.yml, so we append
        // oauth_token ourselves when it's missing — otherwise the container's
        // gh binary can't authenticate without access to the host keychain.
        const homeTargets = getContainerHomeTargets(target.user)
        for (const ht of homeTargets) {
            try {
                await ensureContainerDirOwned(target.containerId, `${ht.home}/.config`, ht.owner)
                await runDockerCommand(['cp', dir, `${target.containerId}:${ht.home}/.config/gh`])
                await runDockerExec(target.containerId, ['chmod', '-R', 'go-rwx', `${ht.home}/.config/gh`], { user: 'root' }).catch(() => undefined)
                await runDockerExec(target.containerId, ['chown', '-R', ht.owner, `${ht.home}/.config/gh`], { user: 'root' }).catch(() => undefined)

                const ghToken = findGitHubToken()
                if (ghToken) {
                    const sedProgram = `
if [ -f ${ht.home}/.config/gh/hosts.yml ] && ! grep -q oauth_token ${ht.home}/.config/gh/hosts.yml; then
  sed -i '/^github\\.com:/a\\    oauth_token: ${ghToken}' ${ht.home}/.config/gh/hosts.yml
fi
`.trim()
                    await runDockerExec(target.containerId, ['sh', '-c', sedProgram], { user: 'root' }).catch(() => undefined)
                }
            } catch (err) {
                logger.debug('[host-creds] Failed to inject gh CLI config:', err instanceof Error ? err.message : String(err))
            }
        }
        logger.debug('[host-creds] Injected gh CLI config')
    },
}
