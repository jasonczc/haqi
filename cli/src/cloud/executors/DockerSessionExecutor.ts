import type { ChildProcess } from 'node:child_process'
import type { PreviewTarget } from '@hapi/protocol/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { runDockerCommand } from '@/cloud/docker/dockerCli'
import type { PreparedWorkspace, ResolvedEnvironmentTemplate } from '@/cloud/types'
import { buildSpawnArgs } from '@/cloud/executors/HostProcessExecutor'
import { collectHostCredentials, injectHostCredentialsIntoContainer } from '@/cloud/credentials/hostCredentials'
import { ensureWorkspaceContainer } from './WorkspaceContainerManager'

function rewriteHubUrlForContainer(url: string | undefined): string {
    if (!url) return ''
    return url.replace('://localhost', '://host.docker.internal').replace('://127.0.0.1', '://host.docker.internal')
}

// Start the VNC stack inside the container so the Desktop tab can connect.
// daemon-session gets this for free (haqi-daemon launches DesktopManager on boot);
// docker-session runs sh + keepalive, so we have to start it ourselves.
// Each process is launched with `docker exec -d` so it survives past our exec call.
async function startVncStackInContainer(runtime: DockerCliRuntime, containerId: string): Promise<void> {
    // Idempotent: bail if Xtigervnc is already running.
    const alreadyRunning = await runtime.exec({
        containerId,
        command: ['sh', '-lc', 'pgrep -x Xtigervnc >/dev/null']
    }).then(() => true).catch(() => false)
    if (alreadyRunning) return

    try {
        // 1. Xtigervnc — combined X server + VNC server on display :1
        await runtime.exec({
            containerId,
            detach: true,
            command: [
                'Xtigervnc', ':1',
                '-geometry', '1280x720',
                '-depth', '24',
                '-rfbport', '5901',
                '-SecurityTypes', 'None',
                '-AlwaysShared',
                '-AcceptKeyEvents',
                '-AcceptPointerEvents'
            ]
        })

        // Wait for X to be ready before attaching XFCE — otherwise startxfce4 dies.
        await runtime.exec({
            containerId,
            command: ['sh', '-lc', 'for i in $(seq 1 30); do xdpyinfo -display :1 >/dev/null 2>&1 && exit 0; sleep 0.1; done; exit 1']
        })

        // 2. XFCE desktop on :1
        await runtime.exec({
            containerId,
            detach: true,
            env: ['DISPLAY=:1'],
            command: ['startxfce4']
        })

        // 3. websockify — bridge VNC (5901) ↔ WebSocket (6080), serve noVNC assets
        await runtime.exec({
            containerId,
            detach: true,
            command: ['websockify', '--web', '/usr/share/novnc', '6080', 'localhost:5901']
        })
    } catch (err) {
        // Non-fatal — the agent can still run without the desktop.
        console.warn('[DockerSessionExecutor] Failed to start VNC stack:', err)
    }
}

export async function startDockerSessionExecutor(params: {
    runtime: DockerCliRuntime
    workspace: PreparedWorkspace
    environment: ResolvedEnvironmentTemplate | null
    env: Record<string, string>
    options: SpawnSessionOptions
    sessionLabel: string
    existingContainerId?: string
    existingPreviewTargets?: PreviewTarget[]
    controlPort?: number
}): Promise<{
    childProcess: ChildProcess
    pid: number
    containerId: string
    runtimeKind: 'docker-session'
    previewTargets: PreviewTarget[]
    noVncPort?: number
}> {
    // Resolve checkpoint image if provided (same logic as DaemonSessionExecutor).
    let checkpointImage: string | undefined = params.options.checkpointId
        ? `haqi-checkpoint:${params.options.checkpointId}`
        : undefined
    if (checkpointImage) {
        try {
            await runDockerCommand(['inspect', '--type=image', checkpointImage])
        } catch {
            checkpointImage = undefined
        }
    }

    const container = params.existingContainerId
        ? {
            containerId: params.existingContainerId,
            previewTargets: params.existingPreviewTargets ?? []
        }
        : await ensureWorkspaceContainer({
            runtime: params.runtime,
            workspace: params.workspace,
            environment: params.environment,
            checkpointImage,
            checkpointId: params.options.checkpointId,
            sessionLabel: params.sessionLabel
        })

    // Bake host credentials into the container filesystem for fresh (non-checkpoint) containers.
    // Checkpoint images already carry baked credentials from their previous save.
    if (!params.existingContainerId && !checkpointImage) {
        await injectHostCredentialsIntoContainer(container.containerId).catch((err) => {
            console.warn('[DockerSessionExecutor] Credential injection failed:', err)
        })
    }

    // Start the VNC stack so the Desktop tab can connect, then capture the
    // dynamically-assigned host port for noVNC (6080 inside the container).
    await startVncStackInContainer(params.runtime, container.containerId)
    const inspect = await params.runtime.inspect(container.containerId).catch(() => null)
    const noVncPort = inspect?.portBindings[6080] ?? undefined

    // Callback URL — container must reach the worker's control server via host.docker.internal.
    const callbackUrl = params.controlPort
        ? `http://host.docker.internal:${params.controlPort}`
        : undefined
    const hostCreds = collectHostCredentials()

    const spawnEnv: Record<string, string> = {
        ...params.env,
        CLI_API_TOKEN: process.env.CLI_API_TOKEN ?? '',
        HAPI_API_URL: rewriteHubUrlForContainer(process.env.HAPI_API_URL),
        HAPI_WORKING_DIRECTORY: params.workspace.workingDirectory,
        HAPI_CONTAINER_ID: container.containerId,
        HAPI_RUNTIME_KIND: 'docker-session',
        ...(callbackUrl ? { HAPI_RUNNER_CALLBACK_URL: callbackUrl } : {}),
        ...(noVncPort ? { HAPI_NOVNC_PORT: String(noVncPort) } : {}),
        ...(params.options.sessionType ? { HAPI_SESSION_TYPE: params.options.sessionType } : {}),
        ...(params.options.initialPrompt ? { HAPI_INITIAL_PROMPT: params.options.initialPrompt } : {}),
        ...hostCreds.env
    }

    const childProcess = params.runtime.spawnExec({
        containerId: container.containerId,
        workingDir: params.workspace.workingDirectory,
        env: Object.entries(spawnEnv).map(([key, value]) => `${key}=${value}`),
        command: ['haqi', ...buildSpawnArgs(params.options)]
    }, {
        stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!childProcess.pid) {
        if (!params.existingContainerId) {
            await params.runtime.remove(container.containerId).catch(() => undefined)
        }
        throw new Error('Failed to spawn docker session executor: no PID returned')
    }

    return {
        childProcess,
        pid: childProcess.pid,
        containerId: container.containerId,
        runtimeKind: 'docker-session',
        previewTargets: container.previewTargets,
        noVncPort
    }
}
