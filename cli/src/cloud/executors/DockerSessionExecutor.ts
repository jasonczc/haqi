import type { ChildProcess } from 'node:child_process'
import type { PreviewTarget } from '@hapi/protocol/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import { buildSpawnArgs } from '@/cloud/executors/HostProcessExecutor'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'

export async function startDockerSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
    existingContainerId?: string
    existingPreviewTargets?: PreviewTarget[]
}): Promise<{
    childProcess: ChildProcess
    pid: number
    containerId: string
    runtimeKind: 'docker-session'
    previewTargets: PreviewTarget[]
}> {
    const container = params.existingContainerId
        ? {
            containerId: params.existingContainerId,
            previewTargets: params.existingPreviewTargets ?? []
        }
        : await ensureWorkspaceContainer({
            runtime: params.runtime,
            workspace: params.workspace,
            environment: params.environment,
            checkpointId: params.options.checkpointId,
            sessionLabel: params.sessionLabel
        })

    const childProcess = params.runtime.spawnExec({
        containerId: container.containerId,
        workingDir: params.workspace.workingDirectory,
        env: Object.entries({
            ...params.env,
            HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
            HAPI_CONTAINER_ID: container.containerId
        }).map(([key, value]) => `${key}=${value}`),
        command: ['haqi', ...buildSpawnArgs(params.options)]
    }, {
        stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!childProcess.pid) {
        await params.runtime.remove(container.containerId).catch(() => undefined)
        throw new Error('Failed to spawn docker session executor: no PID returned')
    }

    return {
        childProcess,
        pid: childProcess.pid,
        containerId: container.containerId,
        runtimeKind: 'docker-session',
        previewTargets: container.previewTargets
    }
}
