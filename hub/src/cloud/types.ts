import type {
    EnvironmentTemplate,
    PreviewTarget,
    WorkerCapabilities,
    WorkerLifecycle,
    WorkerResources
} from '@hapi/protocol/types'

export type RegisteredEnvironment = {
    id: string
    version: string
    template: EnvironmentTemplate
    source: 'machine' | 'session' | 'builtin'
    machineId?: string
    sessionId?: string
    updatedAt: number
}

export type PreviewRegistration = {
    sessionId: string
    machineId?: string
    previews: PreviewTarget[]
    updatedAt: number
}

export type WorkerSummary = {
    machineId: string
    provider: string
    active: boolean
    environmentId?: string
    executorType?: 'local' | 'cloud-self-hosted' | 'cloud-managed'
    lifecycle?: WorkerLifecycle
    region?: string
    labels?: string[]
    capabilities?: WorkerCapabilities
    resources?: WorkerResources
    updatedAt: number
}

export type ProviderSummary = {
    id: string
    type: 'self-hosted' | 'managed'
    count: number
}

export type CloudWorkerProvider = {
    id: string
    type: 'self-hosted' | 'managed'
    machineId: string
    namespace?: string
    labels: string[]
    lifecycle?: WorkerLifecycle
    capabilities?: WorkerCapabilities
    resources?: WorkerResources
    updatedAt: number
}
