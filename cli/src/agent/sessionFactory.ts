import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import { ApiClient } from '@/api/api'
import type { ApiSessionClient } from '@/api/apiSession'
import type { AgentState, MachineMetadata, Metadata, Session } from '@/api/types'
import { notifyRunnerSessionStarted } from '@/runner/controlClient'
import { readSettings } from '@/persistence'
import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'
import { runtimePath } from '@/projectPath'
import { readWorktreeEnv } from '@/utils/worktreeEnv'
import packageJson from '../../package.json'

export type SessionStartedBy = 'runner' | 'terminal'

export type SessionBootstrapOptions = {
    flavor: string
    startedBy?: SessionStartedBy
    workingDirectory?: string
    tag?: string
    agentState?: AgentState | null
    spawnRequestId?: string
    workspaceId?: string
    checkpointId?: string
    launchMode?: Metadata['launchMode']
    repoSyncPolicy?: Metadata['repoSyncPolicy']
    repoSyncStatus?: Metadata['repoSyncStatus']
    workspaceBranch?: string
    containerId?: string
    runtimeKind?: Metadata['runtimeKind']
    executionBackend?: Metadata['executionBackend']
    environmentId?: string
    environmentVersion?: string
    repositoryUrl?: string
    repositoryProvider?: string
    repositoryRef?: Metadata['repositoryRef']
    repositoryCommit?: string
    workspaceSource?: Metadata['workspaceSource']
    workspaceMode?: Metadata['workspaceMode']
    serviceEndpoints?: Metadata['serviceEndpoints']
    desktopState?: Metadata['desktopState']
    languageServers?: Metadata['languageServers']
    terminalDescriptors?: Metadata['terminalDescriptors']
    setupStatus?: Metadata['setupStatus']
    previewUrls?: Metadata['previewUrls']
}

export type SessionBootstrapResult = {
    api: ApiClient
    session: ApiSessionClient
    sessionInfo: Session
    metadata: Metadata
    machineId: string
    startedBy: SessionStartedBy
    workingDirectory: string
}

export function buildMachineMetadata(): MachineMetadata {
    return {
        host: process.env.HAPI_HOSTNAME || os.hostname(),
        platform: os.platform(),
        happyCliVersion: packageJson.version,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir: runtimePath()
    }
}

export function buildSessionMetadata(options: {
    flavor: string
    startedBy: SessionStartedBy
    workingDirectory: string
    machineId: string
    now?: number
    spawnRequestId?: string
    workspaceId?: string
    checkpointId?: string
    launchMode?: Metadata['launchMode']
    repoSyncPolicy?: Metadata['repoSyncPolicy']
    repoSyncStatus?: Metadata['repoSyncStatus']
    workspaceBranch?: string
    containerId?: string
    runtimeKind?: Metadata['runtimeKind']
    executionBackend?: Metadata['executionBackend']
    environmentId?: string
    environmentVersion?: string
    repositoryUrl?: string
    repositoryProvider?: string
    repositoryRef?: Metadata['repositoryRef']
    repositoryCommit?: string
    workspaceSource?: Metadata['workspaceSource']
    workspaceMode?: Metadata['workspaceMode']
    serviceEndpoints?: Metadata['serviceEndpoints']
    desktopState?: Metadata['desktopState']
    languageServers?: Metadata['languageServers']
    terminalDescriptors?: Metadata['terminalDescriptors']
    setupStatus?: Metadata['setupStatus']
    previewUrls?: Metadata['previewUrls']
}): Metadata {
    const happyLibDir = runtimePath()
    const worktreeInfo = readWorktreeEnv()
    const now = options.now ?? Date.now()

    return {
        path: options.workingDirectory,
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: options.machineId,
        workerId: options.machineId,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir,
        happyToolsDir: resolve(happyLibDir, 'tools', 'unpacked'),
        startedFromRunner: options.startedBy === 'runner',
        hostPid: options.runtimeKind === 'docker-session' ? undefined : process.pid,
        startedBy: options.startedBy,
        lifecycleState: 'running',
        lifecycleStateSince: now,
        flavor: options.flavor,
        worktree: worktreeInfo ?? undefined,
        spawnRequestId: options.spawnRequestId,
        workspaceId: options.workspaceId,
        workspaceSource: options.workspaceSource,
        checkpointId: options.checkpointId,
        launchMode: options.launchMode,
        repoSyncPolicy: options.repoSyncPolicy,
        repoSyncStatus: options.repoSyncStatus,
        workspaceBranch: options.workspaceBranch,
        containerId: options.containerId,
        runtimeKind: options.runtimeKind,
        executionBackend: options.executionBackend,
        environmentId: options.environmentId,
        environmentVersion: options.environmentVersion,
        repositoryUrl: options.repositoryUrl,
        repositoryProvider: options.repositoryProvider,
        repositoryRef: options.repositoryRef,
        repositoryCommit: options.repositoryCommit,
        workspaceMode: options.workspaceMode,
        serviceEndpoints: options.serviceEndpoints,
        desktopState: options.desktopState,
        languageServers: options.languageServers,
        terminalDescriptors: options.terminalDescriptors,
        setupStatus: options.setupStatus,
        previewUrls: options.previewUrls
    }
}

