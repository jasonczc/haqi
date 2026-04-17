import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import type {
    CloudSecretAdapter,
    CloudSpawnPhase,
    CloudWorkspaceLeaseStatus,
    CloudWorkspaceStatus,
    RepoStatus,
    WorkspaceMode
} from '@hapi/protocol/types'

import type {
    StoredCloudSecret,
    StoredCloudSecretAccessEvent,
    StoredCloudSpawnRequest,
    StoredCloudWorkerSessionToken,
    StoredCloudWorkerEnrollmentToken,
    StoredCloudWorkspace,
    StoredCloudWorkspaceLease
} from './types'
import { safeJsonParse } from './json'

type DbCloudSpawnRequestRow = {
    id: string
    namespace: string
    requested_machine_id: string | null
    selected_machine_id: string | null
    phase: CloudSpawnPhase
    request: string
    workspace_id: string | null
    session_id: string | null
    reused_workspace: number
    created_at: number
    updated_at: number
    started_at: number | null
    completed_at: number | null
    error: string | null
}

type DbCloudWorkspaceRow = {
    id: string
    namespace: string
    machine_id: string | null
    workspace_key: string | null
    name: string | null
    mode: WorkspaceMode | null
    status: CloudWorkspaceStatus
    source: string | null
    path: string | null
    repo_volume_path: string | null
    desktop_state_volume_path: string | null
    environment_id: string | null
    environment_version: string | null
    environment: string | null
    checkpoint_id: string | null
    workspace_branch: string | null
    repo_status: RepoStatus | null
    desktop_state: string | null
    reused: number
    last_lease_id: string | null
    last_used_at: number | null
    created_at: number
    updated_at: number
    error: string | null
}

type DbCloudWorkspaceLeaseRow = {
    id: string
    namespace: string
    workspace_id: string
    request_id: string | null
    machine_id: string
    session_id: string | null
    status: CloudWorkspaceLeaseStatus
    created_at: number
    updated_at: number
    expires_at: number | null
    released_at: number | null
}

type DbCloudSecretRow = {
    id: string
    namespace: string
    name: string
    description: string | null
    mount_as: 'env' | 'file' | null
    env_name: string | null
    file_path: string | null
    adapter: CloudSecretAdapter | null
    encrypted_value: string
    created_at: number
    updated_at: number
    last_accessed_at: number | null
}

type DbCloudSecretAccessEventRow = {
    id: string
    namespace: string
    secret_id: string
    secret_name: string
    request_id: string | null
    machine_id: string | null
    session_id: string | null
    created_at: number
}

type DbCloudWorkerEnrollmentTokenRow = {
    id: string
    namespace: string
    label: string | null
    machine_id: string | null
    token_hash: string
    token_preview: string
    created_at: number
    expires_at: number | null
    revoked_at: number | null
}

type DbCloudWorkerSessionTokenRow = {
    id: string
    namespace: string
    machine_id: string | null
    enrollment_token_id: string | null
    token_hash: string
    token_preview: string
    created_at: number
    updated_at: number
    expires_at: number | null
    revoked_at: number | null
    last_used_at: number | null
}

function normalizeOptionalString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toStoredCloudSpawnRequest(row: DbCloudSpawnRequestRow): StoredCloudSpawnRequest {
    return {
        id: row.id,
        namespace: row.namespace,
        requestedMachineId: row.requested_machine_id,
        selectedMachineId: row.selected_machine_id,
        phase: row.phase,
        request: safeJsonParse(row.request),
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        reusedWorkspace: row.reused_workspace === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: safeJsonParse(row.error)
    }
}

function toStoredCloudWorkspace(row: DbCloudWorkspaceRow): StoredCloudWorkspace {
    return {
        id: row.id,
        namespace: row.namespace,
        machineId: row.machine_id,
        key: row.workspace_key,
        name: row.name,
        mode: row.mode,
        status: row.status,
        source: safeJsonParse(row.source),
        path: row.path,
        repoVolumePath: row.repo_volume_path,
        desktopStateVolumePath: row.desktop_state_volume_path,
        environmentId: row.environment_id,
        environmentVersion: row.environment_version,
        environment: safeJsonParse(row.environment),
        checkpointId: row.checkpoint_id,
        workspaceBranch: row.workspace_branch,
        repoStatus: row.repo_status,
        desktopState: safeJsonParse(row.desktop_state) as StoredCloudWorkspace['desktopState'],
        reused: row.reused === 1,
        lastLeaseId: row.last_lease_id,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: safeJsonParse(row.error)
    }
}

