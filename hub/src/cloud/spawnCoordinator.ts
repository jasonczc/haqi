import type {
    CloudRequestError,
    CloudCheckpoint,
    CloudSecret,
    CloudSpawnPhase,
    CloudSpawnRequest,
    CloudWorkspace,
    CloudWorkspaceLease,
    EnvironmentTemplate,
    MachineSpawnRequest,
    ResolvedSecret,
    SpawnResponse
} from '@hapi/protocol/types'
import { CloudSecretSchema, CloudSpawnRequestSchema, CloudWorkspaceSchema, MachineSpawnRequestSchema } from '@hapi/protocol/schemas'
import type {
    Store,
    StoredCloudSecret,
    StoredCloudSpawnRequest,
    StoredCloudWorkspace
} from '../store'
import type { MachineCache } from '../sync/machineCache'
import type { RpcGateway } from '../sync/rpcGateway'
import type { EventPublisher } from '../sync/eventPublisher'
import type { EnvironmentRegistry } from './environmentRegistry'
import { CheckpointRegistry } from './checkpointRegistry'
import { selectWorker, type SelectWorkerOptions } from './scheduler'
import { WorkspaceManager } from './workspaceManager'
import { SecretBroker } from './secretBroker'

type CoordinatorOptions = {
    store: Store
    machineCache: MachineCache
    rpcGateway: RpcGateway
    publisher: EventPublisher
    environmentRegistry: EnvironmentRegistry
    checkpointRegistry: CheckpointRegistry
    workspaceManager: WorkspaceManager
    secretBroker: SecretBroker
    persistPreviewUrl?: (sessionId: string, previewUrl: string) => Promise<void>
}

function mergeEnvironmentTemplates(
    registered: EnvironmentTemplate | undefined,
    explicit: EnvironmentTemplate | undefined
): EnvironmentTemplate | undefined {
    if (!registered) {
        return explicit
    }
    if (!explicit) {
        return registered
    }
    return {
        ...registered,
        ...explicit,
        runtime: registered.runtime || explicit.runtime
            ? {
                ...(registered.runtime ?? {}),
                ...(explicit.runtime ?? {})
            }
            : undefined,
        install: explicit.install ?? registered.install,
        start: explicit.start ?? registered.start,
        terminals: explicit.terminals ?? registered.terminals,
        ports: explicit.ports ?? registered.ports,
        resources: explicit.resources ?? registered.resources,
        network: registered.network || explicit.network
            ? {
                ...(registered.network ?? {}),
                ...(explicit.network ?? {})
            }
            : undefined,
        cache: explicit.cache ?? registered.cache,
        secrets: explicit.secrets ?? registered.secrets,
        repositoryDependencies: explicit.repositoryDependencies ?? registered.repositoryDependencies,
        features: registered.features || explicit.features
            ? {
                ...(registered.features ?? {}),
                ...(explicit.features ?? {})
            }
            : undefined,
        services: explicit.services ?? registered.services,
        user: explicit.user ?? registered.user,
        workingDir: explicit.workingDir ?? registered.workingDir,
        desktop: explicit.desktop ?? registered.desktop
    }
}

function getSelectionOptions(environment: EnvironmentTemplate | undefined, request: MachineSpawnRequest): SelectWorkerOptions {
    const runtimeKind = request.runtimeKind ?? environment?.runtime?.kind
    const hasServices = Array.isArray(environment?.services) && environment.services.length > 0
    const requireDockerSession = runtimeKind === 'docker-session'
    return {
        labels: request.labels,
        requireDocker: requireDockerSession || hasServices,
        requireDockerSession
    }
}

function toCloudSpawnRequest(value: StoredCloudSpawnRequest): CloudSpawnRequest | null {
    const parsed = CloudSpawnRequestSchema.safeParse({
        id: value.id,
        namespace: value.namespace,
        requestedMachineId: value.requestedMachineId ?? undefined,
        selectedMachineId: value.selectedMachineId ?? undefined,
        phase: value.phase,
        request: value.request,
        workspaceId: value.workspaceId ?? undefined,
        sessionId: value.sessionId ?? undefined,
        reusedWorkspace: value.reusedWorkspace || undefined,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        startedAt: value.startedAt ?? undefined,
        completedAt: value.completedAt ?? undefined,
        error: value.error ?? undefined
    })
    return parsed.success ? parsed.data : null
}

