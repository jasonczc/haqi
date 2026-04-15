import { createHash } from 'node:crypto'
import os from 'node:os'
import { join } from 'node:path'
import type {
    CloudWorkspace,
    CloudWorkspaceLease,
    EnvironmentTemplate,
    MachineSpawnRequest,
    WorkspaceMode,
    WorkspaceSource
} from '@hapi/protocol/types'
import {
    resolveManagedWorkspaceBranch,
    resolveWorkspaceSourceWithEnvironment
} from '@hapi/protocol'
import { CloudWorkspaceLeaseSchema, CloudWorkspaceSchema } from '@hapi/protocol/schemas'
import type { Store } from '../store'

type AvailabilityCheck = (machineId: string) => boolean

function normalizeWorkspaceMode(request: MachineSpawnRequest): WorkspaceMode {
    if (request.workspace?.mode === 'persistent' || request.persistentWorkspace === true) {
        return 'persistent'
    }
    if (request.workspace?.mode === 'snapshot-derived') {
        return 'snapshot-derived'
    }
    return 'ephemeral'
}

function normalizeWorkspaceSource(
    request: MachineSpawnRequest,
    environment?: EnvironmentTemplate
): WorkspaceSource | undefined {
    if (request.directory) {
        return {
            type: 'path',
            directory: request.directory
        }
    }
    return resolveWorkspaceSourceWithEnvironment({
        workspaceSource: request.workspaceSource,
        environment
    })
}

function normalizeRefKey(request: MachineSpawnRequest): Record<string, string | undefined> {
    const ref = request.workspaceSource?.repository?.ref
    return {
        branch: ref?.branch?.trim() || undefined,
        tag: ref?.tag?.trim() || undefined,
        commit: ref?.commit?.trim() || undefined,
        pr: ref?.pr?.trim() || undefined
    }
}

function buildWorkspaceReuseKey(
    namespace: string,
    request: MachineSpawnRequest,
    environmentId: string | undefined,
    environment?: EnvironmentTemplate
): string | null {
    const mode = normalizeWorkspaceMode(request)
    if (mode !== 'persistent') {
        return null
    }

    const source = normalizeWorkspaceSource(request, environment)
    if (!source) {
        return null
    }

    const payload = {
        namespace,
        mode,
        source,
        ref: normalizeRefKey(request),
        checkpointId: request.checkpointId?.trim() || request.environment?.runtime?.checkpointId?.trim() || null,
        environmentId: environmentId ?? request.environmentId ?? request.environment?.id ?? null,
        workspaceName: request.workspace?.name?.trim() || null
    }
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    return `persistent:${digest}`
}

function resolveWorkspaceBaseDir(request: MachineSpawnRequest): string {
    // Use /tmp on macOS instead of os.tmpdir() (/var/folders/...) because
    // Docker Desktop only shares /tmp (/private/tmp), not /var/folders.
    const defaultBase = process.platform === 'darwin' ? '/tmp' : os.tmpdir()
    return request.workspace?.baseDir?.trim() || join(defaultBase, 'haqi-cloud-workspaces')
}

function buildWorkspaceRoot(request: MachineSpawnRequest, workspaceId: string, workspaceKey: string | null): string {
    const baseDir = resolveWorkspaceBaseDir(request)
    const name = request.workspace?.name?.trim() || workspaceKey || workspaceId
    return join(baseDir, name)
}

function buildRepoVolumePath(request: MachineSpawnRequest, workspaceId: string, workspaceKey: string | null): string {
    return join(buildWorkspaceRoot(request, workspaceId, workspaceKey), 'repo')
}

function buildDesktopStateVolumePath(request: MachineSpawnRequest, workspaceId: string, workspaceKey: string | null): string {
    return join(buildWorkspaceRoot(request, workspaceId, workspaceKey), '.haqi-desktop')
}

function buildWorkspaceBranch(request: MachineSpawnRequest, environment: EnvironmentTemplate | undefined, workspaceId: string): string | undefined {
    const source = normalizeWorkspaceSource(request, environment)
    return resolveManagedWorkspaceBranch({
        requestId: workspaceId,
        repository: source?.repository,
        worktreeName: request.worktreeName,
        initialPrompt: request.initialPrompt
    })
}

