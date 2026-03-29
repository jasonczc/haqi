import { selectWorker, type SelectWorkerOptions } from './scheduler'
import type { Machine } from '../sync/machineCache'
import type { ProviderSummary, WorkerSummary } from './types'
import type { WorkerLifecycle } from '@hapi/protocol/types'

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

export function buildWorkerSummaries(machines: Machine[]): WorkerSummary[] {
    return machines.filter(isCloudWorker).map((machine) => ({
        machineId: machine.id,
        provider: normalizeProvider(machine.metadata?.provider),
        active: machine.active,
        environmentId: machine.metadata?.environmentId,
        executorType: machine.metadata?.executorType,
        lifecycle: (() => {
            if (!machine.runnerState || typeof machine.runnerState !== 'object') {
                return undefined
            }
            const value = (machine.runnerState as { lifecycle?: unknown }).lifecycle
            return typeof value === 'string' ? value as WorkerLifecycle : undefined
        })(),
        region: machine.metadata?.region,
        labels: machine.metadata?.labels,
        capabilities: machine.metadata?.capabilities as WorkerSummary['capabilities'],
        resources: machine.metadata?.resources as WorkerSummary['resources'],
        updatedAt: machine.updatedAt
    }))
}

export function buildProviderSummaries(machines: Machine[]): ProviderSummary[] {
    const cloudMachines = machines.filter(isCloudWorker)
    const counts = new Map<CloudProviderName, ProviderSummary>()

    counts.set('auto', {
        id: 'auto',
        type: cloudMachines.every((machine) => resolveProviderType(machine) === 'managed') ? 'managed' : 'self-hosted',
        count: cloudMachines.length
    })

    for (const machine of cloudMachines) {
        const provider = normalizeProvider(machine.metadata?.provider)
        const current = counts.get(provider)
        if (current) {
            current.count += 1
            continue
        }
        counts.set(provider, {
            id: provider,
            type: resolveProviderType(machine),
            count: 1
        })
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
