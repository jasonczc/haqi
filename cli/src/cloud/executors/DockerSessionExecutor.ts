import type { PreviewTarget } from '@hapi/protocol/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { DockerCliRuntime, DockerRunSpec } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import { buildBootstrapScript } from '@/cloud/environment/runEnvironmentCommands'

function resolveAgentCommand(options: SpawnSessionOptions): string[] {
    const agent = options.agent ?? 'claude'
    const args: string[] = ['haqi']
    if (agent !== 'claude') {
        args.push(agent)
    }

    if (options.resumeSessionId) {
        if (agent === 'codex') {
            args.push('resume', options.resumeSessionId)
        } else {
            args.push('--resume', options.resumeSessionId)
        }
    }

    args.push('--hapi-starting-mode', 'remote', '--started-by', 'runner')

    if (options.model && agent !== 'opencode') {
        args.push('--model', options.model)
    }
    if (agent === 'codex' && options.thinkEffort) {
        args.push('--effort', options.thinkEffort)
    }
    if (agent === 'codex' && options.serviceTier) {
        args.push('--service-tier', options.serviceTier)
    }
    if (
        agent === 'claude'
        && options.thinkEffort
        && ['low', 'medium', 'high', 'max'].includes(options.thinkEffort)
    ) {
        args.push('--effort', options.thinkEffort)
    }
    if (options.yolo) {
        args.push(agent === 'codex' ? '--auto-approve' : '--yolo')
    }

    return args
}

export async function startDockerSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
}): Promise<{
    containerId: string
    runtimeKind: 'docker-session'
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

    const agentCommand = resolveAgentCommand(params.options)
    const hasHooks = Boolean(
        params.environment?.environment?.install
        || params.environment?.environment?.start
    )
    const command = hasHooks
        ? [
            'sh',
            '-lc',
            buildBootstrapScript({
                commands: [
                    params.environment?.environment?.install,
                    params.environment?.environment?.start
                ],
                agentCommand
            })
        ]
        : agentCommand

    const spec: DockerRunSpec = {
        image,
        name: `haqi-session-${params.sessionLabel}`,
        command,
        env: Object.entries(params.env).map(([key, value]) => `${key}=${value}`),
        workingDir: params.workspace.workingDirectory,
        mounts: [`${params.workspace.workspacePath}:${params.workspace.workspacePath}`],
        ports: portSpecs,
        labels: {
            'haqi.runtime': 'docker-session',
            'haqi.workspace_id': params.workspace.workspaceId
        },
        detach: true
    }

    if (params.options.executionBackend) {
        spec.labels = {
            ...(spec.labels ?? {}),
            'haqi.execution_backend': params.options.executionBackend
        }
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
        runtimeKind: 'docker-session',
        previewTargets
    }
}
