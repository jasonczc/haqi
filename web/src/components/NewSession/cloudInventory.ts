import type {
    CloudEnvironmentSummary,
    CloudProviderSummary,
    CloudWorkerSummary,
    ExecutionBackend,
    RuntimeKind
} from '@/types/api'

export type CloudInventorySummary = {
    providerCount: number
    workerCount: number
    activeWorkerCount: number
    selectedWorker: CloudWorkerSummary | null
    matchingEnvironments: CloudEnvironmentSummary[]
    selectedEnvironment: CloudEnvironmentSummary | null
}

export type CloudRuntimeWarning = 'dockerUnavailable'

export function getCloudInventorySummary(options: {
    backend: ExecutionBackend
    selectedMachineId: string | null
    environmentId: string
    providers: CloudProviderSummary[]
    workers: CloudWorkerSummary[]
    environments?: CloudEnvironmentSummary[]
}): CloudInventorySummary {
    if (options.backend === 'local') {
        return {
            providerCount: 0,
            workerCount: 0,
            activeWorkerCount: 0,
            selectedWorker: null,
            matchingEnvironments: [],
            selectedEnvironment: null
        }
    }

    const environments = options.environments ?? []
    const matchingEnvironments = environments.filter((environment) => {
        const runtimeKind = environment.runtimeKind
        if (options.backend !== 'local' && runtimeKind && runtimeKind !== 'daemon-session') {
            return false
        }
        const workerSupportsRuntime = options.workers.some((worker) => worker.capabilities?.docker === true)
        return workerSupportsRuntime
    })

    const normalizedEnvironmentId = options.environmentId.trim()

    return {
        providerCount: options.providers.filter((provider) => provider.id !== 'auto').length,
        workerCount: options.workers.length,
        activeWorkerCount: options.workers.filter((worker) => worker.active).length,
        selectedWorker: options.selectedMachineId
            ? options.workers.find((worker) => worker.machineId === options.selectedMachineId) ?? null
            : null,
        matchingEnvironments,
        selectedEnvironment: normalizedEnvironmentId
            ? matchingEnvironments.find((environment) => environment.id === normalizedEnvironmentId) ?? null
            : null
    }
}

export function getCloudRuntimeWarning(options: {
    runtimeKind: RuntimeKind
    selectedWorker: CloudWorkerSummary | null
}): CloudRuntimeWarning | null {
    const { runtimeKind, selectedWorker } = options

    if (!selectedWorker) {
        return null
    }

    if (runtimeKind === 'daemon-session' && selectedWorker.capabilities?.docker !== true) {
        return 'dockerUnavailable'
    }

    if (
        runtimeKind === 'host-process'
        && selectedWorker.capabilities?.docker !== true
        && selectedWorker.capabilities?.serviceContainers !== true
    ) {
        return 'dockerUnavailable'
    }

    return null
}
