import { runDockerCommand } from '@/cloud/docker/dockerCli'

export async function runDockerExec(
    containerId: string,
    command: string[],
    options?: { user?: string }
): Promise<void> {
    const args = ['exec']
    if (options?.user) {
        args.push('-u', options.user)
    }
    args.push(containerId, ...command)
    await runDockerCommand(args)
}

export async function ensureContainerDirOwned(
    containerId: string,
    dirPath: string,
    owner: string,
    mode?: string
): Promise<void> {
    await runDockerExec(containerId, ['mkdir', '-p', dirPath], { user: 'root' })
    if (mode) {
        await runDockerExec(containerId, ['chmod', mode, dirPath], { user: 'root' }).catch(() => undefined)
    }
    await runDockerExec(containerId, ['chown', owner, dirPath], { user: 'root' }).catch(() => undefined)
}
