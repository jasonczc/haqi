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
