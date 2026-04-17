import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function makeStore(): Store {
    return new Store(':memory:')
}

function createBasicRoutine(store: Store, overrides: { namespace?: string; name?: string } = {}) {
    return store.routines.createRoutine({
        id: crypto.randomUUID(),
        namespace: overrides.namespace ?? 'default',
        name: overrides.name ?? 'daily-review',
        trigger: { kind: 'api' },
        spawn: { promptTemplate: 'Hello {{text}}' },
        concurrency: 'skip'
    })
}

describe('RoutineStore — routines CRUD', () => {
    it('creates a routine with version=1, status=active, and round-trips JSON config', () => {
        const store = makeStore()
        const routine = createBasicRoutine(store)
        expect(routine.version).toBe(1)
        expect(routine.status).toBe('active')
        expect(routine.trigger.kind).toBe('api')
        expect(routine.spawn.promptTemplate).toBe('Hello {{text}}')
        expect(routine.concurrency).toBe('skip')
    })

    it('scopes get/list by namespace', () => {
        const store = makeStore()
        const a = createBasicRoutine(store, { namespace: 'ns-a', name: 'A' })
        createBasicRoutine(store, { namespace: 'ns-b', name: 'B' })
        expect(store.routines.getRoutine(a.id, 'ns-a')?.name).toBe('A')
        expect(store.routines.getRoutine(a.id, 'ns-b')).toBeNull()
        expect(store.routines.listRoutines('ns-a')).toHaveLength(1)
        expect(store.routines.listRoutines('ns-b')).toHaveLength(1)
    })

    it('update bumps version and persists changed fields', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const updated = store.routines.updateRoutine(r.id, r.namespace, {
            name: 'renamed',
            status: 'paused',
            concurrency: 'allow'
        })
        expect(updated?.version).toBe(2)
        expect(updated?.name).toBe('renamed')
        expect(updated?.status).toBe('paused')
        expect(updated?.concurrency).toBe('allow')
    })

    it('listActiveRoutinesByTrigger filters by trigger kind and active status', () => {
        const store = makeStore()
        const r1 = store.routines.createRoutine({
            id: 'r1', namespace: 'default', name: 'api',
            trigger: { kind: 'api' },
            spawn: {}, concurrency: 'skip'
        })
        store.routines.createRoutine({
            id: 'r2', namespace: 'default', name: 'sched',
            trigger: { kind: 'schedule', every: 'hour', minute: 0 },
            spawn: {}, concurrency: 'skip'
        })
        store.routines.updateRoutine(r1.id, 'default', { status: 'paused' })
        const apis = store.routines.listActiveRoutinesByTrigger('api')
        const schedules = store.routines.listActiveRoutinesByTrigger('schedule')
        expect(apis).toHaveLength(0)
        expect(schedules).toHaveLength(1)
    })

    it('delete cascades to fires/runs/events/tokens', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const token = store.routines.createFireToken({
            id: 't1', namespace: r.namespace, routineId: r.id,
            tokenHash: 'deadbeef', tokenPreview: 'dead...ef'
        })
        const fire = store.routines.recordFire({
            id: 'f1', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'api', actor: { type: 'api', tokenId: token.id }
        })
        const run = store.routines.createRun({
            id: 'run1', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'queued'
        })
        store.routines.appendEvent({
            namespace: r.namespace, routineId: r.id, runId: run.id, kind: 'run-queued'
        })

        expect(store.routines.deleteRoutine(r.id, r.namespace)).toBe(true)
        expect(store.routines.getRoutine(r.id, r.namespace)).toBeNull()
        expect(store.routines.listFires(r.id, r.namespace)).toHaveLength(0)
        expect(store.routines.listRuns(r.id, r.namespace)).toHaveLength(0)
        expect(store.routines.listEvents(r.id, r.namespace)).toHaveLength(0)
        expect(store.routines.listFireTokens(r.id, r.namespace)).toHaveLength(0)
    })
})

