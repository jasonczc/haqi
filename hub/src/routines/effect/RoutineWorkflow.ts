/**
 * RoutineRun workflow — the durable-execution shape of a single routine run.
 *
 * Lifecycle (activities in order):
 *
 *   evaluate-filter   → decides match/skip based on payload
 *                       (pure, in-memory, cached by the engine so reruns
 *                       of the same fireId produce the same decision)
 *
 *   check-concurrency → inspects active runs for this routine,
 *                       applies the concurrency policy, and either
 *                       returns "proceed" or short-circuits with "skip".
 *
 *   spawn-session     → calls the hub's SpawnCoordinator and returns
 *                       the spawn_request_id. Persisted — if the hub
 *                       crashes after spawn is enqueued but before we
 *                       record the id, replay is idempotent on the
 *                       coordinator side (we pass a deterministic
 *                       request idempotency key).
 *
 *   await-terminal    → suspends the workflow until the hub's run
 *                       tracker writes a DurableDeferred completion
 *                       via signalRunTerminal(). Survives restarts.
 *
 * The workflow's `idempotencyKey` is the fireId: the FirePipeline
 * constructs a fire row (deduped on routineId+dedupKey) and uses its
 * id as the workflow executionId. Re-submitting the same fire is a
 * no-op because the engine will find the cached execution.
 */

import { Effect, Schema } from 'effect'
import { Activity, DurableDeferred, Workflow } from '@effect/workflow'
import type { Store } from '../../store'
import type { SpawnCoordinatorLike, FireSubmitRequest } from '../firePipeline'
import { evaluateFilter } from '../filterEvaluator'
import type { RoutineRunStatus } from '@hapi/protocol/schemas'

// ── Schemas ─────────────────────────────────────────────────────────────

const FireActorSchema = Schema.Union(
    Schema.Struct({ type: Schema.Literal('api'), tokenId: Schema.String }),
    Schema.Struct({ type: Schema.Literal('schedule') }),
    Schema.Struct({
        type: Schema.Literal('github'),
        deliveryId: Schema.optional(Schema.String),
        sender: Schema.optional(Schema.String)
    }),
    Schema.Struct({ type: Schema.Literal('user'), userId: Schema.String })
)

const RoutineRunPayloadSchema = Schema.Struct({
    namespace: Schema.String,
    routineId: Schema.String,
    fireId: Schema.String,
    triggerKind: Schema.Literal('api', 'schedule', 'github'),
    actor: FireActorSchema,
    payload: Schema.optional(Schema.Unknown),
    textContext: Schema.optional(Schema.String)
})

const RunOutcomeSchema = Schema.Struct({
    runId: Schema.String,
    status: Schema.Literal('succeeded', 'failed', 'timeout', 'skipped', 'cancelled'),
    sessionId: Schema.optional(Schema.String),
    spawnRequestId: Schema.optional(Schema.String),
    exitCode: Schema.optional(Schema.Number),
    message: Schema.optional(Schema.String),
    skippedReason: Schema.optional(Schema.String)
})

const RunErrorSchema = Schema.Struct({
    code: Schema.Literal('routine_not_found', 'routine_inactive', 'pipeline_error'),
    message: Schema.String
})

// ── Workflow definition ─────────────────────────────────────────────────

export const RoutineRunWorkflow = Workflow.make({
    name: 'RoutineRun',
    success: RunOutcomeSchema,
    error: RunErrorSchema,
    payload: RoutineRunPayloadSchema,
    idempotencyKey: (p) => p.fireId
})

// DurableDeferred: the run-tracker hooks into this to resolve the
// workflow when the underlying session terminates.
export const TerminalDeferred = DurableDeferred.make('routine-run-terminal', {
    success: Schema.Struct({
        status: Schema.Literal('succeeded', 'failed', 'timeout', 'cancelled'),
        sessionId: Schema.optional(Schema.String),
        exitCode: Schema.optional(Schema.Number),
        message: Schema.optional(Schema.String)
    }),
    error: Schema.Never
})

// ── Runtime dependencies passed in at layer construction ────────────────

export type RoutineRunDeps = {
    store: Store
    spawnCoordinator: SpawnCoordinatorLike
    onRunStatus: (update: {
        runId: string
        namespace: string
        routineId: string
        fireId: string
        status: RoutineRunStatus
        spawnRequestId?: string
        sessionId?: string
    }) => void
}