function toCloudWorkspace(value: StoredCloudWorkspace): CloudWorkspace | null {
    const parsed = CloudWorkspaceSchema.safeParse({
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
    return parsed.success ? parsed.data : null
}

function toCloudSecret(value: StoredCloudSecret): CloudSecret | null {
    const parsed = CloudSecretSchema.safeParse({
        id: value.id,
        namespace: value.namespace,
        name: value.name,
        description: value.description ?? undefined,
        mountAs: value.mountAs ?? undefined,
        envName: value.envName ?? undefined,
        filePath: value.filePath ?? undefined,
        adapter: value.adapter ?? undefined,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        lastAccessedAt: value.lastAccessedAt ?? undefined
    })
    return parsed.success ? parsed.data : null
}

function normalizeRequestedMachineId(machineId: string): string | null {
    const trimmed = machineId.trim()
    return trimmed === 'auto' ? null : trimmed
}

export class SpawnCoordinator {
    private readonly store: Store
    private readonly machineCache: MachineCache
    private readonly rpcGateway: RpcGateway
    private readonly publisher: EventPublisher
    private readonly environmentRegistry: EnvironmentRegistry
    private readonly checkpointRegistry: CheckpointRegistry
    private readonly workspaceManager: WorkspaceManager
    private readonly secretBroker: SecretBroker
    private readonly persistPreviewUrl?: (sessionId: string, previewUrl: string) => Promise<void>
    private readonly processing = new Set<string>()

    constructor(options: CoordinatorOptions) {
        this.store = options.store
        this.machineCache = options.machineCache
        this.rpcGateway = options.rpcGateway
        this.publisher = options.publisher
        this.environmentRegistry = options.environmentRegistry
        this.checkpointRegistry = options.checkpointRegistry
        this.workspaceManager = options.workspaceManager
        this.secretBroker = options.secretBroker
        this.persistPreviewUrl = options.persistPreviewUrl
    }

    listRequests(namespace: string, limit?: number): CloudSpawnRequest[] {
        return this.store.cloud.listSpawnRequestsByNamespace(namespace, limit).flatMap((request) => {
            const parsed = toCloudSpawnRequest(request)
            return parsed ? [parsed] : []
        })
    }

    getRequest(namespace: string, requestId: string): CloudSpawnRequest | null {
        const request = this.store.cloud.getSpawnRequestByNamespace(requestId, namespace)
        return request ? toCloudSpawnRequest(request) : null
    }

    listWorkspaces(namespace: string, limit?: number): CloudWorkspace[] {
        return this.store.cloud.listWorkspacesByNamespace(namespace, limit).flatMap((workspace) => {
            const parsed = toCloudWorkspace(workspace)
            return parsed ? [parsed] : []
        })
    }

    getWorkspace(namespace: string, workspaceId: string): CloudWorkspace | null {
        const workspace = this.store.cloud.getWorkspaceByNamespace(workspaceId, namespace)
        return workspace ? toCloudWorkspace(workspace) : null
    }

    listSecrets(namespace: string): CloudSecret[] {
        return this.secretBroker.listSecrets(namespace)
    }

    getSecret(namespace: string, secretId: string): CloudSecret | null {
        return this.secretBroker.getSecret(namespace, secretId)
    }

    createSecret(options: {
        namespace: string
        name: string
        value: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: Parameters<SecretBroker['createSecret']>[0]['adapter']
    }): CloudSecret {
        const secret = this.secretBroker.createSecret(options)
        this.emitSecret(secret)
        return secret
    }

    updateSecret(options: {
        namespace: string
        id: string
        name?: string
        value?: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: Parameters<SecretBroker['updateSecret']>[0]['adapter']
    }): CloudSecret | null {
        const secret = this.secretBroker.updateSecret(options)
        if (secret) {
            this.emitSecret(secret)
        }
        return secret
    }

    deleteSecret(namespace: string, secretId: string): boolean {
        const existing = this.secretBroker.getSecret(namespace, secretId)
        const deleted = this.secretBroker.deleteSecret(namespace, secretId)
        if (deleted && existing) {
            this.emitSecret(existing)
        }
        return deleted
    }

    createEnrollmentToken(options: {
        namespace: string
        label?: string | null
        machineId?: string | null
        ttlMinutes?: number | null
    }): ReturnType<SecretBroker['createEnrollmentToken']> {
        return this.secretBroker.createEnrollmentToken(options)
    }

    listEnrollmentTokens(namespace: string) {
        return this.secretBroker.listEnrollmentTokens(namespace)
    }

    revokeEnrollmentToken(namespace: string, id: string) {
        return this.secretBroker.revokeEnrollmentToken(namespace, id)
    }

    resolveEnrollmentToken(token: string) {
        return this.secretBroker.resolveEnrollmentToken(token)
    }

    enqueue(namespace: string, machineId: string, request: MachineSpawnRequest): CloudSpawnRequest {
        const created = this.store.cloud.createSpawnRequest({
            namespace,
            requestedMachineId: normalizeRequestedMachineId(machineId),
            phase: 'queued',
            request
        })
        const parsed = toCloudSpawnRequest(created)
        if (!parsed) {
            throw new Error('Failed to serialize cloud spawn request')
        }
        this.emitRequest(parsed)
        queueMicrotask(() => {
            void this.processRequest(parsed.id)
        })
        return parsed
    }

    cancel(namespace: string, requestId: string): CloudSpawnRequest | null {
        const existing = this.store.cloud.getSpawnRequestByNamespace(requestId, namespace)
        if (!existing) {
            return null
        }
        if (existing.phase === 'succeeded' || existing.phase === 'failed' || existing.phase === 'canceled') {
            return toCloudSpawnRequest(existing)
        }
        const updated = this.store.cloud.updateSpawnRequest({
            id: requestId,
            namespace,
            phase: 'canceled',
            error: {
                phase: existing.phase as CloudSpawnPhase,
                code: 'request_canceled',
                message: 'Cloud spawn request canceled',
                retryable: true,
                at: Date.now()
            },
            completedAt: Date.now()
        })
        const parsed = updated ? toCloudSpawnRequest(updated) : null
        if (parsed) {
            this.emitRequest(parsed)
        }
        return parsed
    }

    retry(namespace: string, requestId: string): CloudSpawnRequest | null {
        const existing = this.store.cloud.getSpawnRequestByNamespace(requestId, namespace)
        if (!existing) {
            return null
        }
        const request = MachineSpawnRequestSchema.safeParse(existing.request)
        if (!request.success) {
            throw new Error('Stored cloud spawn request payload is invalid')
        }
        return this.enqueue(namespace, existing.requestedMachineId ?? 'auto', request.data)
    }

    private async processRequest(requestId: string): Promise<void> {
        if (this.processing.has(requestId)) {
            return
        }
        this.processing.add(requestId)
        try {
            const existing = this.store.cloud.getSpawnRequest(requestId)
            if (!existing || existing.phase === 'canceled' || existing.phase === 'succeeded') {
                return
            }

            const requestParse = MachineSpawnRequestSchema.safeParse(existing.request)
            if (!requestParse.success) {
                this.failRequest(existing.namespace, requestId, {
                    phase: 'queued',
                    code: 'invalid_request_payload',
                    message: 'Stored cloud spawn request payload is invalid',
                    retryable: false,
                    at: Date.now()
                })
                return
            }

            const request = requestParse.data
            const namespace = existing.namespace
            if (!request.workspaceSource?.repository) {
                this.failRequest(namespace, requestId, {
                    phase: 'queued',
                    code: 'cloud_repo_required',
                    message: 'Cloud docker sessions require workspaceSource.repository',
                    retryable: false,
                    at: Date.now()
                })
                return
            }
            const requestedEnvironment = this.resolveEnvironment(request)
            const checkpoint = this.resolveCheckpoint(request, requestedEnvironment)
            if (!checkpoint) {
                this.failRequest(namespace, requestId, {
                    phase: 'queued',
                    code: 'checkpoint_not_found',
                    message: 'Cloud docker sessions require a valid checkpointId or environment.runtime.image',
                    retryable: false,
                    at: Date.now()
                })
                return
            }
            const environment = mergeEnvironmentTemplates(checkpoint.defaultEnvironment, requestedEnvironment)

            this.workspaceManager.expireLeases()

            await this.updatePhase(namespace, requestId, 'selecting-worker', {
                startedAt: existing.startedAt ?? Date.now()
            })

            const selectedMachineId = this.selectMachine(namespace, existing.requestedMachineId, request, environment)
            if (!selectedMachineId) {
                this.failRequest(namespace, requestId, {
                    phase: 'selecting-worker',
                    code: 'no_matching_cloud_worker',
                    message: 'No matching cloud worker available',
                    retryable: true,
                    at: Date.now()
                })
                return
            }

            const pinnedWorkspace = this.workspaceManager.getPinnedWorkspace(namespace, request, environment?.id)
            if (pinnedWorkspace?.machineId && pinnedWorkspace.machineId !== selectedMachineId) {
                this.failRequest(namespace, requestId, {
                    phase: 'selecting-worker',
                    code: 'workspace_worker_unavailable',
                    message: 'Persistent workspace is pinned to a different unavailable worker',
                    retryable: true,
                    at: Date.now()
                })
                return
            }

            await this.updatePhase(namespace, requestId, 'acquiring-workspace', {
                selectedMachineId
            })

            let workspace: CloudWorkspace
            let lease: CloudWorkspaceLease
            let reusedWorkspace = false
            try {
                const acquired = this.workspaceManager.acquireWorkspace({
                    namespace,
                    machineId: selectedMachineId,
                    requestId,
                    request,
                    environment
                })
                workspace = acquired.workspace
                lease = acquired.lease
                reusedWorkspace = acquired.reused
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const code = message === 'workspace_worker_unavailable'
                    ? 'workspace_worker_unavailable'
                    : 'workspace_acquire_failed'
                this.failRequest(namespace, requestId, {
                    phase: 'acquiring-workspace',
                    code,
                    message: code === 'workspace_worker_unavailable'
                        ? 'Persistent workspace is pinned to an unavailable worker'
                        : message,
                    retryable: code !== 'workspace_acquire_failed',
                    at: Date.now()
                })
                return
            }

            const parsedWorkspace = this.getWorkspace(namespace, workspace.id)
            if (parsedWorkspace) {
                this.emitWorkspace(parsedWorkspace)
            }
            await this.updatePhase(namespace, requestId, 'pulling-checkpoint', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })
            await this.updatePhase(namespace, requestId, 'creating-container', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })
            await this.updatePhase(namespace, requestId, 'materializing-secrets', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })

            let resolvedSecrets: ResolvedSecret[] = []
            try {
                const allSecretNames = new Set<string>(request.secrets ?? [])
                const repositorySecret = request.workspaceSource?.repository?.credentialsSecretRef?.trim()
                if (repositorySecret) {
                    allSecretNames.add(repositorySecret)
                }
                resolvedSecrets = this.secretBroker.resolveSecrets({
                    namespace,
                    secretNames: [...allSecretNames],
                    requestId,
                    machineId: selectedMachineId
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                this.workspaceManager.markWorkspaceFailed({
                    namespace,
                    workspaceId: workspace.id,
                    error: {
                        phase: 'materializing-secrets',
                        code: 'secret_resolution_failed',
                        message,
                        retryable: true,
                        at: Date.now()
                    }
                })
                this.failRequest(namespace, requestId, {
                    phase: 'materializing-secrets',
                    code: 'secret_resolution_failed',
                    message,
                    retryable: true,
                    at: Date.now()
                })
                this.workspaceManager.releaseLease({
                    namespace,
                    leaseId: lease.id,
                    workspaceId: workspace.id,
                    workspaceStatus: 'failed'
                })
                return
            }

            await this.updatePhase(namespace, requestId, 'syncing-repo', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })
            await this.updatePhase(namespace, requestId, 'hydrating-desktop', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })

            const spawnPayload: MachineSpawnRequest = {
                ...request,
                spawnRequestId: requestId,
                checkpointId: checkpoint.id,
                repoSyncPolicy: request.repoSyncPolicy ?? 'fetch-reset',
                environment,
                resolvedEnvironment: environment,
                workspaceLease: {
                    leaseId: lease.id,
                    workspaceId: workspace.id,
                    workspaceKey: workspace.key ?? undefined,
                    machineId: selectedMachineId,
                    mode: workspace.mode ?? undefined,
                    name: workspace.name ?? undefined,
                    path: workspace.path ?? undefined,
                    baseDir: request.workspace?.baseDir,
                    repoVolumePath: workspace.repoVolumePath,
                    desktopStateVolumePath: workspace.desktopStateVolumePath,
                    source: request.workspaceSource,
                    environmentId: environment?.id,
                    environmentVersion: environment?.version,
                    checkpointId: checkpoint.id,
                    workspaceBranch: workspace.workspaceBranch,
                    expiresAt: lease.expiresAt ?? undefined
                },
                resolvedSecrets
            }

            await this.updatePhase(namespace, requestId, 'starting-session', {
                selectedMachineId,
                workspaceId: workspace.id,
                reusedWorkspace
            })

            const response = await this.rpcGateway.spawnSession(selectedMachineId, spawnPayload)
            await this.handleSpawnResponse({
                namespace,
                requestId,
                selectedMachineId,
                workspace,
                lease,
                environment,
                request,
                response,
                reusedWorkspace
            })
        } finally {
            this.processing.delete(requestId)
        }
    }

    private async handleSpawnResponse(options: {
        namespace: string
        requestId: string
        selectedMachineId: string
        workspace: CloudWorkspace
        lease: CloudWorkspaceLease
        environment: EnvironmentTemplate | undefined
        request: MachineSpawnRequest
        response: SpawnResponse
        reusedWorkspace: boolean
    }): Promise<void> {
        if (options.response.type === 'success') {
            this.store.cloud.updateWorkspaceLease({
                id: options.lease.id,
                namespace: options.namespace,
                sessionId: options.response.sessionId
            })
            const readyWorkspace = this.workspaceManager.markWorkspaceReady({
                namespace: options.namespace,
                workspaceId: options.workspace.id,
                machineId: options.selectedMachineId,
                path: options.workspace.path ?? undefined,
                repoVolumePath: options.workspace.repoVolumePath ?? undefined,
                desktopStateVolumePath: options.workspace.desktopStateVolumePath ?? undefined,
                environment: options.environment,
                environmentId: options.environment?.id ?? options.workspace.environmentId ?? undefined,
                environmentVersion: options.environment?.version ?? options.workspace.environmentVersion ?? undefined,
                checkpointId: options.workspace.checkpointId ?? options.request.checkpointId ?? undefined,
                workspaceBranch: options.workspace.workspaceBranch ?? undefined,
                repoStatus: 'clean',
                reused: options.reusedWorkspace
            })
            if (readyWorkspace) {
                this.emitWorkspace(readyWorkspace)
            }
            const updated = this.store.cloud.updateSpawnRequest({
                id: options.requestId,
                namespace: options.namespace,
                phase: 'succeeded',
                selectedMachineId: options.selectedMachineId,
                workspaceId: options.workspace.id,
                sessionId: options.response.sessionId,
                reusedWorkspace: options.reusedWorkspace,
                completedAt: Date.now(),
                error: null
            })
            if (updated) {
                const parsed = toCloudSpawnRequest(updated)
                if (parsed) {
                    this.emitRequest(parsed)
                }
            }
            if (options.request.previewUrl && this.persistPreviewUrl) {
                await this.persistPreviewUrl(options.response.sessionId, options.request.previewUrl).catch(() => undefined)
            }
            return
        }

        const error: CloudRequestError = (() => {
            switch (options.response.type) {
                case 'error':
                    return {
                        phase: 'starting-session',
                        code: options.response.code ?? 'spawn_failed',
                        message: options.response.message,
                        retryable: true,
                        at: Date.now()
                    }
                case 'requestToApproveDirectoryCreation':
                    return {
                        phase: 'syncing-repo',
                        code: 'directory_creation_approval_required',
                        message: `Directory creation requires approval: ${options.response.directory}`,
                        retryable: false,
                        at: Date.now()
                    }
                case 'accepted':
                    return {
                        phase: 'starting-session',
                        code: 'unexpected_async_response',
                        message: 'Worker returned an async spawn response for a resolved request',
                        retryable: true,
                        at: Date.now()
                    }
                default:
                    throw new Error('Unreachable spawn response state')
            }
        })()
        this.workspaceManager.markWorkspaceFailed({
            namespace: options.namespace,
            workspaceId: options.workspace.id,
            error
        })
        this.workspaceManager.releaseLease({
            namespace: options.namespace,
            leaseId: options.lease.id,
            workspaceId: options.workspace.id,
            workspaceStatus: 'failed'
        })
        this.failRequest(options.namespace, options.requestId, error, {
            selectedMachineId: options.selectedMachineId,
            workspaceId: options.workspace.id,
            reusedWorkspace: options.reusedWorkspace
        })
    }

    private resolveEnvironment(request: MachineSpawnRequest): EnvironmentTemplate | undefined {
        const environmentId = request.environmentId?.trim()
        const registered = environmentId
            ? this.environmentRegistry.get(environmentId) ?? undefined
            : undefined
        return mergeEnvironmentTemplates(registered, request.environment)
    }

    private resolveCheckpoint(
        request: MachineSpawnRequest,
        environment: EnvironmentTemplate | undefined
    ): CloudCheckpoint | null {
        const explicitId = request.checkpointId?.trim()
            || environment?.runtime?.checkpointId?.trim()
        if (explicitId) {
            return this.checkpointRegistry.get(explicitId)
        }

        const image = environment?.runtime?.image?.trim()
        if (!image) {
            return null
        }

        const fallbackId = environment?.id?.trim() || image
        return this.checkpointRegistry.get(fallbackId) ?? this.checkpointRegistry.register({
            id: fallbackId,
            image,
            name: environment?.name ?? fallbackId,
            description: environment?.description,
            defaultEnvironment: environment,
            defaultDesktop: environment?.desktop
        })
    }

    private selectMachine(
        namespace: string,
        requestedMachineId: string | null,
        request: MachineSpawnRequest,
        environment: EnvironmentTemplate | undefined
    ): string | null {
        if (requestedMachineId) {
            const explicit = this.machineCache.getMachineByNamespace(requestedMachineId, namespace)
            return explicit?.active ? explicit.id : null
        }

        const pinnedWorkspace = this.workspaceManager.getPinnedWorkspace(namespace, request, environment?.id)
        if (pinnedWorkspace?.machineId) {
            const pinned = this.machineCache.getMachineByNamespace(pinnedWorkspace.machineId, namespace)
            if (!pinned || !pinned.active) {
                return null
            }
            return pinned.id
        }

        const backend = request.executionBackend
        const candidates = this.machineCache.getMachinesByNamespace(namespace).filter((machine) => {
            return backend
                ? machine.metadata?.executorType === backend
                : machine.metadata?.executorType === 'cloud-self-hosted'
        })
        const selected = selectWorker(candidates, getSelectionOptions(environment, request))
        return selected?.id ?? null
    }

    private async updatePhase(
        namespace: string,
        requestId: string,
        phase: CloudSpawnPhase,
        extras?: {
            selectedMachineId?: string
            workspaceId?: string
            reusedWorkspace?: boolean
            startedAt?: number
        }
    ): Promise<void> {
        const updated = this.store.cloud.updateSpawnRequest({
            id: requestId,
            namespace,
            phase,
            selectedMachineId: extras?.selectedMachineId,
            workspaceId: extras?.workspaceId,
            reusedWorkspace: extras?.reusedWorkspace,
            startedAt: extras?.startedAt
        })
        const parsed = updated ? toCloudSpawnRequest(updated) : null
        if (parsed) {
            this.emitRequest(parsed)
        }
    }

    private failRequest(
        namespace: string,
        requestId: string,
        error: CloudRequestError,
        extras?: {
            selectedMachineId?: string
            workspaceId?: string
            reusedWorkspace?: boolean
        }
    ): void {
        const updated = this.store.cloud.updateSpawnRequest({
            id: requestId,
            namespace,
            phase: 'failed',
            selectedMachineId: extras?.selectedMachineId,
            workspaceId: extras?.workspaceId,
            reusedWorkspace: extras?.reusedWorkspace,
            completedAt: Date.now(),
            error
        })
        const parsed = updated ? toCloudSpawnRequest(updated) : null
        if (parsed) {
            this.emitRequest(parsed)
        }
    }

    private emitRequest(request: CloudSpawnRequest): void {
        this.publisher.emit({
            type: 'cloud-spawn-request-updated',
            requestId: request.id,
            namespace: request.namespace,
            data: request
        })
    }

    private emitWorkspace(workspace: CloudWorkspace): void {
        this.publisher.emit({
            type: 'cloud-workspace-updated',
            workspaceId: workspace.id,
            namespace: workspace.namespace,
            data: workspace
        })
    }

    private emitSecret(secret: CloudSecret): void {
        this.publisher.emit({
            type: 'cloud-secret-updated',
            secretId: secret.id,
            namespace: secret.namespace,
            data: secret
        })
    }
}
