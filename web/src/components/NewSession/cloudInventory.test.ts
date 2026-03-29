import { describe, expect, it } from 'vitest'
import { getCloudInventorySummary, getCloudRuntimeWarning } from './cloudInventory'
import type { CloudProviderSummary, CloudWorkerSummary } from '@/types/api'

describe('cloudInventory helpers', () => {
    it('builds inventory summary from providers and workers', () => {
        const providers: CloudProviderSummary[] = [
            { id: 'docker', type: 'self-hosted', count: 2 },
            { id: 'managed', type: 'managed', count: 1 }
        ]
        const workers: CloudWorkerSummary[] = [
            {
                machineId: 'worker-1',
                provider: 'docker',
                active: true,
                executorType: 'cloud-self-hosted',
                lifecycle: 'idle',
                updatedAt: 1
            },
            {
                machineId: 'worker-2',
                provider: 'managed',
                active: false,
                executorType: 'cloud-managed',
                lifecycle: 'stopped',
                updatedAt: 2
            }
        ]

        expect(getCloudInventorySummary({
            backend: 'cloud-self-hosted',
            selectedMachineId: 'worker-1',
            environmentId: '',
            providers,
            workers
            ,
            environments: []
        })).toEqual({
            providerCount: 2,
            workerCount: 2,
            activeWorkerCount: 1,
            selectedWorker: expect.objectContaining({ machineId: 'worker-1' }),
            matchingEnvironments: [],
            selectedEnvironment: null
        })
    })

    it('returns warning when docker session is unsupported by selected worker', () => {
        expect(getCloudRuntimeWarning({
            runtimeKind: 'docker-session',
            selectedWorker: {
                machineId: 'worker-1',
                provider: 'docker',
                active: true,
                executorType: 'cloud-self-hosted',
                capabilities: {
                    docker: true,
                    dockerSession: false
                },
                updatedAt: 1
            }
        })).toBe('dockerSessionUnavailable')
    })

    it('returns warning when host process mode lacks docker support', () => {
        expect(getCloudRuntimeWarning({
            runtimeKind: 'host-process',
            selectedWorker: {
                machineId: 'worker-1',
                provider: 'docker',
                active: true,
                executorType: 'cloud-self-hosted',
                capabilities: {
                    docker: false
                },
                updatedAt: 1
            }
        })).toBe('dockerUnavailable')
    })

    it('returns no warning when capabilities satisfy runtime', () => {
        expect(getCloudRuntimeWarning({
            runtimeKind: 'docker-session',
            selectedWorker: {
                machineId: 'worker-1',
                provider: 'docker',
                active: true,
                executorType: 'cloud-self-hosted',
                capabilities: {
                    docker: true,
                    dockerSession: true
                },
                updatedAt: 1
            }
        })).toBeNull()
    })
})
