import { describe, expect, it } from 'bun:test'

import {
    buildProviderSummaries,
    buildWorkerSummaries,
    filterWorkersByProvider,
    type CloudProviderName
} from './provider'
import type { Machine } from '../sync/machineCache'

function createMachine(overrides: Partial<Machine>): Machine {
    return {
        id: 'machine-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 10,
        active: true,
        activeAt: 10,
        metadata: {
            host: 'cloudbox',
            platform: 'linux',
            happyCliVersion: '0.1.0',
            executorType: 'cloud-self-hosted',
            provider: 'docker',
            capabilities: {
                docker: true
            },
            resources: {
                cpu: 4,
                memoryMb: 8192
            }
        },
        metadataVersion: 1,
        runnerState: {
            lifecycle: 'idle',
            environmentId: 'node-dev'
        },
        runnerStateVersion: 1,
        ...overrides
    }
}

describe('cloud provider helpers', () => {
    it('filters workers by provider', () => {
        const dockerWorker = createMachine({ id: 'docker-1' })
        const managedWorker = createMachine({
            id: 'managed-1',
            metadata: {
                ...dockerWorker.metadata!,
                provider: 'managed'
            }
        })

        const filtered = filterWorkersByProvider([dockerWorker, managedWorker], 'docker')
        expect(filtered.map((machine) => machine.id)).toEqual(['docker-1'])
    })

    it('keeps all workers for auto provider', () => {
        const workers = [
            createMachine({ id: 'docker-1' }),
            createMachine({
                id: 'manual-1',
                metadata: {
                    ...createMachine({}).metadata!,
                    provider: 'manual'
                }
            })
        ]

        expect(filterWorkersByProvider(workers, 'auto').map((machine) => machine.id)).toEqual([
            'docker-1',
            'manual-1'
        ])
    })

    it('builds worker summaries with normalized provider names', () => {
        const worker = createMachine({
            id: 'provider-1',
            metadata: {
                ...createMachine({}).metadata!,
                provider: 'kubernetes'
            },
            runnerState: {
                lifecycle: 'draining',
                environmentId: 'env-1',
                capacity: {
                    total: 2,
                    used: 1
                }
            }
        })

        const summaries = buildWorkerSummaries([worker])
        expect(summaries).toEqual([
            expect.objectContaining({
                machineId: 'provider-1',
                provider: 'kubernetes' satisfies CloudProviderName,
                lifecycle: 'draining',
                active: true,
                selectable: false,
                executorType: 'cloud-self-hosted',
                runnerState: expect.objectContaining({
                    lifecycle: 'draining',
                    capacity: {
                        total: 2,
                        used: 1
                    }
                })
            })
        ])
    })

    it('builds provider summaries with counts and provider types', () => {
        const workers = [
            createMachine({ id: 'docker-1' }),
            createMachine({
                id: 'managed-1',
                metadata: {
                    ...createMachine({}).metadata!,
                    provider: 'managed',
                    executorType: 'cloud-managed'
                }
            }),
            createMachine({
                id: 'unknown-1',
                metadata: {
                    ...createMachine({}).metadata!,
                    provider: 'something-custom'
                },
                runnerState: {
                    lifecycle: 'failed'
                }
            })
        ]

        expect(buildProviderSummaries(workers)).toEqual([
            { id: 'auto', type: 'self-hosted', count: 3, activeCount: 3, availableCount: 2 },
            { id: 'docker', type: 'self-hosted', count: 1, activeCount: 1, availableCount: 1 },
            { id: 'managed', type: 'managed', count: 1, activeCount: 1, availableCount: 1 },
            { id: 'unknown', type: 'self-hosted', count: 1, activeCount: 1, availableCount: 0 }
        ])
    })

    it('marks inactive and terminal workers as unavailable', () => {
        const summaries = buildWorkerSummaries([
            createMachine({
                id: 'inactive-1',
                active: false,
                runnerState: {
                    lifecycle: 'idle'
                }
            }),
            createMachine({
                id: 'failed-1',
                runnerState: {
                    lifecycle: 'failed'
                }
            })
        ])

        expect(summaries).toEqual([
            expect.objectContaining({
                machineId: 'inactive-1',
                selectable: false
            }),
            expect.objectContaining({
                machineId: 'failed-1',
                selectable: false
            })
        ])
    })
})