describe('RoutineStore — fire tokens', () => {
    it('roundtrips token record and finds by hash', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const created = store.routines.createFireToken({
            id: 'tok-1',
            namespace: r.namespace,
            routineId: r.id,
            tokenHash: 'a'.repeat(64),
            tokenPreview: 'aaaa...aaaa',
            name: 'ci-token',
            expiresAt: Date.now() + 1000
        })
        expect(created.name).toBe('ci-token')
        expect(store.routines.getFireTokenByHash('a'.repeat(64))?.id).toBe('tok-1')
        expect(store.routines.getFireTokenByHash('nope')).toBeNull()
    })

    it('revoke marks revoked_at and is idempotent (second revoke returns false)', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        store.routines.createFireToken({
            id: 'tok', namespace: r.namespace, routineId: r.id,
            tokenHash: 'h', tokenPreview: 'h'
        })
        expect(store.routines.revokeFireToken('tok', r.namespace)).toBe(true)
        expect(store.routines.revokeFireToken('tok', r.namespace)).toBe(false)
    })

    it('touchFireTokenLastUsed sets last_used_at', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        store.routines.createFireToken({
            id: 'tok', namespace: r.namespace, routineId: r.id,
            tokenHash: 'h', tokenPreview: 'h'
        })
        store.routines.touchFireTokenLastUsed('tok')
        const after = store.routines.listFireTokens(r.id, r.namespace)[0]
        expect(after.lastUsedAt).toBeDefined()
    })
})

describe('RoutineStore — fires + dedup', () => {
    it('rejects a duplicate (routineId, dedupKey) pair with FireDuplicateError', async () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        store.routines.recordFire({
            id: 'f1', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'github', actor: { type: 'github' }, dedupKey: 'delivery-42'
        })
        const { FireDuplicateError } = await import('./routines')
        let caught: unknown = null
        try {
            store.routines.recordFire({
                id: 'f2', namespace: r.namespace, routineId: r.id, routineVersion: 1,
                triggerKind: 'github', actor: { type: 'github' }, dedupKey: 'delivery-42'
            })
        } catch (err) { caught = err }
        expect(caught).toBeInstanceOf(FireDuplicateError)
    })

    it('allows multiple fires with no dedupKey on same routine', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        for (let i = 0; i < 3; i++) {
            store.routines.recordFire({
                id: `f${i}`, namespace: r.namespace, routineId: r.id, routineVersion: 1,
                triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
            })
        }
        expect(store.routines.listFires(r.id, r.namespace)).toHaveLength(3)
    })
})

describe('RoutineStore — runs + lookup helpers', () => {
    it('createRun with non-terminal status leaves ended_at null', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const fire = store.routines.recordFire({
            id: 'f', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        const run = store.routines.createRun({
            id: 'run', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'queued'
        })
        expect(run.status).toBe('queued')
        expect(run.endedAt).toBeUndefined()
    })

    it('updateRunStatus writes ended_at on terminal and exposes session_id lookup', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const fire = store.routines.recordFire({
            id: 'f', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        const run = store.routines.createRun({
            id: 'run', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'queued'
        })
        const updated = store.routines.updateRunStatus(run.id, r.namespace, 'succeeded', {
            sessionId: 'sess-42',
            outcome: { exitCode: 0 }
        })
        expect(updated?.status).toBe('succeeded')
        expect(updated?.endedAt).toBeDefined()
        expect(store.routines.findRunBySessionId('sess-42')?.id).toBe(run.id)
    })

    it('findActiveRunsForRoutine returns queued/spawning/running but not terminal', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const fire = store.routines.recordFire({
            id: 'f', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        const queued = store.routines.createRun({
            id: 'q', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'queued'
        })
        store.routines.createRun({
            id: 's', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'succeeded'
        })
        const active = store.routines.findActiveRunsForRoutine(r.id, r.namespace)
        expect(active.map((x) => x.id)).toEqual([queued.id])
    })
})

describe('RoutineStore — events', () => {
    it('appends rows and lists newest-first for the routine and oldest-first for a run', () => {
        const store = makeStore()
        const r = createBasicRoutine(store)
        const fire = store.routines.recordFire({
            id: 'f', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        const run = store.routines.createRun({
            id: 'run', namespace: r.namespace, routineId: r.id, routineVersion: 1,
            fireId: fire.id, status: 'queued'
        })
        store.routines.appendEvent({
            namespace: r.namespace, routineId: r.id, fireId: fire.id, runId: run.id, kind: 'fire-received'
        })
        store.routines.appendEvent({
            namespace: r.namespace, routineId: r.id, fireId: fire.id, runId: run.id, kind: 'run-queued'
        })
        const routineEvents = store.routines.listEvents(r.id, r.namespace)
        // newest first
        expect(routineEvents[0].kind).toBe('run-queued')
        const runEvents = store.routines.listEventsForRun(run.id, r.namespace)
        // oldest first
        expect(runEvents[0].kind).toBe('fire-received')
        expect(runEvents[1].kind).toBe('run-queued')
    })
})