async function getMachineIdOrExit(): Promise<string> {
    const settings = await readSettings()
    const machineId = settings?.machineId
    if (!machineId) {
        console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on ${packageJson.bugs}`)
        process.exit(1)
    }
    logger.debug(`Using machineId: ${machineId}`)
    return machineId
}

async function reportSessionStarted(sessionId: string, metadata: Metadata): Promise<void> {
    try {
        logger.debug(`[START] Reporting session ${sessionId} to runner`)
        const result = await notifyRunnerSessionStarted(sessionId, metadata)
        if (result?.error) {
            logger.debug(`[START] Failed to report to runner (may not be running):`, result.error)
        } else {
            logger.debug(`[START] Reported session ${sessionId} to runner`)
        }
    } catch (error) {
        logger.debug('[START] Failed to report to runner (may not be running):', error)
    }
}

export async function bootstrapSession(options: SessionBootstrapOptions): Promise<SessionBootstrapResult> {
    const workingDirectory = options.workingDirectory ?? process.cwd()
    const startedBy = options.startedBy ?? 'terminal'
    const sessionTag = options.tag ?? randomUUID()
    const agentState = options.agentState === undefined ? {} : options.agentState
    const spawnRequestId = options.spawnRequestId ?? process.env.HAPI_SPAWN_REQUEST_ID
    const workspaceId = options.workspaceId ?? process.env.HAPI_WORKSPACE_ID
    const checkpointId = options.checkpointId ?? process.env.HAPI_CHECKPOINT_ID
    const launchMode = options.launchMode ?? (
        process.env.HAPI_LAUNCH_MODE === 'interactive' || process.env.HAPI_LAUNCH_MODE === 'background'
            ? process.env.HAPI_LAUNCH_MODE
            : undefined
    )
    const repoSyncPolicy = options.repoSyncPolicy ?? (
        process.env.HAPI_REPO_SYNC_POLICY === 'fetch-reset'
            ? process.env.HAPI_REPO_SYNC_POLICY
            : undefined
    )
    const repoSyncStatus = options.repoSyncStatus ?? (() => {
        const raw = process.env.HAPI_REPO_SYNC_STATUS
        return raw === 'clean' || raw === 'dirty' || raw === 'diverged' ? raw : undefined
    })()
    const workspaceBranch = options.workspaceBranch ?? process.env.HAPI_WORKSPACE_BRANCH
    const containerId = options.containerId ?? process.env.HAPI_CONTAINER_ID
    const runtimeKind = options.runtimeKind ?? (
        process.env.HAPI_RUNTIME_KIND === 'docker-session' || process.env.HAPI_RUNTIME_KIND === 'host-process' || process.env.HAPI_RUNTIME_KIND === 'daemon-session'
            ? process.env.HAPI_RUNTIME_KIND
            : undefined
    )
    const executionBackend = options.executionBackend ?? (
        process.env.HAPI_EXECUTION_BACKEND === 'local'
            || process.env.HAPI_EXECUTION_BACKEND === 'cloud-self-hosted'
            || process.env.HAPI_EXECUTION_BACKEND === 'cloud-managed'
            ? process.env.HAPI_EXECUTION_BACKEND
            : undefined
    )
    const environmentId = options.environmentId ?? process.env.HAPI_ENVIRONMENT_ID
    const environmentVersion = options.environmentVersion ?? process.env.HAPI_ENVIRONMENT_VERSION
    const repositoryUrl = options.repositoryUrl ?? process.env.HAPI_REPOSITORY_URL
    const repositoryProvider = options.repositoryProvider ?? process.env.HAPI_REPOSITORY_PROVIDER
    const repositoryCommit = options.repositoryCommit ?? process.env.HAPI_REPOSITORY_COMMIT
    const workspaceSource = options.workspaceSource ?? (() => {
        const raw = process.env.HAPI_WORKSPACE_SOURCE_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return parsed && typeof parsed === 'object' ? parsed as Metadata['workspaceSource'] : undefined
        } catch {
            return undefined
        }
    })()
    const workspaceMode = options.workspaceMode ?? (() => {
        const raw = process.env.HAPI_WORKSPACE_MODE
        if (raw === 'ephemeral' || raw === 'persistent' || raw === 'snapshot-derived') {
            return raw
        }
        return undefined
    })()
    const repositoryRef = options.repositoryRef ?? (() => {
        const branch = process.env.HAPI_REPOSITORY_BRANCH?.trim()
        const tag = process.env.HAPI_REPOSITORY_TAG?.trim()
        const commit = process.env.HAPI_REPOSITORY_COMMIT?.trim()
        const pr = process.env.HAPI_REPOSITORY_PR?.trim()
        if (!branch && !tag && !commit && !pr) {
            return undefined
        }
        return {
            branch: branch || undefined,
            tag: tag || undefined,
            commit: commit || undefined,
            pr: pr || undefined
        }
    })()
    const serviceEndpoints = options.serviceEndpoints ?? (() => {
        const raw = process.env.HAPI_SERVICE_ENDPOINTS_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as Metadata['serviceEndpoints'] : undefined
        } catch {
            return undefined
        }
    })()
    const desktopState = options.desktopState ?? (() => {
        const raw = process.env.HAPI_DESKTOP_STATE_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return parsed && typeof parsed === 'object' ? parsed as Metadata['desktopState'] : undefined
        } catch {
            return undefined
        }
    })()
    const languageServers = options.languageServers ?? (() => {
        const raw = process.env.HAPI_LANGUAGE_SERVERS_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as Metadata['languageServers'] : undefined
        } catch {
            return undefined
        }
    })()
    const terminalDescriptors = options.terminalDescriptors ?? (() => {
        const raw = process.env.HAPI_TERMINAL_DESCRIPTORS_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as Metadata['terminalDescriptors'] : undefined
        } catch {
            return undefined
        }
    })()
    const setupStatus = options.setupStatus ?? (() => {
        const raw = process.env.HAPI_SETUP_STATUS_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            if (!parsed || typeof parsed !== 'object') {
                return undefined
            }
            const phase = typeof (parsed as { phase?: unknown }).phase === 'string'
                ? (parsed as { phase: string }).phase
                : undefined
            if (!phase) {
                return undefined
            }
            return {
                phase,
                message: typeof (parsed as { message?: unknown }).message === 'string'
                    ? (parsed as { message: string }).message
                    : undefined,
                updatedAt: typeof (parsed as { updatedAt?: unknown }).updatedAt === 'number'
                    ? (parsed as { updatedAt: number }).updatedAt
                    : Date.now()
            }
        } catch {
            return undefined
        }
    })()
    const previewUrls = options.previewUrls ?? (() => {
        const raw = process.env.HAPI_PREVIEW_TARGETS_JSON
        if (!raw) {
            return undefined
        }
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as Metadata['previewUrls'] : undefined
        } catch {
            return undefined
        }
    })()

    const api = await ApiClient.create()

    const machineId = await getMachineIdOrExit()
    await api.getOrCreateMachine({
        machineId,
        metadata: buildMachineMetadata()
    })

    const metadata = buildSessionMetadata({
        flavor: options.flavor,
        startedBy,
        workingDirectory,
        machineId,
        spawnRequestId,
        workspaceId,
        checkpointId,
        launchMode,
        repoSyncPolicy,
        repoSyncStatus,
        workspaceBranch,
        containerId,
        runtimeKind,
        executionBackend,
        environmentId,
        environmentVersion,
        repositoryUrl,
        repositoryProvider,
        repositoryRef,
        repositoryCommit,
        workspaceSource,
        workspaceMode,
        serviceEndpoints,
        desktopState,
        languageServers,
        terminalDescriptors,
        setupStatus,
        previewUrls
    })

    const sessionInfo = await api.getOrCreateSession({
        tag: sessionTag,
        metadata,
        state: agentState
    })

    const session = api.sessionSyncClient(sessionInfo)

    await reportSessionStarted(sessionInfo.id, metadata)

    return {
        api,
        session,
        sessionInfo,
        metadata,
        machineId,
        startedBy,
        workingDirectory
    }
}
