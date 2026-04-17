import { describe, expect, it } from 'bun:test'
import type { MachineSpawnRequest } from '@hapi/protocol/schemas'
import { Store } from '../store'
import { FirePipeline, renderPrompt } from './firePipeline'
import type { SpawnCoordinatorLike } from './firePipeline'
import { EventPublisher } from '../sync/eventPublisher'
import type { SSEManager } from '../sse/sseManager'

type RecordedSpawn = { namespace: string; machineId: string; request: MachineSpawnRequest }

function setup() {
    const store = new Store(':memory:')
    const spawns: RecordedSpawn[] = []
    const coordinator: SpawnCoordinatorLike = {
        enqueue(namespace, machineId, request) {
            spawns.push({ namespace, machineId, request })
            return { id: `spawn-${spawns.length}` }
        }
    }
    // Minimal SSEManager stub — EventPublisher only calls .broadcast().
    const sseStub = { broadcast() {} } as unknown as SSEManager
    const events: Array<{ type: string; runId?: string }> = []
    const publisher = new EventPublisher(sseStub, () => 'default')
    publisher.subscribe((e) => events.push({ type: e.type, runId: (e as any).runId }))
    const pipeline = new FirePipeline(store, coordinator, publisher)
    return { store, spawns, pipeline, events }
}

function makeRoutine(
    store: Store,
    overrides: {
        concurrency?: 'skip' | 'queue' | 'cancel-previous' | 'allow'
        filter?: import('@hapi/protocol/schemas').FilterExpression
        status?: 'active' | 'paused' | 'archived'
        promptTemplate?: string
    } = {}
) {
    const routine = store.routines.createRoutine({
        id: 'r1',
        namespace: 'default',
        name: 'r',
        trigger: { kind: 'api' },
        filter: overrides.filter,
        spawn: { promptTemplate: overrides.promptTemplate ?? 'say hi' },
        concurrency: overrides.concurrency ?? 'skip'
    })
    if (overrides.status && overrides.status !== 'active') {
        store.routines.updateRoutine(routine.id, routine.namespace, { status: overrides.status })
    }
    return store.routines.getRoutine(routine.id, routine.namespace)!
}

describe('FirePipeline.submit — happy path', () => {
    it('records fire, creates run, enqueues spawn, emits run-updated', async () => {
        const { store, spawns, pipeline, events } = setup()
        const routine = makeRoutine(store)
        const result = await pipeline.submit({
            namespace: routine.namespace,
            routineId: routine.id,
            triggerKind: 'api',
            actor: { type: 'api', tokenId: 't' },
            payload: { hello: 'world' },
            textContext: 'please review'
        })
        expect(result.kind).toBe('accepted')
        if (result.kind !== 'accepted') return
        expect(spawns).toHaveLength(1)
        expect(spawns[0].request.labels).toContain(`routine:${routine.id}`)
        // initialPrompt rendered from template + text context
        expect(spawns[0].request.initialPrompt).toBe('say hi')
        // run flowed queued → spawning
        const runEvents = events.filter((e) => e.type === 'routine-run-updated')
        expect(runEvents.length).toBeGreaterThanOrEqual(2)
        const finalRun = store.routines.getRun(result.run.id, routine.namespace)
        expect(finalRun?.status).toBe('spawning')
        expect(finalRun?.spawnRequestId).toBe('spawn-1')
    })
})

describe('FirePipeline.submit — filters', () => {
    it('skips with filter-rejected when filter is false', async () => {
        const { store, spawns, pipeline } = setup()
        makeRoutine(store, {
            filter: { op: 'eq', path: 'pr.state', value: 'closed' }
        })
        const result = await pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'github',
            actor: { type: 'github' },
            payload: { pr: { state: 'open' } }
        })
        expect(result.kind).toBe('skipped')
        if (result.kind === 'skipped') expect(result.reason).toBe('filter-rejected')
        expect(spawns).toHaveLength(0)
        // "skipped" event row was written
        const events = store.routines.listEvents('r1', 'default')
        expect(events.some((e) => e.kind === 'skipped')).toBe(true)
    })
})

