import type {
    EnvironmentTemplate,
    PreviewTarget,
    WorkerCapabilities,
    WorkerLifecycle,
    WorkerResources
} from '@hapi/protocol/types'
import type { RunnerStateSummary } from './workerState'

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
    selectable: boolean
    activeRequestsCount?: number
    environmentId?: string
    executorType?: 'local' | 'cloud-self-hosted' | 'cloud-managed'
    lifecycle?: WorkerLifecycle
    region?: string
    workerVersion?: string
    labels?: string[]
    capabilities?: WorkerCapabilities
    resources?: WorkerResources
    runnerState?: RunnerStateSummary | null
    updatedAt: number
}

export type ProviderSummary = {
    id: string
    type: 'self-hosted' | 'managed'
    count: number
    activeCount: number
    availableCount: number
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
