/**
 * Fire pipeline: fire event → filter → concurrency → materialize → run.
 *
 * This is the single code path every trigger driver funnels into. Given
 * a FireRequest (already authenticated by the driver), the pipeline:
 *
 *   1. Loads the routine (snapshot its version for the fire record).
 *   2. Records the fire row (with dedupKey uniqueness for webhooks).
 *   3. Evaluates the routine's filter against the payload.
 *   4. Checks the concurrency policy against active runs.
 *   5. Either:
 *      - emits a run (queued / skipped), or
 *      - hands materialized SpawnRequest to SpawnCoordinator and
 *        correlates spawn_request_id → routine_run.
 *
 * Every outcome writes at least one routine_event row so the timeline
 * is complete even when the path ends in "skipped" or "error".
 *
 * The pipeline is deliberately synchronous through step 4. Spawning is
 * asynchronous (SpawnCoordinator queues its own work) and the run row
 * is updated later by RunTracker watching spawn events.
 */

import { randomUUID } from 'node:crypto'
import type {
    FireActor,
    MachineSpawnRequest,
    Routine,
    RoutineFire,
    RoutineRun,
    TriggerKind
} from '@hapi/protocol/schemas'
import type { Store } from '../store'
import type { EventPublisher } from '../sync/eventPublisher'
import { FireDuplicateError } from '../store/routines'
import { evaluateFilter } from './filterEvaluator'

export type FireSubmitRequest = {
    namespace: string
    routineId: string
    triggerKind: TriggerKind
    actor: FireActor
    /** Trigger-specific data — stored verbatim on the fire row + fed to the filter + used for prompt template substitution. */
    payload?: unknown
    /** Webhook redelivery dedup. Unique per (routine, dedupKey). */
    dedupKey?: string
    /** Caller-provided additional prompt text appended to spawn. API trigger uses this. */
    textContext?: string
}

export type FireSubmitResult =
    | { kind: 'accepted'; fire: RoutineFire; run: RoutineRun }
    | { kind: 'skipped'; fire: RoutineFire; run: RoutineRun; reason: SkipReason }
    | { kind: 'duplicate'; dedupKey: string; routineId: string }
    | { kind: 'routine-not-found' }
    | { kind: 'routine-inactive'; status: Routine['status'] }

export type SkipReason = 'filter-rejected' | 'concurrency-skip' | 'cancel-previous-failed'

export interface SpawnCoordinatorLike {
    enqueue(
        namespace: string,
        machineId: string,
        request: MachineSpawnRequest
    ): { id: string }
}

export class FirePipeline {
    constructor(
        private readonly store: Store,
        private readonly spawnCoordinator: SpawnCoordinatorLike,
        private readonly eventPublisher: EventPublisher,
        private readonly now: () => number = () => Date.now()
    ) {}

