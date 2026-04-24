import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'

function gitconfigPath(): string {
    return join(homedir(), '.gitconfig')
}

export const gitconfigProvider: CredentialProvider = {
    kind: 'gitconfig',

    async status(): Promise<CredentialStatus> {
        const path = gitconfigPath()
        const exists = existsSync(path)
        return {
            kind: 'gitconfig',
            present: exists,
            sources: exists ? [path] : [],
        }
    },

    async inject(target: ContainerTarget): Promise<void> {
        const path = gitconfigPath()
        if (!existsSync(path)) return

        const homeTargets = getContainerHomeTargets(target.user)
        for (const ht of homeTargets) {
            try {
                await runDockerCommand(['cp', path, `${target.containerId}:${ht.home}/.gitconfig`])
                await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.gitconfig`], { user: 'root' }).catch(() => undefined)
                // Strip the host operator's [user] section from the copied
                // gitconfig. Otherwise when the agent commits in a repo that
                // has no local user.* set (e.g. a sub-repo the agent cloned
                // itself, or a fresh init), git falls back to global — which
                // would attribute the commit to whoever owns the hub host
                // rather than the user who configured identity in the web
                // settings UI. configureGitIdentity writes the correct values
                // to --global immediately after this injection.
                await runDockerExec(target.containerId, [
                    'sh', '-c',
                    `HOME=${ht.home} git config --global --unset-all user.name 2>/dev/null; ` +
                    `HOME=${ht.home} git config --global --unset-all user.email 2>/dev/null; ` +
                    `HOME=${ht.home} git config --global --unset-all user.signingkey 2>/dev/null; ` +
                    // Override credential.helper to "store" so the container reads from
                    // the injected .git-credentials instead of host-only helpers.
                    `HOME=${ht.home} git config --global --unset-all credential.helper 2>/dev/null; ` +
                    `HOME=${ht.home} git config --global credential.helper store`,
                ], { user: 'root' }).catch(() => undefined)
            } catch (err) {
                logger.debug('[host-creds] Failed to inject .gitconfig:', err)
            }
        }
        logger.debug('[host-creds] Injected .gitconfig (stripped host [user] section)')
    },
}
