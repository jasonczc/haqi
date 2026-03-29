import type {
    EnvironmentTemplate,
    MachineSpawnRequest,
    PreviewTarget,
    RuntimeKind,
    SecretRef,
    WorkerResources,
    WorkspaceMode,
    WorkspaceSource,
    WorkspaceSpec
} from '@hapi/protocol/types'

export type SpawnRequestId = string

export type PreparedWorkspace = {
    workspaceId: string
    workspacePath: string
    workingDirectory: string
    source?: WorkspaceSource
    mode?: WorkspaceMode
    spec?: WorkspaceSpec
    environment?: EnvironmentTemplate
    cleanupPaths: string[]
}

export type PreparedWorkspaceCleanup = {
    cleanupPaths: string[]
}

export type MaterializedSecret = {
    ref: SecretRef
    env?: Record<string, string>
    files?: string[]
}

export type ServiceRuntimeHandle = {
    id: string
    name: string
    image?: string
    containerId?: string
    previewTargets?: PreviewTarget[]
    ports?: Array<{
        containerPort: number
        hostPort?: number
    }>
}

export type RuntimeHandle = {
    runtimeKind: RuntimeKind
    pid?: number
    containerId?: string
    previewTargets?: PreviewTarget[]
    serviceHandles?: ServiceRuntimeHandle[]
}

export type SessionRuntimeHandle = {
    runtimeKind: RuntimeKind
    pid?: number
    containerId?: string
}

export type ServiceEndpoint = {
    service: string
    host: string
    port: number
    containerPort: number
    url?: string
}

export type ResolvedEnvironmentTemplate = {
    environment?: EnvironmentTemplate
    runtimeKind: RuntimeKind
    services: NonNullable<EnvironmentTemplate['services']>
    workingDirectory?: string
    environmentId?: string
}

export type PreparedEnvironment = {
    environment?: EnvironmentTemplate
    runtimeKind: RuntimeKind
    resources?: WorkerResources
    serviceEndpoints?: ServiceEndpoint[]
    serviceContainers?: ServiceRuntimeHandle[]
    extraEnv?: Record<string, string>
}

export type SpawnExecutionContext = {
    requestId: SpawnRequestId
    machineId?: string
    request: MachineSpawnRequest
}
