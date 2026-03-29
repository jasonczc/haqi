import type {
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
}

export type CloudRuntimeWarning = 'dockerUnavailable' | 'dockerSessionUnavailable'

export function getCloudInventorySummary(options: {
    backend: ExecutionBackend
    selectedMachineId: string | null
    providers: CloudProviderSummary[]
    workers: CloudWorkerSummary[]
}): CloudInventorySummary {
    if (options.backend === 'local') {
        return {
            providerCount: 0,
            workerCount: 0,
            activeWorkerCount: 0,
            selectedWorker: null
        }
    }

    return {
        providerCount: options.providers.filter((provider) => provider.id !== 'auto').length,
        workerCount: options.workers.length,
        activeWorkerCount: options.workers.filter((worker) => worker.active).length,
        selectedWorker: options.selectedMachineId
            ? options.workers.find((worker) => worker.machineId === options.selectedMachineId) ?? null
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

    if (runtimeKind === 'docker-session' && selectedWorker.capabilities?.dockerSession !== true) {
        return 'dockerSessionUnavailable'
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