function toCloudWorkspace(value: ReturnType<Store['cloud']['getWorkspace']> extends infer T ? NonNullable<T> : never): CloudWorkspace {
    return CloudWorkspaceSchema.parse({
        id: value.id,
        namespace: value.namespace,
        machineId: value.machineId ?? undefined,
        key: value.key ?? undefined,
        name: value.name ?? undefined,
        mode: value.mode ?? undefined,
        status: value.status,
        source: value.source ?? undefined,
        path: value.path ?? undefined,
        repoVolumePath: value.repoVolumePath ?? undefined,
        desktopStateVolumePath: value.desktopStateVolumePath ?? undefined,
        environmentId: value.environmentId ?? undefined,
        environmentVersion: value.environmentVersion ?? undefined,
        environment: value.environment ?? undefined,
        checkpointId: value.checkpointId ?? undefined,
        workspaceBranch: value.workspaceBranch ?? undefined,
        repoStatus: value.repoStatus ?? undefined,
        desktopState: value.desktopState ?? undefined,
        reused: value.reused || undefined,
        lastLeaseId: value.lastLeaseId ?? undefined,
        lastUsedAt: value.lastUsedAt ?? undefined,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        error: value.error ?? undefined
    })
}

function toCloudWorkspaceLease(value: ReturnType<Store['cloud']['getWorkspaceLease']> extends infer T ? NonNullable<T> : never): CloudWorkspaceLease {
    return CloudWorkspaceLeaseSchema.parse({
        id: value.id,
        namespace: value.namespace,
        workspaceId: value.workspaceId,
        requestId: value.requestId ?? undefined,
        machineId: value.machineId,
        sessionId: value.sessionId ?? undefined,
        status: value.status,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        expiresAt: value.expiresAt ?? undefined,
        releasedAt: value.releasedAt ?? undefined
    })
}

export class WorkspaceManager {
    constructor(
        private readonly store: Store,
        private readonly isMachineAvailable: AvailabilityCheck
    ) {
    }

    expireLeases(now: number = Date.now()): number {
        return this.store.cloud.expireWorkspaceLeases(now)
    }

    getPinnedWorkspace(
        namespace: string,
        request: MachineSpawnRequest,
        environmentId?: string,
        environment?: EnvironmentTemplate
    ): CloudWorkspace | null {
        const key = buildWorkspaceReuseKey(namespace, request, environmentId, environment)
        if (!key) {
            return null
        }

        const existing = this.store.cloud.getWorkspaceByKey(namespace, key)
        if (!existing) {
            return null
        }
        return existing.status === 'failed' ? null : toCloudWorkspace(existing)
    }

