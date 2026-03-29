import { describe, expect, it } from 'bun:test'

import { buildWorkerSummaries, filterWorkersByProvider, type CloudProviderName } from './provider'
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
                lifecycle: 'busy',
                environmentId: 'env-1'
            }
        })

        const summaries = buildWorkerSummaries([worker])
        expect(summaries).toEqual([
            expect.objectContaining({
                machineId: 'provider-1',
                provider: 'kubernetes' satisfies CloudProviderName,
                lifecycle: 'busy'
            })
        ])
    })
})
