import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'
import { findGitHubToken } from './shared'

function gitCredentialsPath(): string {
    return join(homedir(), '.git-credentials')
}

export const gitcredsProvider: CredentialProvider = {
    kind: 'gitcreds',

    async status(): Promise<CredentialStatus> {
        const path = gitCredentialsPath()
        if (existsSync(path)) {
            return { kind: 'gitcreds', present: true, sources: [path] }
        }
        const token = findGitHubToken()
        if (token) {
            return {
                kind: 'gitcreds',
                present: true,
                sources: ['synthesized from GitHub token'],
                note: 'No ~/.git-credentials; will synthesize from GitHub token.',
            }
        }
        return { kind: 'gitcreds', present: false, sources: [] }
    },

    async inject(target: ContainerTarget): Promise<void> {
        const hostGitCreds = gitCredentialsPath()
        const homeTargets = getContainerHomeTargets(target.user)

        // Prefer the host's .git-credentials file if present — it already has
        // whatever provider/token the user set up. Otherwise synthesize one
        // from the discovered GitHub token so HTTPS pushes/pulls work.
        if (existsSync(hostGitCreds)) {
            for (const ht of homeTargets) {
                try {
                    await runDockerCommand(['cp', hostGitCreds, `${target.containerId}:${ht.home}/.git-credentials`])
                    await runDockerExec(target.containerId, ['chmod', '600', `${ht.home}/.git-credentials`], { user: 'root' })
                    await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.git-credentials`], { user: 'root' }).catch(() => undefined)
                } catch (err) {
                    logger.debug('[host-creds] Failed to copy .git-credentials:', err)
                }
            }
            logger.debug('[host-creds] Injected .git-credentials')
            return
        }

        const ghToken = findGitHubToken()
        if (!ghToken) return
        const line = `https://x-access-token:${ghToken}@github.com`
        for (const ht of homeTargets) {
            try {
                await runDockerExec(target.containerId, [
                    'sh', '-c',
                    `cat > ${ht.home}/.git-credentials <<'HAQI_GIT_EOF'\n${line}\nHAQI_GIT_EOF\nchmod 600 ${ht.home}/.git-credentials\nchown ${ht.owner} ${ht.home}/.git-credentials`,
                ], { user: 'root' })
            } catch (err) {
                logger.debug('[host-creds] Failed to synthesize .git-credentials:', err)
            }
        }
        logger.debug('[host-creds] Synthesized .git-credentials from GitHub token')
    },
}
