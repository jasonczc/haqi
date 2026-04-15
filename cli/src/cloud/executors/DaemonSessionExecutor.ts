import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate, ServiceEndpoint, ServiceRuntimeHandle } from '@/cloud/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { PreviewTarget, ResolvedSecret } from '@hapi/protocol/types'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'
import { syncRepositoryInContainer } from '@/cloud/workspace/syncRepositoryInContainer'
import { syncPathWorkspaceInContainer } from '@/cloud/workspace/syncPathWorkspaceInContainer'
import { DaemonClient } from './DaemonClient'
import { buildSpawnArgs } from './HostProcessExecutor'
import { collectHostCredentials } from '@/cloud/credentials/hostCredentials'
import { getContainerHomeTargets, resolveContainerHome, resolveContainerUser } from '@/cloud/containerUser'
import { mergePreviewTargets } from '@/cloud/preview/previewReporter'
import { InnerDockerServiceOrchestrator } from '@/cloud/docker/innerServiceOrchestrator'
import { loadWorkspaceEnvironmentTemplateInContainer } from '@/cloud/environment/workspaceEnvironment'
import { loadBootstrapEnvironmentFilesInContainer } from '@/cloud/environment/bootstrapEnvironment'
import { resolveEnvironmentTemplate } from '@/cloud/environment/resolveEnvironment'
import type { GitIdentity } from '@hapi/protocol/types'

const DAEMON_PORT = 9876

function matchesConfiguredUser(configuredUser: string | undefined, expectedUser: string): boolean {
    return (configuredUser?.trim() || 'root') === expectedUser
}

function buildWorkspacePreviewTargets(containerId: string, environment: ResolvedEnvironmentTemplate | null): PreviewTarget[] {
    return (environment?.environment?.ports ?? [])
        .filter((port) => port.expose || port.public)
        .map((port) => ({
            id: `${containerId.slice(0, 12)}-${port.containerPort}`,
            name: port.name ?? `preview:${port.containerPort}`,
            port: port.containerPort,
            url: `http://127.0.0.1:${port.containerPort}`,
            visibility: port.public ? 'public' : 'private'
        }))
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
    previewTargets?: PreviewTarget[]
    serviceHandles?: ServiceRuntimeHandle[]
    serviceEndpoints?: ServiceEndpoint[]
}

function buildDaemonSessionEnv(params: {
    baseEnv: Record<string, string>
    containerId: string
    containerUser: string
    containerHome: string
    callbackUrl?: string
    callbackToken?: string
    workspacePath: string
    noVncPort?: number
    options: SpawnSessionOptions
    hostCredentials: Record<string, string>
}): Record<string, string> {
    return {
        ...params.baseEnv,
        CLI_API_TOKEN: process.env.HAPI_CHILD_CLI_API_TOKEN ?? process.env.CLI_API_TOKEN ?? '',
        HAPI_API_URL: (process.env.HAPI_API_URL ?? '').replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal'),
        HAPI_WORKING_DIRECTORY: params.workspacePath,
        HAPI_CONTAINER_ID: params.containerId,
        HAPI_CONTAINER_USER: params.containerUser,
        HAPI_CONTAINER_HOME: params.containerHome,
        HAPI_RUNTIME_KIND: 'daemon-session',
        HOME: params.containerHome,
        USER: params.containerUser,
        LOGNAME: params.containerUser,
        CLAUDE_CONFIG_DIR: `${params.containerHome}/.claude`,
        CODEX_HOME: `${params.containerHome}/.codex`,
        ...(params.callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: params.callbackUrl } : {}),
        ...(params.callbackToken ? { HAPI_RUNNER_CALLBACK_TOKEN: params.callbackToken } : {}),
        ...(params.noVncPort ? { HAPI_NOVNC_PORT: String(params.noVncPort) } : {}),
        ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
        ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {}),
        ...params.hostCredentials
    }
}

async function loadContainerBootstrapEnv(params: {
    runtime: DockerCliRuntime
    containerId: string
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    user: string
    home: string
}): Promise<Record<string, string>> {
    return loadBootstrapEnvironmentFilesInContainer({
        envConfig: params.environment?.environment?.env,
        runtime: params.runtime,
        containerId: params.containerId,
        basePath: params.workspace.workingDirectory,
        user: params.user,
        home: params.home
    })
}

