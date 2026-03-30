import { selectWorker, type SelectWorkerOptions } from './scheduler'
import type { Machine } from '../sync/machineCache'
import type { ProviderSummary, WorkerSummary } from './types'
import { isRunnerStateSelectable, summarizeRunnerState } from './workerState'

export const CLOUD_PROVIDER_NAMES = [
    'auto',
    'manual',
    'docker',
    'managed',
    'kubernetes',
    'vm',
    'unknown'
] as const

export type CloudProviderName = typeof CLOUD_PROVIDER_NAMES[number]

function isCloudWorker(machine: Machine): boolean {
    return machine.metadata?.executorType === 'cloud-self-hosted'
        || machine.metadata?.executorType === 'cloud-managed'
}

export function normalizeProvider(value: string | undefined): CloudProviderName {
    if (!value) {
        return 'unknown'
    }
    const normalized = value.trim().toLowerCase()
    if (
        normalized === 'manual'
        || normalized === 'docker'
        || normalized === 'managed'
        || normalized === 'kubernetes'
        || normalized === 'vm'
    ) {
        return normalized
    }
    return 'unknown'
}

function resolveProviderType(machine: Machine): ProviderSummary['type'] {
    if (machine.metadata?.executorType === 'cloud-managed' || normalizeProvider(machine.metadata?.provider) === 'managed') {
        return 'managed'
    }
    return 'self-hosted'
}

export function filterWorkersByProvider(
    machines: Machine[],
    provider: CloudProviderName
): Machine[] {
    const cloudMachines = machines.filter(isCloudWorker)

    if (provider === 'auto') {
        return cloudMachines
    }

    return cloudMachines.filter((machine) => normalizeProvider(machine.metadata?.provider) === provider)
}

export function buildWorkerSummaries(
    machines: Machine[],
    getActiveRequestCount?: (machineId: string, namespace: string) => number
): WorkerSummary[] {
    return machines.filter(isCloudWorker).map((machine) => {
        const runnerState = summarizeRunnerState(machine.runnerState)
        return {
            machineId: machine.id,
            provider: normalizeProvider(machine.metadata?.provider),
            active: machine.active,
            selectable: machine.active && isRunnerStateSelectable(runnerState),
            activeRequestsCount: getActiveRequestCount?.(machine.id, machine.namespace),
            environmentId: machine.metadata?.environmentId,
            executorType: machine.metadata?.executorType,
            lifecycle: runnerState?.lifecycle,
            region: machine.metadata?.region,
            workerVersion: machine.metadata?.workerVersion,
            labels: machine.metadata?.labels,
            capabilities: machine.metadata?.capabilities as WorkerSummary['capabilities'],
            resources: machine.metadata?.resources as WorkerSummary['resources'],
            runnerState,
            updatedAt: machine.updatedAt
        }
    })
}

function buildProviderSummary(machine: Machine): ProviderSummary {
    const runnerState = summarizeRunnerState(machine.runnerState)
    return {
        id: normalizeProvider(machine.metadata?.provider),
        type: resolveProviderType(machine),
        count: 1,
        activeCount: machine.active ? 1 : 0,
        availableCount: machine.active && isRunnerStateSelectable(runnerState) ? 1 : 0
    }
}

export function buildProviderSummaries(machines: Machine[]): ProviderSummary[] {
    const cloudMachines = machines.filter(isCloudWorker)
    const counts = new Map<CloudProviderName, ProviderSummary>()

    counts.set('auto', {
        id: 'auto',
        type:
            cloudMachines.length > 0 && cloudMachines.every((machine) => resolveProviderType(machine) === 'managed')
                ? 'managed'
                : 'self-hosted',
        count: cloudMachines.length,
        activeCount: cloudMachines.filter((machine) => machine.active).length,
        availableCount: cloudMachines.filter((machine) => {
            const runnerState = summarizeRunnerState(machine.runnerState)
            return machine.active && isRunnerStateSelectable(runnerState)
        }).length
    })

    for (const machine of cloudMachines) {
        const provider = normalizeProvider(machine.metadata?.provider)
        const current = counts.get(provider)
        if (current) {
            current.count += 1
            if (machine.active) {
                current.activeCount += 1
            }
            const runnerState = summarizeRunnerState(machine.runnerState)
            if (machine.active && isRunnerStateSelectable(runnerState)) {
                current.availableCount += 1
            }
            continue
        }
        counts.set(provider, buildProviderSummary(machine))
    }

    return [...counts.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export type WorkerProviderResult =
    | { type: 'selected'; machine: Machine }
    | { type: 'unavailable'; reason: 'no_matching_worker' }

export type WorkerProvider = {
    id: string
    selectWorker: (machines: Machine[], options?: SelectWorkerOptions) => WorkerProviderResult
}

export function createSelfHostedWorkerProvider(): WorkerProvider {
    return {
        id: 'self-hosted',
        selectWorker(machines, options) {
            const machine = selectWorker(machines, options)
            if (!machine) {
                return { type: 'unavailable', reason: 'no_matching_worker' }
            }
            return { type: 'selected', machine }
        }
    }
}
