import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace } from '@/cloud/types'

function quoteShell(value: string): string {
    if (!value) {
        return "''"
    }
    return `'${value.replace(/'/g, `'\\''`)}'`
}

export async function syncPathWorkspaceInContainer(params: {
    runtime: DockerCliRuntime
    containerId: string
    workspace: PreparedWorkspace
    sourceDirectory: string
    user?: string
    home?: string
}): Promise<void> {
    await params.runtime.exec({
        containerId: params.containerId,
        command: [
            'sh',
            '-lc',
            [
                `TARGET=${quoteShell(params.workspace.repoVolumePath)}`,
                'mkdir -p "$TARGET"',
                'find "$TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
            ].join('\n')
        ]
    })

    await params.runtime.copyToContainer(params.sourceDirectory, params.containerId, params.workspace.repoVolumePath)

    if (!params.user) {
        return
    }

    await params.runtime.exec({
        containerId: params.containerId,
        command: [
            'sh',
            '-lc',
            `chown -R ${quoteShell(params.user)}:${quoteShell(params.user)} ${quoteShell(params.workspace.repoVolumePath)}`
        ]
    })
}
