/**
 * FirePipeline backend powered by @effect/workflow.
 *
 * Same external surface as the legacy FirePipeline (`submit()` returns
 * a FireSubmitResult), but the lifecycle is owned by the workflow
 * engine:
 *
 *   submit() → insert fire row → engine.execute(RoutineRunWorkflow, …)
 *   └─  workflow handles filter → concurrency → spawn → terminal wait
 *       and writes status transitions back to routine_runs via the
 *       `onRunStatus` callback injected into the workflow layer.
 *
 * The workflow runs DETACHED — submit() kicks it off and returns as
 * soon as the fire is recorded + the queued run row exists. The
 * workflow continues in the engine's scope until it resolves through
 * the DurableDeferred.
 *
 * Crash recovery: because executionId = fire.id and the engine
 * persists every activity attempt, restarting the hub re-plays the
 * workflow without repeating completed activities. The
 * DurableDeferred survives restart: whatever code signalled it before
 * the crash (or will signal it after) resolves the workflow.
 */

import { randomUUID } from 'node:crypto'
import { Effect, Exit } from 'effect'
import { Runtime, Layer, Scope } from 'effect'
import { WorkflowEngine } from '@effect/workflow/WorkflowEngine'
import type { Store } from '../../store'
import type { EventPublisher } from '../../sync/eventPublisher'
import { FireDuplicateError } from '../../store/routines'
import { evaluateFilter } from '../filterEvaluator'
import type {
    FireSubmitRequest,
    FireSubmitResult,
    SpawnCoordinatorLike
} from '../firePipeline'
import type { RoutineRunStatus } from '@hapi/protocol/schemas'
import { RoutineRunWorkflow, TerminalDeferred, buildRoutineWorkflowLayer } from './RoutineWorkflow'
import { buildEffectLayers } from './layers'

export type EffectFirePipelineConfig = {
    store: Store
    spawnCoordinator: SpawnCoordinatorLike
    eventPublisher: EventPublisher
    /** Absolute path to the workflow engine's dedicated SQLite file. */
    dbPath: string
}

export class EffectFirePipeline {
    private readonly store: Store
    private readonly eventPublisher: EventPublisher
    private readonly runtime: Promise<Runtime.Runtime<WorkflowEngine>>
    private readonly scopeCloseable: Promise<Scope.CloseableScope>

    constructor(config: EffectFirePipelineConfig) {
        this.store = config.store
        this.eventPublisher = config.eventPublisher

        const { engineLayer } = buildEffectLayers({ dbPath: config.dbPath })

        const workflowLayer = buildRoutineWorkflowLayer({
            store: config.store,
            spawnCoordinator: config.spawnCoordinator,
            onRunStatus: (update) => this.persistRunStatus(update)
        })

        const fullLayer = workflowLayer.pipe(Layer.provideMerge(engineLayer))

        // Build a long-lived runtime that holds the engine open for the
        // hub's lifetime. We expose only the WorkflowEngine tag.
        this.scopeCloseable = Effect.runPromise(Scope.make())
        this.runtime = this.scopeCloseable.then((scope) =>
            Effect.runPromise(
                Layer.toRuntime(fullLayer).pipe(Scope.extend(scope)) as Effect.Effect<
                    Runtime.Runtime<WorkflowEngine>,
                    unknown,
                    never
                >
            )
        )
    }

    /**
     * Terminate the workflow engine's scope. Closes the SQLite pool,
     * cancels background fibers. Call on hub shutdown.
     */
    async stop(): Promise<void> {
        const scope = await this.scopeCloseable
        await Effect.runPromise(Scope.close(scope, Exit.void))
    }

