import { describe, expect, it } from 'bun:test'
import { selectWorker } from './scheduler'
import type { Machine } from '../sync/machineCache'

function makeMachine(id: string, overrides?: Partial<Machine>): Machine {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: `${id}.local`,
            platform: 'linux',
            happyCliVersion: '0.1.0',
            labels: [],
            capabilities: {},
        },
        metadataVersion: 1,
        runnerState: {
            capacity: {
                total: 1,
                used: 0,
            }
        },
        runnerStateVersion: 1,
        ...overrides,
    }
}

describe('selectWorker', () => {
    it('prefers the least loaded active worker', () => {
        const worker = selectWorker([
            makeMachine('a', {
                runnerState: { capacity: { total: 2, used: 1 } }
            }),
            makeMachine('b', {
                runnerState: { capacity: { total: 2, used: 0 } }
            })
        ])

        expect(worker?.id).toBe('b')
    })

    it('filters by docker capabilities when requested', () => {
        const worker = selectWorker([
            makeMachine('a', {
                metadata: {
                    host: 'a.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['docker'],
                    capabilities: { docker: true, dockerSession: true }
                }
            }),
            makeMachine('b')
        ], {
            requireDocker: true,
            requireDockerSession: true
        })

        expect(worker?.id).toBe('a')
    })

    it('filters by labels and capacity', () => {
        const worker = selectWorker([
            makeMachine('a', {
                metadata: {
                    host: 'a.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['gpu', 'docker'],
                    capabilities: { docker: true }
                },
                runnerState: { capacity: { total: 1, used: 1 } }
            }),
            makeMachine('b', {
                metadata: {
                    host: 'b.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['gpu', 'docker'],
                    capabilities: { docker: true }
                },
                runnerState: { capacity: { total: 2, used: 0 } }
            })
        ], {
            labels: ['gpu', 'docker'],
            requireDocker: true,
        })

        expect(worker?.id).toBe('b')
    })

    it('returns null when no worker matches', () => {
        const worker = selectWorker([
            makeMachine('a', { active: false }),
            makeMachine('b', {
                metadata: {
                    host: 'b.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['cpu-only'],
                    capabilities: {}
                }
            })
        ], {
            requireDocker: true,
            labels: ['gpu']
        })

        expect(worker).toBeNull()
    })

    const rejectedStates: Array<[string, Record<string, unknown>]> = [
        ['provisioning', { lifecycle: 'provisioning' }],
        ['booting', { lifecycle: 'booting' }],
        ['draining', { lifecycle: 'draining' }],
        ['stopped', { lifecycle: 'stopped' }],
        ['failed', { lifecycle: 'failed' }],
        ['shutting-down', { status: 'shutting-down' }]
    ]

    for (const [label, runnerState] of rejectedStates) {
        it(`rejects workers in ${label} state`, () => {
            const worker = selectWorker([
                makeMachine('a', {
                    runnerState: {
                        ...runnerState,
                        capacity: {
                            total: 1,
                            used: 0
                        }
                    }
                }),
                makeMachine('b')
            ])

            expect(worker?.id).toBe('b')
        })
    }
})

describe('self-hosted worker scenarios', () => {
    it('excludes draining workers', () => {
        const worker = selectWorker([
            makeMachine('draining-worker', {
                runnerState: {
                    lifecycle: 'draining',
                    capacity: { total: 1, used: 0 }
                }
            }),
            makeMachine('idle-worker')
        ])

        expect(worker?.id).toBe('idle-worker')
    })

    it('filters by docker capability', () => {
        const worker = selectWorker([
            makeMachine('no-docker', {
                metadata: {
                    host: 'no-docker.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: [],
                    capabilities: {}
                }
            }),
            makeMachine('docker-worker', {
                metadata: {
                    host: 'docker-worker.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: [],
                    capabilities: { docker: true }
                }
            })
        ], {
            requireDocker: true
        })

        expect(worker?.id).toBe('docker-worker')
    })

    it('balances load across workers', () => {
        const worker = selectWorker([
            makeMachine('busy-worker', {
                runnerState: { capacity: { total: 4, used: 3 } }
            }),
            makeMachine('free-worker', {
                runnerState: { capacity: { total: 4, used: 1 } }
            })
        ])

        expect(worker?.id).toBe('free-worker')
    })

    it('returns null when no workers match', () => {
        const worker = selectWorker([
            makeMachine('inactive-worker', { active: false }),
            makeMachine('draining-worker', {
                runnerState: {
                    lifecycle: 'draining',
                    capacity: { total: 1, used: 0 }
                }
            })
        ])

        expect(worker).toBeNull()
    })

    it('filters by labels', () => {
        const worker = selectWorker([
            makeMachine('cpu-only', {
                metadata: {
                    host: 'cpu-only.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['cpu'],
                    capabilities: {}
                }
            }),
            makeMachine('gpu-worker', {
                metadata: {
                    host: 'gpu-worker.local',
                    platform: 'linux',
                    happyCliVersion: '0.1.0',
                    labels: ['gpu'],
                    capabilities: {}
                }
            })
        ], {
            labels: ['gpu']
        })

        expect(worker?.id).toBe('gpu-worker')
    })
})
