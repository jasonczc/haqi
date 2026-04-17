import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { EventPublisher } from '../sync/eventPublisher'
import type { SSEManager } from '../sse/sseManager'
import { startRunTracker } from './runTracker'

function setup() {
    const store = new Store(':memory:')
    const sse = { broadcast() {} } as unknown as SSEManager
    const publisher = new EventPublisher(sse, () => 'default')
    const handle = startRunTracker({ store, eventPublisher: publisher })
    return { store, publisher, handle }
}

function seedRun(store: Store, spawnRequestId: string) {
    const r = store.routines.createRoutine({
        id: 'r', namespace: 'default', name: 'r',
        trigger: { kind: 'api' }, spawn: {}, concurrency: 'skip'
    })
    const fire = store.routines.recordFire({
        id: 'f', namespace: r.namespace, routineId: r.id, routineVersion: 1,
        triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
    })
    const run = store.routines.createRun({
        id: 'run', namespace: r.namespace, routineId: r.id, routineVersion: 1,
        fireId: fire.id, status: 'queued'
    })
    store.routines.updateRunStatus(run.id, r.namespace, 'spawning', { spawnRequestId })
    return { routine: r, fire, run }
}

describe('RunTracker', () => {
    it('spawn phase creating-container → run status spawning (stable)', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-1')
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'sp-1', phase: 'creating-container' }
        } as any)
        expect(store.routines.getRun('run', 'default')?.status).toBe('spawning')
    })

    it('spawn phase succeeded → run.status=running and session_id set', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-2')
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'sp-2', phase: 'succeeded', sessionId: 'session-xyz' }
        } as any)
        const updated = store.routines.getRun('run', 'default')
        expect(updated?.status).toBe('running')
        expect(updated?.sessionId).toBe('session-xyz')
    })

    it('spawn phase failed → run.status=failed with message in outcome', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-3')
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'sp-3', phase: 'failed', error: { code: 'no_worker_available', message: 'no worker' } }
        } as any)
        const updated = store.routines.getRun('run', 'default')
        expect(updated?.status).toBe('failed')
        expect(updated?.outcome?.message).toContain('no worker')
    })

    it('session-updated with archiveReason=crash → run.status=failed', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-4')
        // bring run to `running` first
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'sp-4', phase: 'succeeded', sessionId: 'sess-1' }
        } as any)
        publisher.emit({
            type: 'session-updated',
            sessionId: 'sess-1',
            namespace: 'default',
            data: { metadata: { archiveReason: 'crash', archiveDetail: { exitCode: 1 } } }
        } as any)
        const final = store.routines.getRun('run', 'default')
        expect(final?.status).toBe('failed')
        expect(final?.outcome?.exitCode).toBe(1)
    })

    it('session-updated without archive fields is a no-op', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-5')
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'sp-5', phase: 'succeeded', sessionId: 'sess-2' }
        } as any)
        publisher.emit({
            type: 'session-updated',
            sessionId: 'sess-2',
            namespace: 'default',
            data: { metadata: { tools: ['bash'] } }
        } as any)
        expect(store.routines.getRun('run', 'default')?.status).toBe('running')
    })

    it('ignores spawn updates for unknown spawnRequestId', () => {
        const { store, publisher } = setup()
        seedRun(store, 'sp-6')
        publisher.emit({
            type: 'cloud-spawn-request-updated',
            namespace: 'default',
            data: { id: 'unrelated', phase: 'succeeded', sessionId: 'X' }
        } as any)
        expect(store.routines.getRun('run', 'default')?.status).toBe('spawning')
    })
})
