import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { ResolvedSecret } from '@hapi/protocol/types'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'
import { syncRepositoryInContainer } from '@/cloud/workspace/syncRepositoryInContainer'
import { DaemonClient } from './DaemonClient'
import { buildSpawnArgs } from './HostProcessExecutor'
import { collectHostCredentials } from '@/cloud/credentials/hostCredentials'
import { resolveContainerHome, resolveContainerUser } from '@/cloud/containerUser'

const DAEMON_PORT = 9876

function matchesConfiguredUser(configuredUser: string | undefined, expectedUser: string): boolean {
    return (configuredUser?.trim() || 'root') === expectedUser
}

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
    callbackToken?: string
}): Promise<DaemonSessionResult> {
    const containerUser = resolveContainerUser(params.environment?.environment?.user)
    const containerHome = resolveContainerHome(containerUser)
    const callbackUrl = params.controlPort
        ? `http://host.docker.internal:${params.controlPort}`
        : undefined

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
        if (inspectResult.status !== 'running' || !matchesConfiguredUser(inspectResult.configuredUser, containerUser)) {
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
                        const reattachCreds = collectHostCredentials()
                        const spawnResponse = await client.spawn({
                            command: ['haqi', ...spawnArgs],
                            cwd: params.workspace.workingDirectory,
                            user: containerUser,
                            env: {
                                ...params.env,
                                CLI_API_TOKEN: process.env.HAPI_CHILD_CLI_API_TOKEN ?? process.env.CLI_API_TOKEN ?? '',
                                HAPI_API_URL: (process.env.HAPI_API_URL ?? '').replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal'),
                                HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
                                HAPI_CONTAINER_ID: containerId,
                                HAPI_CONTAINER_USER: containerUser,
                                HAPI_CONTAINER_HOME: containerHome,
                                HAPI_RUNTIME_KIND: 'daemon-session',
                                HOME: containerHome,
                                USER: containerUser,
                                LOGNAME: containerUser,
                                CLAUDE_CONFIG_DIR: `${containerHome}/.claude`,
                                CODEX_HOME: `${containerHome}/.codex`,
                                ...(callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: callbackUrl } : {}),
                                ...(params.callbackToken ? { HAPI_RUNNER_CALLBACK_TOKEN: params.callbackToken } : {}),
                                ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
                                ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {}),
                                ...reattachCreds.env
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

    // Bake host credentials into the container filesystem.
    // This writes to the container's overlay layer (not mounts), so they
    // persist through docker commit and thus through checkpoint save/reuse.
    // Only do this for fresh containers (not checkpoints) since checkpoint
    // images already have baked credentials from their previous save.
    if (!checkpointImage) {
        const { injectHostCredentialsIntoContainer } = await import('@/cloud/credentials/hostCredentials')
        await injectHostCredentialsIntoContainer(containerId, containerUser).catch((err) => {
            // Non-fatal; agent will fall back to env var tokens
            console.warn('[DaemonSessionExecutor] Credential injection failed:', err)
        })
    }

    // Sync repository inside the running container
    if (params.repositorySource) {
        await syncRepositoryInContainer({
            runtime: params.runtime,
            containerId,
            workspace: params.workspace,
            repository: params.repositorySource as any,
            repoSyncPolicy: params.options.repoSyncPolicy ?? 'fetch-reset',
            repositoryCredential: params.repositoryCredential,
            user: containerUser,
            home: containerHome
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
    const hostCreds = collectHostCredentials()
    const spawnResponse = await client.spawn({
        command: ['haqi', ...spawnArgs],
        cwd: params.workspace.workingDirectory,
        user: containerUser,
        env: {
            ...params.env,
            CLI_API_TOKEN: process.env.HAPI_CHILD_CLI_API_TOKEN ?? process.env.CLI_API_TOKEN ?? '',
            HAPI_API_URL: (process.env.HAPI_API_URL ?? '').replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal'),
            HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
            HAPI_CONTAINER_ID: containerId,
            HAPI_CONTAINER_USER: containerUser,
            HAPI_CONTAINER_HOME: containerHome,
            HAPI_RUNTIME_KIND: 'daemon-session',
            HOME: containerHome,
            USER: containerUser,
            LOGNAME: containerUser,
            CLAUDE_CONFIG_DIR: `${containerHome}/.claude`,
            CODEX_HOME: `${containerHome}/.codex`,
            ...(callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: callbackUrl } : {}),
            ...(params.callbackToken ? { HAPI_RUNNER_CALLBACK_TOKEN: params.callbackToken } : {}),
            ...(noVncPort ? { HAPI_NOVNC_PORT: String(noVncPort) } : {}),
            ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
            ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {}),
            ...hostCreds.env
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