    acquireWorkspace(options: {
        namespace: string
        machineId: string
        requestId: string
        request: MachineSpawnRequest
        environment?: EnvironmentTemplate
    }): {
        workspace: CloudWorkspace
        lease: CloudWorkspaceLease
        reused: boolean
        workspaceKey: string | null
    } {
        const mode = normalizeWorkspaceMode(options.request)
        const environmentId = options.environment?.id ?? options.request.environmentId
        const environmentVersion = options.environment?.version
        const source = normalizeWorkspaceSource(options.request, options.environment)
        const workspaceKey = buildWorkspaceReuseKey(options.namespace, options.request, environmentId, options.environment)
        const checkpointId = options.request.checkpointId?.trim()
            || options.environment?.runtime?.checkpointId?.trim()
            || options.environment?.runtime?.image?.trim()
            || null
        const expiresAt = options.request.ttlMinutes
            ? Date.now() + options.request.ttlMinutes * 60_000
            : null

        const existing = workspaceKey
            ? this.store.cloud.getWorkspaceByKey(options.namespace, workspaceKey)
            : null

        if (existing) {
            if (!existing.machineId || existing.machineId !== options.machineId || !this.isMachineAvailable(existing.machineId)) {
                throw new Error('workspace_worker_unavailable')
            }

            const lease = this.store.cloud.createWorkspaceLease({
                namespace: options.namespace,
                workspaceId: existing.id,
                requestId: options.requestId,
                machineId: existing.machineId,
                status: 'active',
                expiresAt
            })
            const workspace = this.store.cloud.updateWorkspace({
                id: existing.id,
                namespace: options.namespace,
                status: 'leased',
                machineId: existing.machineId,
                checkpointId,
                lastLeaseId: lease.id,
                reused: true
            })
            if (!workspace) {
                throw new Error('Failed to update workspace lease state')
            }
            return {
                workspace: toCloudWorkspace(workspace),
                lease: toCloudWorkspaceLease(lease),
                reused: true,
                workspaceKey
            }
        }

        const workspace = this.store.cloud.createWorkspace({
            namespace: options.namespace,
            machineId: options.machineId,
            key: workspaceKey,
            name: options.request.workspace?.name,
            mode,
            status: 'creating',
            source,
            path: buildRepoVolumePath(options.request, options.requestId, workspaceKey),
            repoVolumePath: buildRepoVolumePath(options.request, options.requestId, workspaceKey),
            desktopStateVolumePath: buildDesktopStateVolumePath(options.request, options.requestId, workspaceKey),
            environmentId,
            environmentVersion,
            environment: options.environment,
            checkpointId,
            workspaceBranch: buildWorkspaceBranch(options.request, options.environment, options.requestId),
            repoStatus: 'clean',
            reused: false
        })
        const lease = this.store.cloud.createWorkspaceLease({
            namespace: options.namespace,
            workspaceId: workspace.id,
            requestId: options.requestId,
            machineId: options.machineId,
            status: 'active',
            expiresAt
        })
        const leasedWorkspace = this.store.cloud.updateWorkspace({
            id: workspace.id,
            namespace: options.namespace,
            status: 'leased',
            lastLeaseId: lease.id,
            machineId: options.machineId,
            reused: false
        })
        if (!leasedWorkspace) {
            throw new Error('Failed to acquire workspace')
        }
        return {
            workspace: toCloudWorkspace(leasedWorkspace),
            lease: toCloudWorkspaceLease(lease),
            reused: false,
            workspaceKey
        }
    }

    markWorkspaceReady(options: {
        namespace: string
        workspaceId: string
        machineId: string
        path?: string | null
        repoVolumePath?: string | null
        desktopStateVolumePath?: string | null
        environment?: EnvironmentTemplate
        environmentId?: string
        environmentVersion?: string
        checkpointId?: string
        workspaceBranch?: string
        repoStatus?: CloudWorkspace['repoStatus']
        desktopState?: CloudWorkspace['desktopState']
        reused?: boolean
    }): CloudWorkspace | null {
        const updated = this.store.cloud.updateWorkspace({
            id: options.workspaceId,
            namespace: options.namespace,
            status: 'ready',
            machineId: options.machineId,
            path: options.path,
            repoVolumePath: options.repoVolumePath,
            desktopStateVolumePath: options.desktopStateVolumePath,
            environment: options.environment,
            environmentId: options.environmentId,
            environmentVersion: options.environmentVersion,
            checkpointId: options.checkpointId,
            workspaceBranch: options.workspaceBranch,
            repoStatus: options.repoStatus,
            desktopState: options.desktopState,
            reused: options.reused
        })
        return updated ? toCloudWorkspace(updated) : null
    }

    markWorkspaceFailed(options: {
        namespace: string
        workspaceId: string
        error: unknown
    }): CloudWorkspace | null {
        const updated = this.store.cloud.updateWorkspace({
            id: options.workspaceId,
            namespace: options.namespace,
            status: 'failed',
            error: options.error
        })
        return updated ? toCloudWorkspace(updated) : null
    }

    releaseLease(options: {
        namespace: string
        leaseId: string
        workspaceId: string
        sessionId?: string | null
        workspaceStatus?: 'ready' | 'released' | 'expired' | 'failed'
    }): CloudWorkspaceLease | null {
        const lease = this.store.cloud.updateWorkspaceLease({
            id: options.leaseId,
            namespace: options.namespace,
            sessionId: options.sessionId,
            status: options.workspaceStatus === 'expired' ? 'expired' : 'released',
            releasedAt: Date.now()
        })
        if (!lease) {
            return null
        }
        const nextWorkspaceStatus = options.workspaceStatus ?? 'ready'
        this.store.cloud.updateWorkspace({
            id: options.workspaceId,
            namespace: options.namespace,
            status: nextWorkspaceStatus
        })
        return toCloudWorkspaceLease(lease)
    }
}

export function getWorkspaceModeForRequest(request: MachineSpawnRequest): WorkspaceMode {
    return normalizeWorkspaceMode(request)
}
