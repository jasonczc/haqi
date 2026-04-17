/**
 * EffectFirePipeline integration test.
 *
 * These tests boot the full @effect/cluster + @effect/workflow stack
 * against a per-test SQLite file. They're slower than the legacy
 * FirePipeline tests (~50ms each) because the engine layers + runner
 * spin up a real background fiber loop. Run them serially.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SSEManager } from '../../sse/sseManager'
import { Store } from '../../store'
import { EventPublisher } from '../../sync/eventPublisher'
import type { MachineSpawnRequest } from '@hapi/protocol/schemas'
import type { SpawnCoordinatorLike } from '../firePipeline'
import { EffectFirePipeline } from './EffectFirePipeline'

type Env = {
    store: Store
    spawns: Array<{ namespace: string; machineId: string; request: MachineSpawnRequest }>
    publisher: EventPublisher
    events: Array<{ type: string; runId?: string; status?: string }>
    pipeline: EffectFirePipeline
    tmpDir: string
}

function setupEnv(): Env {
    const store = new Store(':memory:')
    const spawns: Env['spawns'] = []
    const coordinator: SpawnCoordinatorLike = {
        enqueue(namespace, machineId, request) {
            spawns.push({ namespace, machineId, request })
            return { id: `sp-${spawns.length}` }
        }
    }
    const sseStub = { broadcast() {} } as unknown as SSEManager
    const publisher = new EventPublisher(sseStub, () => 'default')
    const events: Env['events'] = []
    publisher.subscribe((e) =>
        events.push({
            type: e.type,
            runId: (e as any).runId,
            status: (e as any).status
        })
    )
    const tmpDir = mkdtempSync(join(tmpdir(), 'haqi-routines-effect-'))
    const pipeline = new EffectFirePipeline({
        store,
        spawnCoordinator: coordinator,
        eventPublisher: publisher,
        dbPath: join(tmpDir, 'engine.db')
    })
    return { store, spawns, publisher, events, pipeline, tmpDir }
}

async function teardown(env: Env) {
    await env.pipeline.stop()
    rmSync(env.tmpDir, { recursive: true, force: true })
}

function createRoutine(
    env: Env,
    overrides: {
        concurrency?: 'skip' | 'cancel-previous' | 'allow'
        filter?: import('@hapi/protocol/schemas').FilterExpression
        status?: 'active' | 'paused'
    } = {}
) {
    const r = env.store.routines.createRoutine({
        id: 'r1',
        namespace: 'default',
        name: 'r',
        trigger: { kind: 'api' },
        filter: overrides.filter,
        spawn: { promptTemplate: 'go' },
        concurrency: overrides.concurrency ?? 'skip'
    })
    if (overrides.status === 'paused') {
        env.store.routines.updateRoutine(r.id, r.namespace, { status: 'paused' })
    }
    return env.store.routines.getRoutine(r.id, r.namespace)!
}

async function waitForCondition(
    check: () => boolean,
    timeoutMs = 2000,
    intervalMs = 20
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (check()) return true
        await new Promise((r) => setTimeout(r, intervalMs))
    }
    return check()
}

describe('EffectFirePipeline', () => {
    let env: Env
    beforeEach(() => {
        env = setupEnv()
    })
    afterEach(async () => {
        await teardown(env)
    })

    it('submit returns accepted + fire + queued run; workflow proceeds to spawn in the background', async () => {
        createRoutine(env)
        const result = await env.pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'api',
            actor: { type: 'api', tokenId: 't' }
        })
        expect(result.kind).toBe('accepted')
        // Background workflow should eventually enqueue a spawn.
        const spawned = await waitForCondition(() => env.spawns.length === 1)
        expect(spawned).toBe(true)
        expect(env.spawns[0].request.labels).toContain('routine:r1')
    })

    it('filter-rejected short-circuits without spawning', async () => {
        createRoutine(env, { filter: { op: 'eq', path: 'pr.state', value: 'closed' } })
        const result = await env.pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'github',
            actor: { type: 'github' },
            payload: { pr: { state: 'open' } }
        })
        expect(result.kind).toBe('skipped')
        if (result.kind === 'skipped') expect(result.reason).toBe('filter-rejected')
        // Give the engine a moment — spawn should NEVER happen.
        await new Promise((r) => setTimeout(r, 100))
        expect(env.spawns).toHaveLength(0)
    })

    it('duplicate dedupKey returns duplicate and does not double-spawn', async () => {
        createRoutine(env, { concurrency: 'allow' })
        const first = await env.pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'github',
            actor: { type: 'github' },
            dedupKey: 'k1'
        })
        expect(first.kind).toBe('accepted')
        const second = await env.pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'github',
            actor: { type: 'github' },
            dedupKey: 'k1'
        })
        expect(second.kind).toBe('duplicate')
        await waitForCondition(() => env.spawns.length >= 1)
        // Only the first fire produces a spawn (engine caches execution by idempotencyKey).
        expect(env.spawns).toHaveLength(1)
    })

    it('routine-not-found and routine-inactive short-circuit', async () => {
        expect(
            (await env.pipeline.submit({
                namespace: 'default',
                routineId: 'nope',
                triggerKind: 'api',
                actor: { type: 'api', tokenId: 't' }
            })).kind
        ).toBe('routine-not-found')
        createRoutine(env, { status: 'paused' })
        expect(
            (await env.pipeline.submit({
                namespace: 'default',
                routineId: 'r1',
                triggerKind: 'api',
                actor: { type: 'api', tokenId: 't' }
            })).kind
        ).toBe('routine-inactive')
    })

    it('signalTerminal resolves the workflow (integration)', async () => {
        createRoutine(env)
        const result = await env.pipeline.submit({
            namespace: 'default',
            routineId: 'r1',
            triggerKind: 'api',
            actor: { type: 'api', tokenId: 't' }
        })
        expect(result.kind).toBe('accepted')
        if (result.kind !== 'accepted') return
        // Wait for workflow to reach the await-terminal step.
        await waitForCondition(() => env.spawns.length === 1)
        await env.pipeline.signalTerminal({
            fireId: result.fire.id,
            status: 'succeeded',
            sessionId: 'sess-1',
            exitCode: 0
        })
        // The run row should eventually flip to 'succeeded'.
        const ok = await waitForCondition(() => {
            const run = env.store.routines.getRun(result.run.id, 'default')
            return run?.status === 'succeeded'
        })
        expect(ok).toBe(true)
    })
})