function toStoredCloudWorkspaceLease(row: DbCloudWorkspaceLeaseRow): StoredCloudWorkspaceLease {
    return {
        id: row.id,
        namespace: row.namespace,
        workspaceId: row.workspace_id,
        requestId: row.request_id,
        machineId: row.machine_id,
        sessionId: row.session_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        releasedAt: row.released_at
    }
}

function toStoredCloudSecret(row: DbCloudSecretRow): StoredCloudSecret {
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        description: row.description,
        mountAs: row.mount_as,
        envName: row.env_name,
        filePath: row.file_path,
        adapter: row.adapter,
        encryptedValue: row.encrypted_value,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at
    }
}

function toStoredCloudSecretAccessEvent(row: DbCloudSecretAccessEventRow): StoredCloudSecretAccessEvent {
    return {
        id: row.id,
        namespace: row.namespace,
        secretId: row.secret_id,
        secretName: row.secret_name,
        requestId: row.request_id,
        machineId: row.machine_id,
        sessionId: row.session_id,
        createdAt: row.created_at
    }
}

function toStoredCloudWorkerEnrollmentToken(row: DbCloudWorkerEnrollmentTokenRow): StoredCloudWorkerEnrollmentToken {
    return {
        id: row.id,
        namespace: row.namespace,
        label: row.label,
        machineId: row.machine_id,
        tokenHash: row.token_hash,
        tokenPreview: row.token_preview,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at
    }
}

function toStoredCloudWorkerSessionToken(row: DbCloudWorkerSessionTokenRow): StoredCloudWorkerSessionToken {
    return {
        id: row.id,
        namespace: row.namespace,
        machineId: row.machine_id,
        enrollmentTokenId: row.enrollment_token_id,
        tokenHash: row.token_hash,
        tokenPreview: row.token_preview,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        lastUsedAt: row.last_used_at
    }
}

