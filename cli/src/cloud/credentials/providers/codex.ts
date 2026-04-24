import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { ensureContainerDirOwned, runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'

function codexAuthPath(): string {
    return join(homedir(), '.codex', 'auth.json')
}

function codexConfigPath(): string {
    return join(homedir(), '.codex', 'config.toml')
}

export const codexProvider: CredentialProvider = {
    kind: 'codex',

    async status(): Promise<CredentialStatus> {
        const sources: string[] = []
        const auth = codexAuthPath()
        const cfg = codexConfigPath()
        if (existsSync(auth)) sources.push(auth)
        if (existsSync(cfg)) sources.push(cfg)
        return {
            kind: 'codex',
            present: existsSync(auth),
            sources,
        }
    },

    async inject(target: ContainerTarget): Promise<void> {
        const auth = codexAuthPath()
        const cfg = codexConfigPath()
        const homeTargets = getContainerHomeTargets(target.user)

        if (existsSync(auth)) {
            for (const ht of homeTargets) {
                try {
                    await ensureContainerDirOwned(target.containerId, `${ht.home}/.codex`, ht.owner)
                    await runDockerCommand(['cp', auth, `${target.containerId}:${ht.home}/.codex/auth.json`])
                    await runDockerExec(target.containerId, ['chmod', '600', `${ht.home}/.codex/auth.json`], { user: 'root' })
                    await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.codex/auth.json`], { user: 'root' }).catch(() => undefined)
                } catch (err) {
                    logger.debug('[host-creds] Failed to inject Codex auth:', err)
                }
            }
            logger.debug('[host-creds] Injected Codex auth into container')
        }

        if (existsSync(cfg)) {
            for (const ht of homeTargets) {
                try {
                    await ensureContainerDirOwned(target.containerId, `${ht.home}/.codex`, ht.owner)
                    await runDockerCommand(['cp', cfg, `${target.containerId}:${ht.home}/.codex/config.toml`])
                    await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.codex/config.toml`], { user: 'root' }).catch(() => undefined)
                } catch { /* ignore */ }
            }
        }
    },
}