    async submit(req: FireSubmitRequest): Promise<FireSubmitResult> {
        const routine = this.store.routines.getRoutine(req.routineId, req.namespace)
        if (!routine) return { kind: 'routine-not-found' }
        if (routine.status !== 'active')
            return { kind: 'routine-inactive', status: routine.status }

        const filter = evaluateFilter(routine.filter, req.payload)

        // Record the fire row first — dedupKey uniqueness handled here.
        const fireId = randomUUID()
        let fire
        try {
            fire = this.store.routines.recordFire({
                id: fireId,
                namespace: req.namespace,
                routineId: routine.id,
                routineVersion: routine.version,
                triggerKind: req.triggerKind,
                payload: req.payload,
                actor: req.actor,
                dedupKey: req.dedupKey,
                filterResult: filter
            })
        } catch (err) {
            if (err instanceof FireDuplicateError) {
                return { kind: 'duplicate', dedupKey: err.dedupKey, routineId: err.routineId }
            }
            throw err
        }

        this.store.routines.appendEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            kind: 'fire-received',
            data: { triggerKind: req.triggerKind, actor: req.actor }
        })
        this.store.routines.appendEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            kind: 'filter-evaluated',
            data: filter
        })

        // Pre-create the run row in 'queued' state so UI has something
        // to show immediately. The workflow will transition it forward.
        const run = this.store.routines.createRun({
            id: fire.id, // 1:1 with fire for simplicity; workflow uses fireId as executionId
            namespace: req.namespace,
            routineId: routine.id,
            routineVersion: routine.version,
            fireId: fire.id,
            status: 'queued'
        })
        this.emitRunUpdate(run.id, run.routineId, run.namespace, 'queued')
        this.store.routines.appendEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            runId: run.id,
            kind: 'run-queued',
            data: {}
        })

        // If filter rejected, short-circuit WITHOUT invoking the workflow.
        // This is a perf optimization — engine would produce the same result.
        if (!filter.matched) {
            const updated = this.store.routines.updateRunStatus(run.id, req.namespace, 'skipped', {
                outcome: { message: 'filter-rejected' }
            })
            if (updated) this.emitRunUpdate(updated.id, updated.routineId, updated.namespace, 'skipped')
            this.store.routines.appendEvent({
                namespace: req.namespace,
                routineId: routine.id,
                fireId: fire.id,
                runId: run.id,
                kind: 'skipped',
                data: { reason: 'filter-rejected' }
            })
            return { kind: 'skipped', fire, run: updated ?? run, reason: 'filter-rejected' }
        }

        // Fire-and-forget: kick the workflow. The engine persists
        // payload + resumes on restart if the hub dies here.
        const runtime = await this.runtime
        const program = Effect.gen(function* () {
            const engine = yield* WorkflowEngine
            yield* engine.execute(RoutineRunWorkflow, {
                executionId: fire.id,
                payload: {
                    namespace: req.namespace,
                    routineId: routine.id,
                    fireId: fire.id,
                    triggerKind: req.triggerKind,
                    actor: req.actor,
                    payload: req.payload,
                    textContext: req.textContext
                },
                discard: true
            })
        })
        // Don't await — fire-and-forget so HTTP caller gets a fast ack.
        Runtime.runPromise(runtime)(program).catch((err) => {
            // Engine-level failures are extremely rare (infra issue).
            // Log + mark the run failed so the UI shows something.
            console.error('[routines] workflow engine error', err)
            const failed = this.store.routines.updateRunStatus(run.id, req.namespace, 'failed', {
                outcome: { message: err instanceof Error ? err.message : String(err) }
            })
            if (failed) this.emitRunUpdate(failed.id, failed.routineId, failed.namespace, 'failed')
        })

        return { kind: 'accepted', fire, run }
    }

    /**
     * External terminal signal — called by the run tracker when the
     * underlying session's spawn coordinator phase reaches a terminal
     * state. Resolves the workflow's DurableDeferred, unblocking the
     * await-terminal activity.
     */
    async signalTerminal(params: {
        fireId: string
        status: 'succeeded' | 'failed' | 'timeout' | 'cancelled'
        sessionId?: string
        exitCode?: number
        message?: string
    }): Promise<void> {
        const runtime = await this.runtime
        const program = Effect.gen(function* () {
            const engine = yield* WorkflowEngine
            yield* engine.deferredDone(TerminalDeferred, {
                workflowName: 'RoutineRun',
                executionId: params.fireId,
                deferredName: 'routine-run-terminal',
                exit: Exit.succeed({
                    status: params.status,
                    sessionId: params.sessionId,
                    exitCode: params.exitCode,
                    message: params.message
                })
            })
        })
        await Runtime.runPromise(runtime)(program).catch((err) => {
            console.error('[routines] signalTerminal failed', err)
        })
    }

    // ── internals ─────────────────────────────────────────────────────

    private persistRunStatus(update: {
        runId: string
        namespace: string
        routineId: string
        fireId: string
        status: RoutineRunStatus
        spawnRequestId?: string
        sessionId?: string
    }): void {
        const updated = this.store.routines.updateRunStatus(
            update.runId,
            update.namespace,
            update.status,
            {
                spawnRequestId: update.spawnRequestId,
                sessionId: update.sessionId
            }
        )
        if (updated) {
            this.emitRunUpdate(updated.id, updated.routineId, updated.namespace, update.status)
        }
    }

    private emitRunUpdate(
        runId: string,
        routineId: string,
        namespace: string,
        status: RoutineRunStatus
    ): void {
        this.eventPublisher.emit({
            type: 'routine-run-updated',
            namespace,
            routineId,
            runId,
            status
        })
    }
}
