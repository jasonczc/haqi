import { selectWorker, type SelectWorkerOptions } from './scheduler'
import type { Machine } from '../sync/machineCache'
import type { WorkerSummary } from './types'
import type { WorkerLifecycle } from '@hapi/protocol/types'

export type CloudProviderName = 'auto' | 'manual' | 'docker' | 'managed' | 'kubernetes' | 'vm' | 'unknown'

function normalizeProvider(value: string | undefined): CloudProviderName {
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

export function filterWorkersByProvider(
    machines: Machine[],
    provider: CloudProviderName
): Machine[] {
    if (provider === 'auto') {
        return machines
    }

    return machines.filter((machine) => normalizeProvider(machine.metadata?.provider) === provider)
}

export function buildWorkerSummaries(machines: Machine[]): WorkerSummary[] {
    return machines.map((machine) => ({
        machineId: machine.id,
        provider: normalizeProvider(machine.metadata?.provider),
        environmentId: machine.metadata?.environmentId,
        lifecycle: (() => {
            if (!machine.runnerState || typeof machine.runnerState !== 'object') {
                return undefined
            }
            const value = (machine.runnerState as { lifecycle?: unknown }).lifecycle
            return typeof value === 'string' ? value as WorkerLifecycle : undefined
        })(),
        capabilities: machine.metadata?.capabilities as WorkerSummary['capabilities'],
        resources: machine.metadata?.resources as WorkerSummary['resources'],
        updatedAt: machine.updatedAt
    }))
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