// ── Build the workflow handler layer ────────────────────────────────────
//
// `Workflow.toLayer` produces a Layer<never, never, WorkflowEngine | ...>
// — consuming WorkflowEngine to register the handler. We provide the
// hub-side dependencies through a closure rather than an Effect Layer
// so the workflow stays callable from our existing non-Effect code
// without a paradigm shift at every boundary.

export function buildRoutineWorkflowLayer(deps: RoutineRunDeps) {
    const { store, spawnCoordinator, onRunStatus } = deps

    return RoutineRunWorkflow.toLayer(
        Effect.fn(function* (payload, executionId) {
            // One run row per workflow execution. The executionId IS the
            // run id — one-to-one mapping with the fire.
            const runId = executionId

            // ── Activity 1: evaluate filter ─────────────────────────
            const filter = yield* Activity.make({
                name: 'evaluate-filter',
                success: Schema.Struct({ matched: Schema.Boolean, reason: Schema.String }),
                error: Schema.Never,
                execute: Effect.sync(() => {
                    const routine = store.routines.getRoutine(payload.routineId, payload.namespace)
                    if (!routine) {
                        // Caller should never reach here — the fire pipeline
                        // already rejected this before submit. But if the
                        // routine got deleted between fire and workflow
                        // start, degrade to "not matched" so the run can
                        // terminate cleanly.
                        return { matched: false, reason: 'routine_disappeared' }
                    }
                    const result = evaluateFilter(routine.filter, payload.payload)
                    return { matched: result.matched, reason: result.reason }
                })
            })

            if (!filter.matched) {
                // Create the run row (if not already from FirePipeline pre-check)
                // and short-circuit.
                store.routines.appendEvent({
                    namespace: payload.namespace,
                    routineId: payload.routineId,
                    fireId: payload.fireId,
                    runId,
                    kind: 'skipped',
                    data: { reason: 'filter-rejected', filter }
                })
                onRunStatus({
                    runId,
                    namespace: payload.namespace,
                    routineId: payload.routineId,
                    fireId: payload.fireId,
                    status: 'skipped'
                })
                return {
                    runId,
                    status: 'skipped' as const,
                    skippedReason: 'filter-rejected'
                }
            }

            // ── Activity 2: concurrency check ───────────────────────
            const concurrencyDecision = yield* Activity.make({
                name: 'check-concurrency',
                success: Schema.Literal('proceed', 'skip'),
                error: Schema.Never,
                execute: Effect.sync(() => {
                    const routine = store.routines.getRoutine(payload.routineId, payload.namespace)
                    if (!routine) return 'skip' as const
                    const active = store.routines.findActiveRunsForRoutine(
                        payload.routineId,
                        payload.namespace
                    ).filter((r) => r.id !== runId)
                    if (active.length === 0) return 'proceed' as const
                    if (routine.concurrency === 'allow') return 'proceed' as const
                    if (routine.concurrency === 'cancel-previous') {
                        for (const prev of active) {
                            store.routines.updateRunStatus(prev.id, prev.namespace, 'cancelled')
                        }
                        return 'proceed' as const
                    }
                    return 'skip' as const
                })
            })

            if (concurrencyDecision === 'skip') {
                store.routines.appendEvent({
                    namespace: payload.namespace,
                    routineId: payload.routineId,
                    fireId: payload.fireId,
                    runId,
                    kind: 'skipped',
                    data: { reason: 'concurrency-skip' }
                })
                onRunStatus({
                    runId,
                    namespace: payload.namespace,
                    routineId: payload.routineId,
                    fireId: payload.fireId,
                    status: 'skipped'
                })
                return {
                    runId,
                    status: 'skipped' as const,
                    skippedReason: 'concurrency-skip'
                }
            }

            // ── Activity 3: spawn session ───────────────────────────
            const spawnRequestId = yield* Activity.make({
                name: 'spawn-session',
                success: Schema.String,
                error: Schema.Struct({
                    code: Schema.Literal('pipeline_error'),
                    message: Schema.String
                }),
                execute: Effect.try({
                    try: () => {
                        const routine = store.routines.getRoutine(payload.routineId, payload.namespace)
                        if (!routine) throw new Error('routine_disappeared')
                        const spawnRequest = materializeSpawnRequest({
                            routine,
                            payload,
                            runId
                        })
                        const enqueued = spawnCoordinator.enqueue(
                            payload.namespace,
                            'auto',
                            spawnRequest
                        )
                        return enqueued.id
                    },
                    catch: (err) => ({
                        code: 'pipeline_error' as const,
                        message: err instanceof Error ? err.message : String(err)
                    })
                })
            })

            onRunStatus({
                runId,
                namespace: payload.namespace,
                routineId: payload.routineId,
                fireId: payload.fireId,
                status: 'spawning',
                spawnRequestId
            })
            store.routines.appendEvent({
                namespace: payload.namespace,
                routineId: payload.routineId,
                fireId: payload.fireId,
                runId,
                kind: 'run-spawning',
                data: { spawnRequestId }
            })

            // ── Activity 4: await terminal signal ───────────────────
            //
            // Uses DurableDeferred so the wait is crash-safe: if the hub
            // restarts between spawn and terminal, the workflow suspends
            // and resumes when the deferred is resolved elsewhere.

            const terminal = yield* DurableDeferred.await(TerminalDeferred)

            onRunStatus({
                runId,
                namespace: payload.namespace,
                routineId: payload.routineId,
                fireId: payload.fireId,
                status: terminal.status,
                sessionId: terminal.sessionId
            })
            store.routines.appendEvent({
                namespace: payload.namespace,
                routineId: payload.routineId,
                fireId: payload.fireId,
                runId,
                kind: 'run-ended',
                data: {
                    status: terminal.status,
                    sessionId: terminal.sessionId,
                    exitCode: terminal.exitCode
                }
            })

            return {
                runId,
                status: terminal.status,
                sessionId: terminal.sessionId,
                spawnRequestId,
                exitCode: terminal.exitCode,
                message: terminal.message
            }
        })
    )
}

