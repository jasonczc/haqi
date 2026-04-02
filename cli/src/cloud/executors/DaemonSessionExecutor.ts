import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { ResolvedSecret } from '@hapi/protocol/types'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'
import { syncRepositoryInContainer } from '@/cloud/workspace/syncRepositoryInContainer'
import { DaemonClient } from './DaemonClient'
import { buildSpawnArgs } from './HostProcessExecutor'

const DAEMON_PORT = 9876

export type DaemonSessionResult = {
    runtimeKind: 'daemon-session'
    containerId: string
    daemonClient: DaemonClient
    pid: number
    daemonUrl: string
    daemonAuthToken: string
    noVncPort?: number
    reused: boolean
}

export async function startDaemonSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
    repositorySource?: { url: string; provider?: string; cloneDepth?: number; ref?: any; withSubmodules?: boolean; withLfs?: boolean } | null
    repositoryCredential?: ResolvedSecret
    controlPort?: number
}): Promise<DaemonSessionResult> {
    // Try to find an existing running container for this workspace
    const workspaceId = params.workspace.workspaceId
    const existingContainerId = workspaceId
        ? await params.runtime.findContainerByLabel('haqi.workspace_id', workspaceId)
        : null

    let containerId: string
    let authToken: string
    let reused = false

    if (existingContainerId) {
        // Reattach to existing container
        containerId = existingContainerId

        // Read the auth token from container env
        const inspectResult = await params.runtime.inspect(containerId)
        if (inspectResult.status !== 'running') {
            // Container exists but not running — remove and create new
            await params.runtime.remove(containerId).catch(() => undefined)
        } else {
            // Try to get daemon port and check health
            const mappedPort = inspectResult.portBindings[DAEMON_PORT]
            if (mappedPort) {
                // We need the auth token — read from container environment
                const envResult = await params.runtime.exec({
                    containerId,
                    command: ['printenv', 'HAQI_DAEMON_AUTH_TOKEN'],
                    workingDir: '/'
                }).catch(() => null)
                authToken = envResult?.stdout?.trim() ?? ''

                if (authToken) {
                    const client = new DaemonClient(`http://127.0.0.1:${mappedPort}`, authToken)
                    try {
                        await client.waitReady(5_000)
                        // Daemon is alive — kill any existing process and spawn fresh
                        const status = await client.status()
                        if (status.running) {
                            await client.kill()
                            // Wait for process to exit
                            await new Promise(r => setTimeout(r, 1000))
                        }

                        // Spawn new agent in existing container
                        const spawnArgs = buildSpawnArgs(params.options)
                        const spawnResponse = await client.spawn({
                            command: ['haqi', ...spawnArgs],
                            cwd: params.workspace.workingDirectory,
                            env: {
                                ...params.env,
                                CLI_API_TOKEN: process.env.CLI_API_TOKEN ?? '',
                                HAPI_API_URL: (process.env.HAPI_API_URL ?? '').replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal'),
                                HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
                                HAPI_CONTAINER_ID: containerId,
                                HAPI_RUNTIME_KIND: 'daemon-session',
                                ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
                                ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {})
                            }
                        })

                        if (spawnResponse.status === 'failed') {
                            throw new Error(`Daemon spawn failed: ${spawnResponse.error ?? 'unknown'}`)
                        }

                        return {
                            runtimeKind: 'daemon-session',
                            containerId,
                            daemonClient: client,
                            pid: spawnResponse.pid,
                            daemonUrl: `http://127.0.0.1:${mappedPort}`,
                            daemonAuthToken: authToken,
                            reused: true
                        }
                    } catch {
                        // Daemon not healthy — fall through to create new container
                    }
                }
            }
        }
    }

    // Create new container with daemon
    authToken = crypto.randomUUID()

    // Resolve checkpoint image if a checkpointId is provided
    let checkpointImage: string | undefined = params.options.checkpointId
        ? `haqi-checkpoint:${params.options.checkpointId}`
        : undefined

    // Verify the checkpoint image exists locally; fall back to base image if not found
    if (checkpointImage) {
        try {
            await runDockerCommand(['inspect', '--type=image', checkpointImage])
        } catch {
            checkpointImage = undefined
        }
    }

    const container = await ensureWorkspaceContainer({
        runtime: params.runtime,
        workspace: params.workspace,
        environment: params.environment,
        checkpointImage,
        checkpointId: params.options.checkpointId,
        sessionLabel: params.sessionLabel,
        daemonMode: {
            daemonPort: DAEMON_PORT,
            authToken
        }
    })
    containerId = container.containerId

    const inspect = await params.runtime.inspect(containerId)
    const mappedPort = inspect.portBindings[DAEMON_PORT]
    if (!mappedPort) {
        await params.runtime.remove(containerId).catch(() => undefined)
        throw new Error(`Daemon port ${DAEMON_PORT} not found in container port bindings`)
    }
    const noVncPort = inspect.portBindings[6080] ?? undefined

    const daemonUrl = `http://127.0.0.1:${mappedPort}`
    const client = new DaemonClient(daemonUrl, authToken)

    await client.waitReady(30_000)

    // Sync repository inside the running container
    if (params.repositorySource) {
        await syncRepositoryInContainer({
            runtime: params.runtime,
            containerId,
            workspace: params.workspace,
            repository: params.repositorySource as any,
            repoSyncPolicy: params.options.repoSyncPolicy ?? 'fetch-reset',
            repositoryCredential: params.repositoryCredential
        })
    }

    if (!checkpointImage) {
        // Only run install hooks for fresh containers (not checkpoint-based)
        const installCmds = params.environment?.environment?.install
        if (installCmds) {
            const commands = Array.isArray(installCmds) ? installCmds : [installCmds]
            await client.prepare({
                commands,
                cwd: params.workspace.workingDirectory,
                env: params.env
            })
        }
    }

    // Spawn agent — include Worker's auth env so the agent can connect back to Hub
    const spawnArgs = buildSpawnArgs(params.options)
    // Build callback URL so the container agent can POST session webhook back to the worker
    const callbackUrl = params.controlPort
        ? `http://host.docker.internal:${params.controlPort}`
        : undefined
    const spawnResponse = await client.spawn({
        command: ['haqi', ...spawnArgs],
        cwd: params.workspace.workingDirectory,
        env: {
            ...params.env,
            CLI_API_TOKEN: process.env.CLI_API_TOKEN ?? '',
            HAPI_API_URL: (process.env.HAPI_API_URL ?? '').replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal'),
            HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
            HAPI_CONTAINER_ID: containerId,
            HAPI_RUNTIME_KIND: 'daemon-session',
            ...(callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: callbackUrl } : {}),
            ...(noVncPort ? { HAPI_NOVNC_PORT: String(noVncPort) } : {}),
            ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
            ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {})
        }
    })

    if (spawnResponse.status === 'failed') {
        await params.runtime.remove(containerId).catch(() => undefined)
        throw new Error(`Daemon spawn failed: ${spawnResponse.error ?? 'unknown error'}`)
    }

    return {
        runtimeKind: 'daemon-session',
        containerId,
        daemonClient: client,
        pid: spawnResponse.pid,
        daemonUrl,
        daemonAuthToken: authToken,
        noVncPort,
        reused: false
    }
}
