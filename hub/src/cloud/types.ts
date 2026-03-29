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
    environmentId?: string
    lifecycle?: WorkerLifecycle
    capabilities?: WorkerCapabilities
    resources?: WorkerResources
    updatedAt: number
}