// ── Spawn request materialization (shared with old pipeline) ────────────

import type { MachineSpawnRequest, Routine } from '@hapi/protocol/schemas'

function materializeSpawnRequest(params: {
    routine: Routine
    payload: typeof RoutineRunPayloadSchema.Type
    runId: string
}): MachineSpawnRequest {
    const { routine, payload, runId } = params
    const overrides = routine.spawn
    const prompt = renderPrompt(overrides.promptTemplate, {
        routineName: routine.name,
        fireId: payload.fireId,
        payload: payload.payload,
        textContext: payload.textContext
    })
    return {
        agent: overrides.agent,
        model: overrides.model,
        thinkEffort: overrides.thinkEffort,
        runtimeKind: overrides.runtimeKind,
        environmentId: overrides.environmentId,
        workspaceSource: overrides.workspaceSource,
        networkPolicy: overrides.networkPolicy,
        computerUse: overrides.computerUse,
        secrets: overrides.secrets,
        initialPrompt: prompt,
        labels: [`routine:${routine.id}`, `fire:${payload.fireId}`, `run:${runId}`]
    }
}

function renderPrompt(
    template: string | undefined,
    ctx: { routineName: string; fireId: string; payload: unknown; textContext?: string }
): string | undefined {
    if (!template) return ctx.textContext
    return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path) => {
        const [head, ...rest] = String(path).split('.')
        switch (head) {
            case 'text': return ctx.textContext ?? ''
            case 'routine': return rest[0] === 'name' ? ctx.routineName : ''
            case 'fire': return rest[0] === 'id' ? ctx.fireId : ''
            case 'payload': {
                let cur: unknown = ctx.payload
                for (const seg of rest) {
                    if (cur === null || cur === undefined) return ''
                    if (Array.isArray(cur)) {
                        const idx = Number(seg)
                        cur = Number.isInteger(idx) ? cur[idx] : undefined
                    } else if (typeof cur === 'object') {
                        cur = (cur as Record<string, unknown>)[seg]
                    } else {
                        return ''
                    }
                }
                if (cur === null || cur === undefined) return ''
                if (typeof cur === 'string') return cur
                if (typeof cur === 'number' || typeof cur === 'boolean') return String(cur)
                try { return JSON.stringify(cur) } catch { return '' }
            }
            default: return ''
        }
    })
}

export type FireSubmitRequestCompat = FireSubmitRequest