export class CloudStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    createSpawnRequest(options: {
        namespace: string
        requestedMachineId?: string | null
        selectedMachineId?: string | null
        phase: CloudSpawnPhase
        request: unknown
        workspaceId?: string | null
        sessionId?: string | null
        reusedWorkspace?: boolean
        error?: unknown
    }): StoredCloudSpawnRequest {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO cloud_spawn_requests (
                id, namespace, requested_machine_id, selected_machine_id, phase,
                request, workspace_id, session_id, reused_workspace,
                created_at, updated_at, started_at, completed_at, error
            ) VALUES (
                @id, @namespace, @requested_machine_id, @selected_machine_id, @phase,
                @request, @workspace_id, @session_id, @reused_workspace,
                @created_at, @updated_at, NULL, NULL, @error
            )
        `).run({
            id,
            namespace: options.namespace,
            requested_machine_id: normalizeOptionalString(options.requestedMachineId),
            selected_machine_id: normalizeOptionalString(options.selectedMachineId),
            phase: options.phase,
            request: JSON.stringify(options.request ?? {}),
            workspace_id: normalizeOptionalString(options.workspaceId),
            session_id: normalizeOptionalString(options.sessionId),
            reused_workspace: options.reusedWorkspace ? 1 : 0,
            created_at: now,
            updated_at: now,
            error: options.error === undefined ? null : JSON.stringify(options.error)
        })
        return this.getSpawnRequest(id) ?? (() => { throw new Error('Failed to create cloud spawn request') })()
    }

    getSpawnRequest(id: string): StoredCloudSpawnRequest | null {
        const row = this.db.prepare('SELECT * FROM cloud_spawn_requests WHERE id = ?').get(id) as DbCloudSpawnRequestRow | undefined
        return row ? toStoredCloudSpawnRequest(row) : null
    }

    getSpawnRequestByNamespace(id: string, namespace: string): StoredCloudSpawnRequest | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_spawn_requests WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbCloudSpawnRequestRow | undefined
        return row ? toStoredCloudSpawnRequest(row) : null
    }

    listSpawnRequestsByNamespace(namespace: string, limit: number = 50): StoredCloudSpawnRequest[] {
        const rows = this.db.prepare(
            'SELECT * FROM cloud_spawn_requests WHERE namespace = ? ORDER BY updated_at DESC LIMIT ?'
        ).all(namespace, Math.max(1, Math.min(200, Math.floor(limit)))) as DbCloudSpawnRequestRow[]
        return rows.map(toStoredCloudSpawnRequest)
    }

    countActiveSpawnRequestsByMachine(namespace: string, machineId: string): number {
        const row = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM cloud_spawn_requests
            WHERE namespace = ?
              AND selected_machine_id = ?
              AND phase IN (
                'queued',
                'selecting-worker',
                'acquiring-workspace',
                'pulling-checkpoint',
                'creating-container',
                'syncing-repo',
                'hydrating-desktop',
                'preparing-workspace',
                'materializing-secrets',
                'starting-session'
              )
        `).get(namespace, machineId) as { count: number } | undefined
        return row?.count ?? 0
    }

    updateSpawnRequest(options: {
        id: string
        namespace: string
        phase?: CloudSpawnPhase
        selectedMachineId?: string | null
        workspaceId?: string | null
        sessionId?: string | null
        reusedWorkspace?: boolean
        error?: unknown | null
        startedAt?: number | null
        completedAt?: number | null
    }): StoredCloudSpawnRequest | null {
        const existing = this.getSpawnRequestByNamespace(options.id, options.namespace)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_spawn_requests
            SET phase = @phase,
                selected_machine_id = @selected_machine_id,
                workspace_id = @workspace_id,
                session_id = @session_id,
                reused_workspace = @reused_workspace,
                error = @error,
                started_at = @started_at,
                completed_at = @completed_at,
                updated_at = @updated_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id: options.id,
            namespace: options.namespace,
            phase: options.phase ?? existing.phase,
            selected_machine_id: options.selectedMachineId !== undefined
                ? normalizeOptionalString(options.selectedMachineId)
                : existing.selectedMachineId,
            workspace_id: options.workspaceId !== undefined
                ? normalizeOptionalString(options.workspaceId)
                : existing.workspaceId,
            session_id: options.sessionId !== undefined
                ? normalizeOptionalString(options.sessionId)
                : existing.sessionId,
            reused_workspace: options.reusedWorkspace !== undefined
                ? (options.reusedWorkspace ? 1 : 0)
                : (existing.reusedWorkspace ? 1 : 0),
            error: options.error === undefined
                ? (existing.error === null ? null : JSON.stringify(existing.error))
                : (options.error === null ? null : JSON.stringify(options.error)),
            started_at: options.startedAt !== undefined ? options.startedAt : existing.startedAt,
            completed_at: options.completedAt !== undefined ? options.completedAt : existing.completedAt,
            updated_at: Date.now()
        })
        return this.getSpawnRequestByNamespace(options.id, options.namespace)
    }

    createWorkspace(options: {
        namespace: string
        machineId?: string | null
        key?: string | null
        name?: string | null
        mode?: WorkspaceMode | null
        status: CloudWorkspaceStatus
        source?: unknown
        path?: string | null
        repoVolumePath?: string | null
        desktopStateVolumePath?: string | null
        environmentId?: string | null
        environmentVersion?: string | null
        environment?: unknown
        checkpointId?: string | null
        workspaceBranch?: string | null
        repoStatus?: RepoStatus | null
        desktopState?: unknown
        reused?: boolean
        error?: unknown
    }): StoredCloudWorkspace {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO cloud_workspaces (
                id, namespace, machine_id, workspace_key, name, mode, status,
                source, path, repo_volume_path, desktop_state_volume_path,
                environment_id, environment_version, environment, checkpoint_id,
                workspace_branch, repo_status, desktop_state,
                reused, last_lease_id, last_used_at, created_at, updated_at, error
            ) VALUES (
                @id, @namespace, @machine_id, @workspace_key, @name, @mode, @status,
                @source, @path, @repo_volume_path, @desktop_state_volume_path,
                @environment_id, @environment_version, @environment, @checkpoint_id,
                @workspace_branch, @repo_status, @desktop_state,
                @reused, NULL, @last_used_at, @created_at, @updated_at, @error
            )
        `).run({
            id,
            namespace: options.namespace,
            machine_id: normalizeOptionalString(options.machineId),
            workspace_key: normalizeOptionalString(options.key),
            name: normalizeOptionalString(options.name),
            mode: normalizeOptionalString(options.mode),
            status: options.status,
            source: options.source === undefined ? null : JSON.stringify(options.source),
            path: normalizeOptionalString(options.path),
            repo_volume_path: normalizeOptionalString(options.repoVolumePath),
            desktop_state_volume_path: normalizeOptionalString(options.desktopStateVolumePath),
            environment_id: normalizeOptionalString(options.environmentId),
            environment_version: normalizeOptionalString(options.environmentVersion),
            environment: options.environment === undefined ? null : JSON.stringify(options.environment),
            checkpoint_id: normalizeOptionalString(options.checkpointId),
            workspace_branch: normalizeOptionalString(options.workspaceBranch),
            repo_status: options.repoStatus ?? null,
            desktop_state: options.desktopState === undefined ? null : JSON.stringify(options.desktopState),
            reused: options.reused ? 1 : 0,
            last_used_at: now,
            created_at: now,
            updated_at: now,
            error: options.error === undefined ? null : JSON.stringify(options.error)
        })
        return this.getWorkspace(id) ?? (() => { throw new Error('Failed to create cloud workspace') })()
    }

    getWorkspace(id: string): StoredCloudWorkspace | null {
        const row = this.db.prepare('SELECT * FROM cloud_workspaces WHERE id = ?').get(id) as DbCloudWorkspaceRow | undefined
        return row ? toStoredCloudWorkspace(row) : null
    }

    getWorkspaceByNamespace(id: string, namespace: string): StoredCloudWorkspace | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_workspaces WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbCloudWorkspaceRow | undefined
        return row ? toStoredCloudWorkspace(row) : null
    }

    getWorkspaceByKey(namespace: string, key: string): StoredCloudWorkspace | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_workspaces WHERE namespace = ? AND workspace_key = ? LIMIT 1'
        ).get(namespace, key) as DbCloudWorkspaceRow | undefined
        return row ? toStoredCloudWorkspace(row) : null
    }

    listWorkspacesByNamespace(namespace: string, limit: number = 50): StoredCloudWorkspace[] {
        const rows = this.db.prepare(
            'SELECT * FROM cloud_workspaces WHERE namespace = ? ORDER BY updated_at DESC LIMIT ?'
        ).all(namespace, Math.max(1, Math.min(200, Math.floor(limit)))) as DbCloudWorkspaceRow[]
        return rows.map(toStoredCloudWorkspace)
    }

    updateWorkspace(options: {
        id: string
        namespace: string
        machineId?: string | null
        status?: CloudWorkspaceStatus
        path?: string | null
        repoVolumePath?: string | null
        desktopStateVolumePath?: string | null
        environmentId?: string | null
        environmentVersion?: string | null
        environment?: unknown
        checkpointId?: string | null
        workspaceBranch?: string | null
        repoStatus?: RepoStatus | null
        desktopState?: unknown | null
        reused?: boolean
        lastLeaseId?: string | null
        error?: unknown | null
    }): StoredCloudWorkspace | null {
        const existing = this.getWorkspaceByNamespace(options.id, options.namespace)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_workspaces
            SET machine_id = @machine_id,
                status = @status,
                path = @path,
                repo_volume_path = @repo_volume_path,
                desktop_state_volume_path = @desktop_state_volume_path,
                environment_id = @environment_id,
                environment_version = @environment_version,
                environment = @environment,
                checkpoint_id = @checkpoint_id,
                workspace_branch = @workspace_branch,
                repo_status = @repo_status,
                desktop_state = @desktop_state,
                reused = @reused,
                last_lease_id = @last_lease_id,
                last_used_at = @last_used_at,
                error = @error,
                updated_at = @updated_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id: options.id,
            namespace: options.namespace,
            machine_id: options.machineId !== undefined
                ? normalizeOptionalString(options.machineId)
                : existing.machineId,
            status: options.status ?? existing.status,
            path: options.path !== undefined ? normalizeOptionalString(options.path) : existing.path,
            repo_volume_path: options.repoVolumePath !== undefined
                ? normalizeOptionalString(options.repoVolumePath)
                : existing.repoVolumePath,
            desktop_state_volume_path: options.desktopStateVolumePath !== undefined
                ? normalizeOptionalString(options.desktopStateVolumePath)
                : existing.desktopStateVolumePath,
            environment_id: options.environmentId !== undefined
                ? normalizeOptionalString(options.environmentId)
                : existing.environmentId,
            environment_version: options.environmentVersion !== undefined
                ? normalizeOptionalString(options.environmentVersion)
                : existing.environmentVersion,
            environment: options.environment === undefined
                ? (existing.environment === null ? null : JSON.stringify(existing.environment))
                : (options.environment === null ? null : JSON.stringify(options.environment)),
            checkpoint_id: options.checkpointId !== undefined
                ? normalizeOptionalString(options.checkpointId)
                : existing.checkpointId,
            workspace_branch: options.workspaceBranch !== undefined
                ? normalizeOptionalString(options.workspaceBranch)
                : existing.workspaceBranch,
            repo_status: options.repoStatus !== undefined ? options.repoStatus : existing.repoStatus,
            desktop_state: options.desktopState === undefined
                ? (existing.desktopState === null ? null : JSON.stringify(existing.desktopState))
                : (options.desktopState === null ? null : JSON.stringify(options.desktopState)),
            reused: options.reused !== undefined ? (options.reused ? 1 : 0) : (existing.reused ? 1 : 0),
            last_lease_id: options.lastLeaseId !== undefined ? normalizeOptionalString(options.lastLeaseId) : existing.lastLeaseId,
            last_used_at: Date.now(),
            error: options.error === undefined
                ? (existing.error === null ? null : JSON.stringify(existing.error))
                : (options.error === null ? null : JSON.stringify(options.error)),
            updated_at: Date.now()
        })
        return this.getWorkspaceByNamespace(options.id, options.namespace)
    }

    createWorkspaceLease(options: {
        namespace: string
        workspaceId: string
        requestId?: string | null
        machineId: string
        sessionId?: string | null
        status?: CloudWorkspaceLeaseStatus
        expiresAt?: number | null
    }): StoredCloudWorkspaceLease {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO cloud_workspace_leases (
                id, namespace, workspace_id, request_id, machine_id, session_id,
                status, created_at, updated_at, expires_at, released_at
            ) VALUES (
                @id, @namespace, @workspace_id, @request_id, @machine_id, @session_id,
                @status, @created_at, @updated_at, @expires_at, NULL
            )
        `).run({
            id,
            namespace: options.namespace,
            workspace_id: options.workspaceId,
            request_id: normalizeOptionalString(options.requestId),
            machine_id: options.machineId,
            session_id: normalizeOptionalString(options.sessionId),
            status: options.status ?? 'active',
            created_at: now,
            updated_at: now,
            expires_at: options.expiresAt ?? null
        })
        return this.getWorkspaceLease(id) ?? (() => { throw new Error('Failed to create cloud workspace lease') })()
    }

    getWorkspaceLease(id: string): StoredCloudWorkspaceLease | null {
        const row = this.db.prepare('SELECT * FROM cloud_workspace_leases WHERE id = ?').get(id) as DbCloudWorkspaceLeaseRow | undefined
        return row ? toStoredCloudWorkspaceLease(row) : null
    }

    getWorkspaceLeaseByNamespace(id: string, namespace: string): StoredCloudWorkspaceLease | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_workspace_leases WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbCloudWorkspaceLeaseRow | undefined
        return row ? toStoredCloudWorkspaceLease(row) : null
    }

    getActiveLeaseForWorkspace(workspaceId: string, namespace: string): StoredCloudWorkspaceLease | null {
        const row = this.db.prepare(`
            SELECT * FROM cloud_workspace_leases
            WHERE workspace_id = ? AND namespace = ? AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        `).get(workspaceId, namespace) as DbCloudWorkspaceLeaseRow | undefined
        return row ? toStoredCloudWorkspaceLease(row) : null
    }

    updateWorkspaceLease(options: {
        id: string
        namespace: string
        sessionId?: string | null
        status?: CloudWorkspaceLeaseStatus
        expiresAt?: number | null
        releasedAt?: number | null
    }): StoredCloudWorkspaceLease | null {
        const existing = this.getWorkspaceLeaseByNamespace(options.id, options.namespace)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_workspace_leases
            SET session_id = @session_id,
                status = @status,
                expires_at = @expires_at,
                released_at = @released_at,
                updated_at = @updated_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id: options.id,
            namespace: options.namespace,
            session_id: options.sessionId !== undefined ? normalizeOptionalString(options.sessionId) : existing.sessionId,
            status: options.status ?? existing.status,
            expires_at: options.expiresAt !== undefined ? options.expiresAt : existing.expiresAt,
            released_at: options.releasedAt !== undefined ? options.releasedAt : existing.releasedAt,
            updated_at: Date.now()
        })
        return this.getWorkspaceLeaseByNamespace(options.id, options.namespace)
    }

    expireWorkspaceLeases(now: number = Date.now()): number {
        const result = this.db.prepare(`
            UPDATE cloud_workspace_leases
            SET status = 'expired',
                released_at = COALESCE(released_at, @released_at),
                updated_at = @updated_at
            WHERE status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at <= @expires_at
        `).run({
            expires_at: now,
            released_at: now,
            updated_at: now
        })
        return Number(result.changes ?? 0)
    }

    createSecret(options: {
        namespace: string
        name: string
        encryptedValue: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: CloudSecretAdapter | null
    }): StoredCloudSecret {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO cloud_secrets (
                id, namespace, name, description, mount_as, env_name,
                file_path, adapter, encrypted_value, created_at, updated_at, last_accessed_at
            ) VALUES (
                @id, @namespace, @name, @description, @mount_as, @env_name,
                @file_path, @adapter, @encrypted_value, @created_at, @updated_at, NULL
            )
        `).run({
            id,
            namespace: options.namespace,
            name: options.name.trim(),
            description: normalizeOptionalString(options.description),
            mount_as: options.mountAs ?? null,
            env_name: normalizeOptionalString(options.envName),
            file_path: normalizeOptionalString(options.filePath),
            adapter: normalizeOptionalString(options.adapter),
            encrypted_value: options.encryptedValue,
            created_at: now,
            updated_at: now
        })
        return this.getSecret(id) ?? (() => { throw new Error('Failed to create cloud secret') })()
    }

    getSecret(id: string): StoredCloudSecret | null {
        const row = this.db.prepare('SELECT * FROM cloud_secrets WHERE id = ?').get(id) as DbCloudSecretRow | undefined
        return row ? toStoredCloudSecret(row) : null
    }

    getSecretByNamespace(id: string, namespace: string): StoredCloudSecret | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_secrets WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbCloudSecretRow | undefined
        return row ? toStoredCloudSecret(row) : null
    }

    getSecretByName(namespace: string, name: string): StoredCloudSecret | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_secrets WHERE namespace = ? AND name = ?'
        ).get(namespace, name.trim()) as DbCloudSecretRow | undefined
        return row ? toStoredCloudSecret(row) : null
    }

    listSecretsByNamespace(namespace: string): StoredCloudSecret[] {
        const rows = this.db.prepare(
            'SELECT * FROM cloud_secrets WHERE namespace = ? ORDER BY updated_at DESC'
        ).all(namespace) as DbCloudSecretRow[]
        return rows.map(toStoredCloudSecret)
    }

    updateSecret(options: {
        id: string
        namespace: string
        name?: string
        encryptedValue?: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: CloudSecretAdapter | null
        lastAccessedAt?: number | null
    }): StoredCloudSecret | null {
        const existing = this.getSecretByNamespace(options.id, options.namespace)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_secrets
            SET name = @name,
                description = @description,
                mount_as = @mount_as,
                env_name = @env_name,
                file_path = @file_path,
                adapter = @adapter,
                encrypted_value = @encrypted_value,
                updated_at = @updated_at,
                last_accessed_at = @last_accessed_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id: options.id,
            namespace: options.namespace,
            name: normalizeOptionalString(options.name) ?? existing.name,
            description: options.description !== undefined ? normalizeOptionalString(options.description) : existing.description,
            mount_as: options.mountAs !== undefined ? options.mountAs : existing.mountAs,
            env_name: options.envName !== undefined ? normalizeOptionalString(options.envName) : existing.envName,
            file_path: options.filePath !== undefined ? normalizeOptionalString(options.filePath) : existing.filePath,
            adapter: options.adapter !== undefined ? normalizeOptionalString(options.adapter) : existing.adapter,
            encrypted_value: options.encryptedValue ?? existing.encryptedValue,
            updated_at: Date.now(),
            last_accessed_at: options.lastAccessedAt !== undefined ? options.lastAccessedAt : existing.lastAccessedAt
        })
        return this.getSecretByNamespace(options.id, options.namespace)
    }

    deleteSecret(id: string, namespace: string): boolean {
        const result = this.db.prepare(
            'DELETE FROM cloud_secrets WHERE id = ? AND namespace = ?'
        ).run(id, namespace)
        return Number(result.changes ?? 0) > 0
    }

    createSecretAccessEvent(options: {
        namespace: string
        secretId: string
        secretName: string
        requestId?: string | null
        machineId?: string | null
        sessionId?: string | null
    }): StoredCloudSecretAccessEvent {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO cloud_secret_access_events (
                id, namespace, secret_id, secret_name, request_id, machine_id, session_id, created_at
            ) VALUES (
                @id, @namespace, @secret_id, @secret_name, @request_id, @machine_id, @session_id, @created_at
            )
        `).run({
            id,
            namespace: options.namespace,
            secret_id: options.secretId,
            secret_name: options.secretName,
            request_id: normalizeOptionalString(options.requestId),
            machine_id: normalizeOptionalString(options.machineId),
            session_id: normalizeOptionalString(options.sessionId),
            created_at: now
        })

        this.db.prepare(`
            UPDATE cloud_secrets
            SET last_accessed_at = @last_accessed_at,
                updated_at = @updated_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id: options.secretId,
            namespace: options.namespace,
            last_accessed_at: now,
            updated_at: now
        })

        return this.getSecretAccessEvent(id) ?? (() => { throw new Error('Failed to create cloud secret access event') })()
    }

    getSecretAccessEvent(id: string): StoredCloudSecretAccessEvent | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_secret_access_events WHERE id = ?'
        ).get(id) as DbCloudSecretAccessEventRow | undefined
        return row ? toStoredCloudSecretAccessEvent(row) : null
    }

    createEnrollmentToken(options: {
        namespace: string
        tokenHash: string
        tokenPreview: string
        label?: string | null
        machineId?: string | null
        expiresAt?: number | null
    }): StoredCloudWorkerEnrollmentToken {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO cloud_worker_enrollment_tokens (
                id, namespace, label, machine_id, token_hash, token_preview, created_at, expires_at, revoked_at
            ) VALUES (
                @id, @namespace, @label, @machine_id, @token_hash, @token_preview, @created_at, @expires_at, NULL
            )
        `).run({
            id,
            namespace: options.namespace,
            label: normalizeOptionalString(options.label),
            machine_id: normalizeOptionalString(options.machineId),
            token_hash: options.tokenHash,
            token_preview: options.tokenPreview,
            created_at: now,
            expires_at: options.expiresAt ?? null
        })
        return this.getEnrollmentToken(id) ?? (() => { throw new Error('Failed to create enrollment token') })()
    }

    getEnrollmentToken(id: string): StoredCloudWorkerEnrollmentToken | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_worker_enrollment_tokens WHERE id = ?'
        ).get(id) as DbCloudWorkerEnrollmentTokenRow | undefined
        return row ? toStoredCloudWorkerEnrollmentToken(row) : null
    }

    getEnrollmentTokenByNamespace(id: string, namespace: string): StoredCloudWorkerEnrollmentToken | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_worker_enrollment_tokens WHERE id = ? AND namespace = ?'
        ).get(id, namespace) as DbCloudWorkerEnrollmentTokenRow | undefined
        return row ? toStoredCloudWorkerEnrollmentToken(row) : null
    }

    getEnrollmentTokenByHash(tokenHash: string): StoredCloudWorkerEnrollmentToken | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_worker_enrollment_tokens WHERE token_hash = ? LIMIT 1'
        ).get(tokenHash) as DbCloudWorkerEnrollmentTokenRow | undefined
        return row ? toStoredCloudWorkerEnrollmentToken(row) : null
    }

    listEnrollmentTokensByNamespace(namespace: string): StoredCloudWorkerEnrollmentToken[] {
        const rows = this.db.prepare(
            'SELECT * FROM cloud_worker_enrollment_tokens WHERE namespace = ? ORDER BY created_at DESC'
        ).all(namespace) as DbCloudWorkerEnrollmentTokenRow[]
        return rows.map(toStoredCloudWorkerEnrollmentToken)
    }

    revokeEnrollmentToken(id: string, namespace: string, revokedAt: number = Date.now()): StoredCloudWorkerEnrollmentToken | null {
        const existing = this.getEnrollmentTokenByNamespace(id, namespace)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_worker_enrollment_tokens
            SET revoked_at = @revoked_at
            WHERE id = @id AND namespace = @namespace
        `).run({
            id,
            namespace,
            revoked_at: revokedAt
        })
        return this.getEnrollmentTokenByNamespace(id, namespace)
    }

    updateEnrollmentToken(id: string, namespace: string, updates: {
        label?: string | null
        expiresAt?: number | null
    }): StoredCloudWorkerEnrollmentToken | null {
        const existing = this.getEnrollmentTokenByNamespace(id, namespace)
        if (!existing) return null

        if ('label' in updates) {
            this.db.prepare(`
                UPDATE cloud_worker_enrollment_tokens SET label = ? WHERE id = ? AND namespace = ?
            `).run(normalizeOptionalString(updates.label) ?? null, id, namespace)
        }
        if ('expiresAt' in updates) {
            this.db.prepare(`
                UPDATE cloud_worker_enrollment_tokens SET expires_at = ? WHERE id = ? AND namespace = ?
            `).run(updates.expiresAt ?? null, id, namespace)
        }

        return this.getEnrollmentTokenByNamespace(id, namespace)
    }

    /**
     * CAS-style revoke: only succeeds if the token is not already revoked.
     * Returns true if this call performed the revocation, false if already revoked or not found.
     */
    revokeEnrollmentTokenIfActive(id: string, namespace: string, revokedAt: number = Date.now()): boolean {
        const result = this.db.prepare(`
            UPDATE cloud_worker_enrollment_tokens
            SET revoked_at = @revoked_at
            WHERE id = @id AND namespace = @namespace AND revoked_at IS NULL
        `).run({
            id,
            namespace,
            revoked_at: revokedAt
        })
        return result.changes > 0
    }

    createWorkerSession(options: {
        namespace: string
        machineId?: string | null
        enrollmentTokenId?: string | null
        tokenHash: string
        tokenPreview: string
        expiresAt?: number | null
    }): StoredCloudWorkerSessionToken {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO cloud_worker_sessions (
                id, namespace, machine_id, enrollment_token_id, token_hash, token_preview,
                created_at, updated_at, expires_at, revoked_at, last_used_at
            ) VALUES (
                @id, @namespace, @machine_id, @enrollment_token_id, @token_hash, @token_preview,
                @created_at, @updated_at, @expires_at, NULL, NULL
            )
        `).run({
            id,
            namespace: options.namespace,
            machine_id: normalizeOptionalString(options.machineId),
            enrollment_token_id: normalizeOptionalString(options.enrollmentTokenId),
            token_hash: options.tokenHash,
            token_preview: options.tokenPreview,
            created_at: now,
            updated_at: now,
            expires_at: options.expiresAt ?? null
        })
        return this.getWorkerSession(id) ?? (() => { throw new Error('Failed to create worker session token') })()
    }

    getWorkerSession(id: string): StoredCloudWorkerSessionToken | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_worker_sessions WHERE id = ?'
        ).get(id) as DbCloudWorkerSessionTokenRow | undefined
        return row ? toStoredCloudWorkerSessionToken(row) : null
    }

    getWorkerSessionByHash(tokenHash: string): StoredCloudWorkerSessionToken | null {
        const row = this.db.prepare(
            'SELECT * FROM cloud_worker_sessions WHERE token_hash = ? LIMIT 1'
        ).get(tokenHash) as DbCloudWorkerSessionTokenRow | undefined
        return row ? toStoredCloudWorkerSessionToken(row) : null
    }

    touchWorkerSession(
        id: string,
        usedAt: number = Date.now(),
        extendExpiresAtTo?: number
    ): StoredCloudWorkerSessionToken | null {
        const existing = this.getWorkerSession(id)
        if (!existing) {
            return null
        }
        if (typeof extendExpiresAtTo === 'number' && Number.isFinite(extendExpiresAtTo)) {
            this.db.prepare(`
                UPDATE cloud_worker_sessions
                SET last_used_at = @last_used_at,
                    updated_at = @updated_at,
                    expires_at = @expires_at
                WHERE id = @id
            `).run({
                id,
                last_used_at: usedAt,
                updated_at: usedAt,
                expires_at: extendExpiresAtTo
            })
        } else {
            this.db.prepare(`
                UPDATE cloud_worker_sessions
                SET last_used_at = @last_used_at,
                    updated_at = @updated_at
                WHERE id = @id
            `).run({
                id,
                last_used_at: usedAt,
                updated_at: usedAt
            })
        }
        return this.getWorkerSession(id)
    }

    revokeWorkerSession(id: string, revokedAt: number = Date.now()): StoredCloudWorkerSessionToken | null {
        const existing = this.getWorkerSession(id)
        if (!existing) {
            return null
        }
        this.db.prepare(`
            UPDATE cloud_worker_sessions
            SET revoked_at = @revoked_at,
                updated_at = @updated_at
            WHERE id = @id
        `).run({
            id,
            revoked_at: revokedAt,
            updated_at: revokedAt
        })
        return this.getWorkerSession(id)
    }
}
