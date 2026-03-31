import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'
import { DaemonClient } from './DaemonClient'
import { buildSpawnArgs } from './HostProcessExecutor'

const DAEMON_PORT = 9876

export type DaemonSessionResult = {
    runtimeKind: 'daemon-session'
    containerId: string
    daemonClient: DaemonClient
    pid: number
    daemonUrl: string
}

export async function startDaemonSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
}): Promise<DaemonSessionResult> {
    const authToken = crypto.randomUUID()

    const container = await ensureWorkspaceContainer({
        runtime: params.runtime,
        workspace: params.workspace,
        environment: params.environment,
        checkpointId: params.options.checkpointId,
        sessionLabel: params.sessionLabel,
        daemonMode: {
            daemonPort: DAEMON_PORT,
            authToken
        }
    })

    const inspect = await params.runtime.inspect(container.containerId)
    const mappedPort = inspect.portBindings[DAEMON_PORT]
    if (!mappedPort) {
        await params.runtime.remove(container.containerId).catch(() => undefined)
        throw new Error(`Daemon port ${DAEMON_PORT} not found in container port bindings`)
    }

    const daemonUrl = `http://127.0.0.1:${mappedPort}`
    const client = new DaemonClient(daemonUrl, authToken)

    await client.waitReady(30_000)

    const installCmds = params.environment?.environment?.install
    if (installCmds) {
        const commands = Array.isArray(installCmds) ? installCmds : [installCmds]
        await client.prepare({
            commands,
            cwd: params.workspace.workingDirectory,
            env: params.env
        })
    }

    const spawnArgs = buildSpawnArgs(params.options)
    const spawnResponse = await client.spawn({
        command: ['haqi', ...spawnArgs],
        cwd: params.workspace.workingDirectory,
        env: {
            ...params.env,
            HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
            HAPI_CONTAINER_ID: container.containerId
        }
    })

    if (spawnResponse.status === 'failed') {
        await params.runtime.remove(container.containerId).catch(() => undefined)
        throw new Error(`Daemon spawn failed: ${spawnResponse.error ?? 'unknown error'}`)
    }

    return {
        runtimeKind: 'daemon-session',
        containerId: container.containerId,
        daemonClient: client,
        pid: spawnResponse.pid,
        daemonUrl
    }
}