    async submit(req: FireSubmitRequest): Promise<FireSubmitResult> {
        const routine = this.store.routines.getRoutine(req.routineId, req.namespace)
        if (!routine) return { kind: 'routine-not-found' }
        if (routine.status !== 'active') return { kind: 'routine-inactive', status: routine.status }

        // 1. Evaluate filter *first* — the result belongs on the fire row
        // so "why did this fire?" reads don't need to reconstruct from
        // the event log.
        const filter = evaluateFilter(routine.filter, req.payload)

        // 2. Record fire (deduped on routineId + dedupKey). The filter
        // result is persisted here so it survives an event-log rotation.
        const fireId = randomUUID()
        let fire: RoutineFire
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

        this.logEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            kind: 'fire-received',
            data: { triggerKind: req.triggerKind, actor: req.actor }
        })
        this.logEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            kind: 'filter-evaluated',
            data: filter
        })
        if (!filter.matched) {
            const run = this.store.routines.createRun({
                id: randomUUID(),
                namespace: req.namespace,
                routineId: routine.id,
                routineVersion: routine.version,
                fireId: fire.id,
                status: 'skipped',
                skippedReason: 'filter-rejected'
            })
            this.emitRunUpdate(run)
            this.logEvent({
                namespace: req.namespace,
                routineId: routine.id,
                fireId: fire.id,
                runId: run.id,
                kind: 'skipped',
                data: { reason: 'filter-rejected', filter }
            })
            return { kind: 'skipped', fire, run, reason: 'filter-rejected' }
        }

        // 3. Concurrency check.
        const active = this.store.routines.findActiveRunsForRoutine(routine.id, req.namespace)
        if (active.length > 0) {
            const verdict = this.applyConcurrencyPolicy(routine, active)
            if (verdict.kind === 'skip') {
                const run = this.store.routines.createRun({
                    id: randomUUID(),
                    namespace: req.namespace,
                    routineId: routine.id,
                    routineVersion: routine.version,
                    fireId: fire.id,
                    status: 'skipped',
                    skippedReason: 'concurrency-skip'
                })
                this.emitRunUpdate(run)
                this.logEvent({
                    namespace: req.namespace,
                    routineId: routine.id,
                    fireId: fire.id,
                    runId: run.id,
                    kind: 'skipped',
                    data: { reason: 'concurrency-skip', activeRunIds: active.map((r) => r.id) }
                })
                return { kind: 'skipped', fire, run, reason: 'concurrency-skip' }
            }
            if (verdict.kind === 'cancel-previous') {
                for (const prev of active) {
                    this.store.routines.updateRunStatus(prev.id, req.namespace, 'cancelled')
                    this.logEvent({
                        namespace: req.namespace,
                        routineId: routine.id,
                        runId: prev.id,
                        kind: 'error',
                        data: { reason: 'superseded-by', fireId: fire.id }
                    })
                    this.emitRunUpdate({ ...prev, status: 'cancelled' })
                }
            }
            // kind='allow' or cancel-previous → fall through and create new run.
        }

        // 4. Materialize SpawnRequest and enqueue.
        const spawnRequest = this.materializeSpawnRequest(routine, fire, req.textContext)
        const runId = randomUUID()
        const run = this.store.routines.createRun({
            id: runId,
            namespace: req.namespace,
            routineId: routine.id,
            routineVersion: routine.version,
            fireId: fire.id,
            status: 'queued'
        })
        this.emitRunUpdate(run)
        this.logEvent({
            namespace: req.namespace,
            routineId: routine.id,
            fireId: fire.id,
            runId: run.id,
            kind: 'run-queued',
            data: {}
        })

        try {
            const enqueued = this.spawnCoordinator.enqueue(req.namespace, 'auto', spawnRequest)
            const updated = this.store.routines.updateRunStatus(runId, req.namespace, 'spawning', {
                spawnRequestId: enqueued.id
            })
            if (updated) {
                this.emitRunUpdate(updated)
                this.logEvent({
                    namespace: req.namespace,
                    routineId: routine.id,
                    fireId: fire.id,
                    runId: updated.id,
                    kind: 'run-spawning',
                    data: { spawnRequestId: enqueued.id }
                })
                return { kind: 'accepted', fire, run: updated }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            const failed = this.store.routines.updateRunStatus(runId, req.namespace, 'failed', {
                outcome: { message }
            })
            this.logEvent({
                namespace: req.namespace,
                routineId: routine.id,
                fireId: fire.id,
                runId,
                kind: 'error',
                data: { message }
            })
            if (failed) this.emitRunUpdate(failed)
            throw err
        }

        return { kind: 'accepted', fire, run }
    }

    private applyConcurrencyPolicy(
        routine: Routine,
        active: RoutineRun[]
    ): { kind: 'skip' } | { kind: 'allow' } | { kind: 'cancel-previous' } {
        switch (routine.concurrency) {
            case 'skip':
                return { kind: 'skip' }
            case 'cancel-previous':
                return { kind: 'cancel-previous' }
            case 'allow':
                return { kind: 'allow' }
            case 'queue':
                // MVP: queue == skip; real queueing requires a run-ready
                // queue + dispatcher. Noted and intentionally simple.
                return { kind: 'skip' }
            default:
                return { kind: 'skip' }
        }
    }

    private materializeSpawnRequest(
        routine: Routine,
        fire: RoutineFire,
        textContext: string | undefined
    ): MachineSpawnRequest {
        const overrides = routine.spawn
        const prompt = renderPrompt(overrides.promptTemplate, {
            routine,
            fire,
            payload: fire.payload,
            textContext
        })
        // `spawnRequestId` is deliberately NOT set here: the spawn
        // coordinator assigns its own id when it persists the row (see
        // spawnCoordinator.ts where it overwrites request.spawnRequestId
        // on the payload), and we correlate by the returned id in
        // FirePipeline.submit. UI linkage is carried by the labels
        // below.
        const request: MachineSpawnRequest = {
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
            labels: [`routine:${routine.id}`, `fire:${fire.id}`]
        }
        return request
    }

    private logEvent(event: {
        namespace: string
        routineId: string
        fireId?: string
        runId?: string
        kind: Parameters<Store['routines']['appendEvent']>[0]['kind']
        data?: unknown
    }): void {
        this.store.routines.appendEvent(event)
    }

    private emitRunUpdate(run: RoutineRun): void {
        this.eventPublisher.emit({
            type: 'routine-run-updated',
            namespace: run.namespace,
            routineId: run.routineId,
            runId: run.id,
            status: run.status
        })
    }
}

/**
 * Minimal mustache-style substitution over the trigger payload. Not a
 * full template language on purpose — we just substitute `{{path.to.key}}`
 * lookups against the same dotted-path reader the filter uses.
 *
 * Available roots:
 *   {{payload.xxx}}    — raw trigger payload
 *   {{text}}           — API trigger's text context (if any)
 *   {{routine.name}}   — routine identifier fields
 *   {{fire.id}}        — fire id
 */
export function renderPrompt(
    template: string | undefined,
    ctx: { routine: Routine; fire: RoutineFire; payload: unknown; textContext?: string }
): string | undefined {
    if (!template) return ctx.textContext
    return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path) => {
        const [head, ...rest] = String(path).split('.')
        let root: unknown
        switch (head) {
            case 'payload': root = ctx.payload; break
            case 'text': return ctx.textContext ?? ''
            case 'routine': root = ctx.routine; break
            case 'fire': root = ctx.fire; break
            default: return ''
        }
        if (rest.length === 0) return toStringish(root)
        let cur: unknown = root
        for (const seg of rest) {
            if (cur === null || cur === undefined) return ''
            if (Array.isArray(cur)) {
                const idx = Number(seg)
                if (!Number.isInteger(idx)) return ''
                cur = cur[idx]
                continue
            }
            if (typeof cur === 'object') {
                cur = (cur as Record<string, unknown>)[seg]
                continue
            }
            return ''
        }
        return toStringish(cur)
    })
}

function toStringish(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try { return JSON.stringify(value) } catch { return '' }
}
