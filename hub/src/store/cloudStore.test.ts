import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('CloudStore worker sessions', () => {
    it('creates, looks up, touches, and revokes worker session tokens', () => {
        const store = new Store(':memory:')
        const created = store.cloud.createWorkerSession({
            namespace: 'default',
            machineId: 'machine-1',
            tokenHash: 'hash-1',
            tokenPreview: 'hqs_12...abcd'
        })

        expect(created.namespace).toBe('default')
        expect(created.machineId).toBe('machine-1')
        expect(created.revokedAt).toBeNull()

        const byHash = store.cloud.getWorkerSessionByHash('hash-1')
        expect(byHash?.id).toBe(created.id)

        const touched = store.cloud.touchWorkerSession(created.id, 1234)
        expect(touched?.lastUsedAt).toBe(1234)

        const revoked = store.cloud.revokeWorkerSession(created.id, 5678)
        expect(revoked?.revokedAt).toBe(5678)
    })
})