describe('FirePipeline.submit — concurrency policies', () => {
    async function setupWithActiveRun(policy: 'skip' | 'cancel-previous' | 'allow' | 'queue') {
        const { store, spawns, pipeline } = setup()
        makeRoutine(store, { concurrency: policy })
        // First fire → spawn
        await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        return { store, spawns, pipeline }
    }

    it('skip: second fire becomes skipped/concurrency-skip', async () => {
        const { store, spawns, pipeline } = await setupWithActiveRun('skip')
        const second = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        expect(second.kind).toBe('skipped')
        if (second.kind === 'skipped') expect(second.reason).toBe('concurrency-skip')
        expect(spawns).toHaveLength(1)
    })

    it('cancel-previous: prior run flips to cancelled, new run is accepted', async () => {
        const { store, spawns, pipeline } = await setupWithActiveRun('cancel-previous')
        const first = store.routines.findActiveRunsForRoutine('r1', 'default')[0]
        const second = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        expect(second.kind).toBe('accepted')
        expect(spawns).toHaveLength(2)
        expect(store.routines.getRun(first.id, 'default')?.status).toBe('cancelled')
    })

    it('allow: both runs go through', async () => {
        const { spawns, pipeline } = await setupWithActiveRun('allow')
        const second = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        expect(second.kind).toBe('accepted')
        expect(spawns).toHaveLength(2)
    })
})

describe('FirePipeline.submit — edge cases', () => {
    it('returns routine-not-found for an unknown routine id', async () => {
        const { pipeline } = setup()
        const res = await pipeline.submit({
            namespace: 'default', routineId: 'missing',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        expect(res.kind).toBe('routine-not-found')
    })

    it('returns routine-inactive for a paused routine', async () => {
        const { store, pipeline } = setup()
        makeRoutine(store, { status: 'paused' })
        const res = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'api', actor: { type: 'api', tokenId: 't' }
        })
        expect(res.kind).toBe('routine-inactive')
    })

    it('duplicate dedupKey is reported as duplicate without creating a new run', async () => {
        const { store, pipeline } = setup()
        makeRoutine(store)
        const a = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'github', actor: { type: 'github' }, dedupKey: 'x1'
        })
        expect(a.kind).toBe('accepted')
        const b = await pipeline.submit({
            namespace: 'default', routineId: 'r1',
            triggerKind: 'github', actor: { type: 'github' }, dedupKey: 'x1'
        })
        expect(b.kind).toBe('duplicate')
        // Only one run in DB
        expect(store.routines.listRuns('r1', 'default')).toHaveLength(1)
    })
})

describe('renderPrompt', () => {
    const routine = {
        id: 'r1', namespace: 'default', name: 'n', version: 1, status: 'active' as const,
        trigger: { kind: 'api' as const },
        spawn: {}, concurrency: 'skip' as const,
        createdAt: 0, updatedAt: 0
    }
    const fire = {
        id: 'f1', namespace: 'default', routineId: 'r1', routineVersion: 1,
        triggerKind: 'api' as const, actor: { type: 'api' as const, tokenId: 't' }, firedAt: 0
    }

    it('returns textContext when template is undefined', () => {
        expect(renderPrompt(undefined, { routine, fire, payload: {}, textContext: 'fallback' })).toBe('fallback')
    })

    it('substitutes {{payload.path}} and {{routine.name}}', () => {
        const out = renderPrompt('Review PR {{payload.pr.number}} in {{routine.name}}', {
            routine: { ...routine, name: 'review-pr' },
            fire, payload: { pr: { number: 42 } }
        })
        expect(out).toBe('Review PR 42 in review-pr')
    })

    it('substitutes {{text}} from textContext', () => {
        const out = renderPrompt('Context: {{text}}', { routine, fire, payload: {}, textContext: 'urgent' })
        expect(out).toBe('Context: urgent')
    })

    it('empty-string for missing values (no undefined leaks into prompt)', () => {
        const out = renderPrompt('A={{payload.a}} B={{payload.missing.deep}} R={{routine.nope}}', {
            routine, fire, payload: { a: 'x' }
        })
        expect(out).toBe('A=x B= R=')
    })
})