async function runPrepareCommands(params: {
    client: DaemonClient
    commands: string | string[] | undefined
    cwd: string
    env: Record<string, string>
}): Promise<void> {
    if (!params.commands) {
        return
    }
    const commands = Array.isArray(params.commands) ? params.commands : [params.commands]
    await params.client.prepare({
        commands,
        cwd: params.cwd,
        env: params.env
    })
}

async function configureGitIdentity(params: {
    client: DaemonClient
    cwd: string
    env: Record<string, string>
    identity?: GitIdentity
}): Promise<void> {
    const name = params.identity?.name?.trim()
    const email = params.identity?.email?.trim()
    if (!name && !email) {
        return
    }
    const commands = [
        'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then',
        ...(name ? [`  git config user.name ${JSON.stringify(name)}`] : []),
        ...(email ? [`  git config user.email ${JSON.stringify(email)}`] : []),
        'fi'
    ]
    await params.client.prepare({
        commands: [commands.join('\n')],
        cwd: params.cwd,
        env: params.env
    })
}

async function writeShellProfileEnv(params: {
    runtime: DockerCliRuntime
    containerId: string
    containerUser: string
    env: Record<string, string>
}): Promise<void> {
    if (Object.keys(params.env).length === 0) {
        return
    }
    const envLines = Object.entries(params.env).map(([key, value]) => {
        const escaped = String(value ?? '').replace(/'/g, "'\\''")
        return `export ${key}='${escaped}'`
    })
    const b64 = Buffer.from(envLines.join('\n') + '\n').toString('base64')
    const profileTargets = getContainerHomeTargets(params.containerUser).map((target) =>
        `mkdir -p ${target.home}` +
        ` && echo '${b64}' | base64 -d > ${target.home}/.hapi-env && chmod 600 ${target.home}/.hapi-env` +
        ` && chown ${target.owner} ${target.home}/.hapi-env` +
        ` && grep -q '.hapi-env' ${target.home}/.bashrc 2>/dev/null || echo '. ${target.home}/.hapi-env' >> ${target.home}/.bashrc` +
        ` && ([ -f ${target.home}/.zshrc ] && grep -q '.hapi-env' ${target.home}/.zshrc 2>/dev/null || echo '. ${target.home}/.hapi-env' >> ${target.home}/.zshrc)`
    ).join(' && ')
    await params.runtime.exec({
        containerId: params.containerId,
        user: 'root',
        command: ['sh', '-c', profileTargets]
    }).catch(() => undefined)
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
    onLifecyclePhase?: (phase: string, progress?: number, status?: string) => void
}): Promise<DaemonSessionResult> {
    const containerUser = resolveContainerUser(params.environment?.environment?.user)
    const containerHome = resolveContainerHome(containerUser)
    const callbackUrl = params.controlPort
        ? `http://host.docker.internal:${params.controlPort}`
        : undefined
    let checkpointImage: string | undefined = params.options.checkpointId
        ? `haqi-checkpoint:${params.options.checkpointId}`
        : undefined

    // Try to find an existing running container for this workspace
    const workspaceId = params.workspace.workspaceId
    const existingContainerId = workspaceId
        ? await params.runtime.findContainerByLabel('haqi.workspace_id', workspaceId)
        : null

    let containerId: string
    let authToken: string
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
                        const pathSource = params.workspace.source?.type === 'path'
                            ? params.workspace.source
                            : null
                        if (!checkpointImage && params.repositorySource) {
                            params.onLifecyclePhase?.('cloning-repo', 30)
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
                        } else if (pathSource && !checkpointImage) {
                            if (!pathSource.directory) {
                                throw new Error('Path workspace source is missing directory')
                            }
                            params.onLifecyclePhase?.('syncing-path-workspace', 30)
                            await syncPathWorkspaceInContainer({
                                runtime: params.runtime,
                                containerId,
                                workspace: params.workspace,
                                sourceDirectory: pathSource.directory,
                                user: containerUser,
                                home: containerHome
                            })
                        }
                        if (!checkpointImage) {
                            const workspaceEnvironment = await loadWorkspaceEnvironmentTemplateInContainer({
                                runtime: params.runtime,
                                containerId,
                                searchRoots: [
                                    params.workspace.workingDirectory,
                                    params.workspace.repoVolumePath
                                ],
                                user: containerUser,
                                home: containerHome
                            })
                            if (workspaceEnvironment) {
                                params.workspace.environment = workspaceEnvironment
                                params.environment = resolveEnvironmentTemplate({
                                    runtimeKind: params.environment?.runtimeKind ?? 'daemon-session',
                                    environmentId: params.options.environmentId,
                                    environment: params.options.environment,
                                    resolvedEnvironment: params.options.resolvedEnvironment,
                                    workspaceEnvironment,
                                    workspaceSource: params.workspace.source,
                                    workspacePath: params.workspace.workingDirectory
                                })
                            }
                        }
                        const bootstrapEnv = await loadContainerBootstrapEnv({
                            runtime: params.runtime,
                            containerId,
                            workspace: params.workspace,
                            environment: params.environment,
                            user: containerUser,
                            home: containerHome
                        })
                        await writeShellProfileEnv({
                            runtime: params.runtime,
                            containerId,
                            containerUser,
                            env: bootstrapEnv
                        })
                        const innerServiceOrchestrator = new InnerDockerServiceOrchestrator(params.runtime, containerId, containerUser, containerHome)
                        const startedServices = await innerServiceOrchestrator.startServices({
                            services: params.environment?.services ?? [],
                            sessionId: params.sessionLabel,
                            workspaceDir: params.workspace.workingDirectory
                        })
                        const serviceEndpoints = innerServiceOrchestrator.collectServiceEndpoints(startedServices)
                        const servicePreviewTargets = startedServices.flatMap((service) => service.previews)
                        const workspacePreviewTargets = buildWorkspacePreviewTargets(containerId, params.environment)
                        const previewTargets = mergePreviewTargets(
                            workspacePreviewTargets,
                            servicePreviewTargets.length > 0 ? servicePreviewTargets : undefined
                        )
                        const executionEnv = {
                            ...params.env,
                            ...bootstrapEnv,
                            ...Object.assign({}, ...startedServices.map((service) => service.env)),
                            ...(serviceEndpoints.length > 0 ? { HAPI_SERVICE_ENDPOINTS_JSON: JSON.stringify(serviceEndpoints) } : {}),
                            ...(previewTargets ? { HAPI_PREVIEW_TARGETS_JSON: JSON.stringify(previewTargets) } : {})
                        }
                        params.onLifecyclePhase?.('configuring-git-identity', 60)
                        await configureGitIdentity({
                            client,
                            cwd: params.workspace.workingDirectory,
                            env: executionEnv,
                            identity: params.options.gitIdentity
                        })
                        params.onLifecyclePhase?.('running-install', 65)
                        await runPrepareCommands({
                            client,
                            commands: params.environment?.environment?.install,
                            cwd: params.workspace.workingDirectory,
                            env: executionEnv
                        })
                        params.onLifecyclePhase?.('running-start', 75)
                        await runPrepareCommands({
                            client,
                            commands: params.environment?.environment?.start,
                            cwd: params.workspace.workingDirectory,
                            env: executionEnv
                        })
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
                        const spawnEnv = buildDaemonSessionEnv({
                            baseEnv: executionEnv,
                            containerId,
                            containerUser,
                            containerHome,
                            callbackUrl,
                            callbackToken: params.callbackToken,
                            workspacePath: params.workspace.workingDirectory,
                            options: params.options,
                            hostCredentials: reattachCreds.env
                        })
                        const spawnResponse = await client.spawn({
                            command: ['haqi', ...spawnArgs],
                            cwd: params.workspace.workingDirectory,
                            user: containerUser,
                            env: spawnEnv
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
                            reused: true,
                            previewTargets,
                            serviceHandles: startedServices.map((service) => service.handle),
                            serviceEndpoints
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
    try {
        const inspect = await params.runtime.inspect(containerId)
        const mappedPort = inspect.portBindings[DAEMON_PORT]
        if (!mappedPort) {
            throw new Error(`Daemon port ${DAEMON_PORT} not found in container port bindings`)
        }
        const noVncPort = inspect.portBindings[6080] ?? undefined

        const daemonUrl = `http://127.0.0.1:${mappedPort}`
        const client = new DaemonClient(daemonUrl, authToken)

        await client.waitReady(30_000)

        if (!checkpointImage) {
            const { injectHostCredentialsIntoContainer } = await import('@/cloud/credentials/hostCredentials')
            await injectHostCredentialsIntoContainer(containerId, containerUser).catch((err) => {
                console.warn('[DaemonSessionExecutor] Credential injection failed:', err)
            })
        }

        const pathSource = params.workspace.source?.type === 'path'
            ? params.workspace.source
            : null

        if (!checkpointImage && params.repositorySource) {
            params.onLifecyclePhase?.('cloning-repo', 30)
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
        } else if (!checkpointImage && pathSource) {
            if (!pathSource.directory) {
                throw new Error('Path workspace source is missing directory')
            }
            params.onLifecyclePhase?.('syncing-path-workspace', 30)
            await syncPathWorkspaceInContainer({
                runtime: params.runtime,
                containerId,
                workspace: params.workspace,
                sourceDirectory: pathSource.directory,
                user: containerUser,
                home: containerHome
            })
        }
        if (!checkpointImage) {
            const workspaceEnvironment = await loadWorkspaceEnvironmentTemplateInContainer({
                runtime: params.runtime,
                containerId,
                searchRoots: [
                    params.workspace.workingDirectory,
                    params.workspace.repoVolumePath
                ],
                user: containerUser,
                home: containerHome
            })
            if (workspaceEnvironment) {
                params.workspace.environment = workspaceEnvironment
                params.environment = resolveEnvironmentTemplate({
                    runtimeKind: params.environment?.runtimeKind ?? 'daemon-session',
                    environmentId: params.options.environmentId,
                    environment: params.options.environment,
                    resolvedEnvironment: params.options.resolvedEnvironment,
                    workspaceEnvironment,
                    workspaceSource: params.workspace.source,
                    workspacePath: params.workspace.workingDirectory
                })
            }
        }

        const bootstrapEnv = await loadContainerBootstrapEnv({
            runtime: params.runtime,
            containerId,
            workspace: params.workspace,
            environment: params.environment,
            user: containerUser,
            home: containerHome
        })
        await writeShellProfileEnv({
            runtime: params.runtime,
            containerId,
            containerUser,
            env: bootstrapEnv
        })
        const innerServiceOrchestrator = new InnerDockerServiceOrchestrator(params.runtime, containerId, containerUser, containerHome)
        const startedServices = await innerServiceOrchestrator.startServices({
            services: params.environment?.services ?? [],
            sessionId: params.sessionLabel,
            workspaceDir: params.workspace.workingDirectory
        })
        const serviceEnv = Object.assign({}, ...startedServices.map((service) => service.env))
        const serviceEndpoints = innerServiceOrchestrator.collectServiceEndpoints(startedServices)
        const servicePreviewTargets = startedServices.flatMap((service) => service.previews)
        const previewTargets = mergePreviewTargets(
            container.previewTargets,
            servicePreviewTargets.length > 0 ? servicePreviewTargets : undefined
        )
        const executionEnv = {
            ...params.env,
            ...bootstrapEnv,
            ...serviceEnv,
            ...(serviceEndpoints.length > 0 ? { HAPI_SERVICE_ENDPOINTS_JSON: JSON.stringify(serviceEndpoints) } : {}),
            ...(previewTargets ? { HAPI_PREVIEW_TARGETS_JSON: JSON.stringify(previewTargets) } : {})
        }

        params.onLifecyclePhase?.('configuring-git-identity', 60)
        await configureGitIdentity({
            client,
            cwd: params.workspace.workingDirectory,
            env: executionEnv,
            identity: params.options.gitIdentity
        })
        params.onLifecyclePhase?.('running-install', 65)
        await runPrepareCommands({
            client,
            commands: params.environment?.environment?.install,
            cwd: params.workspace.workingDirectory,
            env: executionEnv
        })
        params.onLifecyclePhase?.('running-start', 75)
        await runPrepareCommands({
            client,
            commands: params.environment?.environment?.start,
            cwd: params.workspace.workingDirectory,
            env: executionEnv
        })

        const spawnArgs = buildSpawnArgs(params.options)
        const hostCreds = collectHostCredentials()
        const spawnEnv = buildDaemonSessionEnv({
            baseEnv: executionEnv,
            containerId,
            containerUser,
            containerHome,
            callbackUrl,
            callbackToken: params.callbackToken,
            workspacePath: params.workspace.workingDirectory,
            noVncPort,
            options: params.options,
            hostCredentials: hostCreds.env
        })
        const spawnResponse = await client.spawn({
            command: ['haqi', ...spawnArgs],
            cwd: params.workspace.workingDirectory,
            user: containerUser,
            env: spawnEnv
        })

        if (spawnResponse.status === 'failed') {
            await innerServiceOrchestrator.stopServices(startedServices).catch(() => undefined)
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
            reused: false,
            previewTargets,
            serviceHandles: startedServices.map((service) => service.handle),
            serviceEndpoints
        }
    } catch (error) {
        await params.runtime.remove(containerId).catch(() => undefined)
        throw error
    }
}
