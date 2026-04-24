import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import { getContainerHomeTargets } from '@/cloud/containerUser'
import { ensureContainerDirOwned, runDockerExec } from '../containerOps'
import type { CredentialProvider, CredentialStatus, ContainerTarget } from '../types'

const SSH_CANDIDATES = [
    'known_hosts',
    'config',
    'id_ed25519', 'id_ed25519.pub',
    'id_rsa', 'id_rsa.pub',
    'id_ecdsa', 'id_ecdsa.pub',
] as const

function sshDirPath(): string {
    return join(homedir(), '.ssh')
}

function presentSshFiles(): Array<{ name: string; hostPath: string }> {
    const dir = sshDirPath()
    if (!existsSync(dir)) return []
    return SSH_CANDIDATES
        .map((name) => ({ name, hostPath: join(dir, name) }))
        .filter((entry) => {
            try {
                return statSync(entry.hostPath).isFile()
            } catch {
                return false
            }
        })
}

export const sshProvider: CredentialProvider = {
    kind: 'ssh',

    async status(): Promise<CredentialStatus> {
        const files = presentSshFiles()
        return {
            kind: 'ssh',
            present: files.length > 0,
            sources: files.map(f => f.hostPath),
        }
    },

    async inject(target: ContainerTarget): Promise<void> {
        // SSH keys are sensitive. They're baked into the checkpoint image if
        // the user saves one — same risk class as the OAuth tokens we already
        // inject, so the security model is consistent.
        const files = presentSshFiles()
        if (files.length === 0) return

        const homeTargets = getContainerHomeTargets(target.user)
        for (const ht of homeTargets) {
            try {
                await ensureContainerDirOwned(target.containerId, `${ht.home}/.ssh`, ht.owner, '700')
                for (const entry of files) {
                    await runDockerCommand(['cp', entry.hostPath, `${target.containerId}:${ht.home}/.ssh/${entry.name}`])
                    const isPrivateKey = !entry.name.endsWith('.pub') && entry.name !== 'known_hosts' && entry.name !== 'config'
                    await runDockerExec(target.containerId, ['chmod', isPrivateKey ? '600' : '644', `${ht.home}/.ssh/${entry.name}`], { user: 'root' }).catch(() => undefined)
                    await runDockerExec(target.containerId, ['chown', ht.owner, `${ht.home}/.ssh/${entry.name}`], { user: 'root' }).catch(() => undefined)
                }
            } catch (err) {
                logger.debug('[host-creds] Failed to inject SSH credentials:', err)
            }
        }
        logger.debug(`[host-creds] Injected ${files.length} SSH file(s)`)
    },
}
