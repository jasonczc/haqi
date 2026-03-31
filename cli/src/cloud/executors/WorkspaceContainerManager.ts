import type { PreviewTarget } from '@hapi/protocol/types'
import type { DockerCliRuntime, DockerRunSpec } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'

function keepaliveCommand(): string[] {
    return ['sh', '-lc', 'trap "exit 0" TERM INT; while true; do sleep 3600; done']
}

export async function ensureWorkspaceContainer(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    checkpointId?: string
    sessionLabel: string
    daemonMode?: {
        daemonPort: number
        authToken: string
    }
}): Promise<{
    containerId: string
    previewTargets: PreviewTarget[]
}> {
    const image = params.environment?.environment?.runtime?.image
    if (!image) {
        throw new Error('docker-session runtime requires environment.runtime.image')
    }

    await params.runtime.pull(image)

    const portSpecs = (params.environment?.environment?.ports ?? []).map((port) => ({
        containerPort: port.containerPort,
        hostPort: port.hostPort,
        protocol: port.protocol
    }))

    if (params.daemonMode) {
        portSpecs.push({
            containerPort: params.daemonMode.daemonPort,
            hostPort: undefined,
            protocol: 'tcp'
        })
    }

    const mounts = [
        `${params.workspace.repoVolumePath}:${params.workspace.repoVolumePath}`
    ]
    if (params.workspace.desktopStatePath) {
        mounts.push(`${params.workspace.desktopStatePath}:${params.workspace.desktopStatePath}`)
    }

    const spec: DockerRunSpec = {
        image,
        name: `haqi-workspace-${params.sessionLabel}`,
        command: params.daemonMode
            ? ['haqi-daemon', '--port', String(params.daemonMode.daemonPort), '--auth-token', params.daemonMode.authToken]
            : keepaliveCommand(),
        workingDir: params.workspace.workingDirectory,
        mounts,
        ports: portSpecs,
        labels: {
            'haqi.runtime': params.daemonMode ? 'daemon-session' : 'docker-session',
            'haqi.workspace_id': params.workspace.workspaceId,
            ...(params.checkpointId ? { 'haqi.checkpoint_id': params.checkpointId } : {})
        },
        detach: true
    }

    const containerId = await params.runtime.run(spec)
    const inspect = await params.runtime.inspect(containerId)
    const previewTargets: PreviewTarget[] = []
    for (const port of params.environment?.environment?.ports ?? []) {
        if (!port.expose && !port.public) {
            continue
        }
        const hostPort = inspect.portBindings[port.containerPort]
        if (!hostPort) {
            continue
        }
        previewTargets.push({
            id: `${containerId.slice(0, 12)}-${port.containerPort}`,
            name: port.name ?? `preview:${port.containerPort}`,
            port: hostPort,
            url: `http://127.0.0.1:${hostPort}`,
            visibility: port.public ? 'public' : 'private'
        })
    }

    return {
        containerId,
        previewTargets
    }
}
