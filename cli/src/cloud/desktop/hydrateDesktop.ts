import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DesktopHydrationRuntimeState, EnvironmentTemplate } from '@hapi/protocol/types'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import type { DesktopHydrationResult, PreparedWorkspace } from '@/cloud/types'

function now(): number {
    return Date.now()
}

function stateEntry(name: string, status: DesktopHydrationRuntimeState['status'], message?: string): DesktopHydrationRuntimeState {
    return {
        name,
        status,
        message,
        updatedAt: now()
    }
}

function normalizeDesktop(environment: EnvironmentTemplate | undefined): NonNullable<EnvironmentTemplate['desktop']> {
    return {
        terminals: environment?.desktop?.terminals ?? environment?.terminals?.map((terminal) => ({
            name: terminal.name,
            command: terminal.command
        })),
        languageServers: environment?.desktop?.languageServers,
        warmup: environment?.desktop?.warmup,
        statePaths: environment?.desktop?.statePaths
    }
}

async function ensureDesktopStatePaths(params: {
    runtime: DockerCliRuntime
    containerId: string
    workspace: PreparedWorkspace
    statePaths: string[]
    user?: string
}): Promise<void> {
    if (params.statePaths.length === 0) {
        return
    }
    const command = `mkdir -p ${params.statePaths.map((value) => `'${value.replace(/'/g, `'\\''`)}'`).join(' ')}`
    await params.runtime.exec({
        containerId: params.containerId,
        user: params.user,
        workingDir: params.workspace.workingDirectory,
        command: ['sh', '-lc', command]
    })
}

async function runShellInContainer(params: {
    runtime: DockerCliRuntime
    containerId: string
    cwd: string
    env?: Record<string, string>
    user?: string
    command: string
    detach?: boolean
}): Promise<void> {
    await params.runtime.exec({
        containerId: params.containerId,
        user: params.user,
        workingDir: params.cwd,
        env: Object.entries(params.env ?? {}).map(([key, value]) => `${key}=${value}`),
        detach: params.detach,
        command: ['sh', '-lc', params.command]
    })
}

export async function hydrateDesktop(params: {
    runtime: DockerCliRuntime
    containerId: string
    workspace: PreparedWorkspace
    environment: EnvironmentTemplate | undefined
    user?: string
    home?: string
    launchMode?: 'interactive' | 'background'
}): Promise<DesktopHydrationResult> {
    const desktop = normalizeDesktop(params.environment)
    const terminalDescriptors = desktop.terminals ?? []
    const statePaths = desktop.statePaths ?? []
    const warmupCommands = desktop.warmup ?? []
    const languageServers = desktop.languageServers ?? []

    await ensureDesktopStatePaths({
        runtime: params.runtime,
        containerId: params.containerId,
        workspace: params.workspace,
        statePaths,
        user: params.user
    })

    const warmupState: DesktopHydrationRuntimeState[] = []
    for (const command of warmupCommands) {
        await runShellInContainer({
            runtime: params.runtime,
            containerId: params.containerId,
            cwd: command.cwd ?? params.workspace.workingDirectory,
            user: params.user,
            env: {
                ...command.env,
                ...(params.home ? { HOME: params.home } : {}),
                ...(params.user ? { USER: params.user, LOGNAME: params.user } : {})
            },
            command: command.command
        })
        warmupState.push(stateEntry(command.name ?? command.command, 'ready', 'completed'))
    }

    const languageServerState: DesktopHydrationRuntimeState[] = []
    for (const server of languageServers) {
        await runShellInContainer({
            runtime: params.runtime,
            containerId: params.containerId,
            cwd: server.cwd ?? params.workspace.workingDirectory,
            user: params.user,
            env: {
                ...server.env,
                ...(params.home ? { HOME: params.home } : {}),
                ...(params.user ? { USER: params.user, LOGNAME: params.user } : {})
            },
            command: server.command,
            detach: true
        })
        languageServerState.push(stateEntry(server.name, 'ready', server.readyPattern ? `readyPattern:${server.readyPattern}` : 'started'))
    }

    const terminalState = terminalDescriptors.map((terminal) => stateEntry(
        terminal.name,
        params.launchMode === 'background' ? 'pending' : 'ready',
        params.launchMode === 'background' ? 'available for follow-up' : 'ready for attach'
    ))

    const desktopState = {
        status: 'ready' as const,
        phase: 'hydrated',
        terminals: terminalState,
        languageServers: languageServerState,
        warmup: warmupState,
        updatedAt: now()
    }

    if (params.workspace.desktopStatePath) {
        const stateFile = join(params.workspace.desktopStatePath, 'state.json')
        await fs.mkdir(dirname(stateFile), { recursive: true })
        await fs.writeFile(stateFile, JSON.stringify(desktopState, null, 2), 'utf8')
    }

    return {
        desktopState,
        languageServers: languageServerState,
        terminalDescriptors
    }
}
