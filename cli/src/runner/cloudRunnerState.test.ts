import { describe, expect, it } from 'vitest'
import { buildCloudRunnerStateSnapshot } from './cloudRunnerState'

describe('buildCloudRunnerStateSnapshot', () => {
    it('derives busy lifecycle and capacity from active sessions', () => {
        const state = buildCloudRunnerStateSnapshot({
            baseState: null,
            pid: 123,
            httpPort: 4001,
            usedSessions: 2,
            capacityTotal: 4,
            currentSessionId: 'session-1'
        })

        expect(state).toEqual(expect.objectContaining({
            status: 'running',
            lifecycle: 'busy',
            pid: 123,
            httpPort: 4001,
            currentSessionId: 'session-1',
            capacity: {
                total: 4,
                used: 2
            }
        }))
    })

    it('preserves explicit lifecycle and existing state details', () => {
        const startedAt = 123456
        const state = buildCloudRunnerStateSnapshot({
            baseState: {
                status: 'running',
                startedAt,
                currentSessionId: null,
                capacity: {
                    total: 1,
                    used: 0
                },
                lastSpawnError: {
                    message: 'previous failure',
                    at: startedAt
                }
            },
            pid: 999,
            httpPort: 4100,
            usedSessions: 0,
            lifecycle: 'preparing-workspace',
            workspacePreparation: {
                phase: 'cloning-repo',
                progress: 20,
                updatedAt: startedAt
            }
        })

        expect(state.startedAt).toBe(startedAt)
        expect(state.lifecycle).toBe('preparing-workspace')
        expect(state.workspacePreparation).toEqual(expect.objectContaining({
            phase: 'cloning-repo',
            progress: 20
        }))
        expect(state.lastSpawnError).toEqual({
            message: 'previous failure',
            at: startedAt
        })
    })
})
