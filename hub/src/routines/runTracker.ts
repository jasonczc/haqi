/**
 * RunTracker — keeps routine_runs.status aligned with the session
 * spawn lifecycle owned by SpawnCoordinator.
 *
 * Flow:
 *   FirePipeline → enqueue spawn → spawn_request_id written to run row
 *   SpawnCoordinator emits `cloud-spawn-request-updated` as phases flip
 *   RunTracker hears those events → updates routine_runs.status and
 *     session_id when the spawn succeeds → emits routine-run-updated.
 *
 * Sessions themselves may keep running after the spawn phase ends; we
 * bridge final success/failure on the spawn side. For deeper outcomes
 * (session exit code, PR URL, etc.) the runner will eventually write
 * those back through another path; for MVP we treat `spawn succeeded`
 * as "run started running" and a later `session-archived` as terminal.
 *
 * No polling — everything is event-driven via EventPublisher subscribe.
 */

import type { Store } from '../store'
import type { EventPublisher } from '../sync/eventPublisher'
import type { SyncEvent } from '@hapi/protocol/types'
import type { RoutineRunStatus } from '@hapi/protocol/schemas'

export interface RunTrackerHandle {
    stop(): void
}

export function startRunTracker(deps: {
    store: Store
    eventPublisher: EventPublisher
    log?: (msg: string, data?: unknown) => void
}): RunTrackerHandle {
    const { store, eventPublisher } = deps
    const log = deps.log ?? (() => {})

    const unsubscribe = eventPublisher.subscribe((event: SyncEvent) => {
        try {
            handleSyncEvent(store, eventPublisher, event, log)
        } catch (err) {
            log('[runTracker] handler error', err)
        }
    })

    return { stop: unsubscribe }
}

function handleSyncEvent(
    store: Store,
    eventPublisher: EventPublisher,
    event: SyncEvent,
    log: (msg: string, data?: unknown) => void
): void {
    switch (event.type) {
        case 'cloud-spawn-request-updated':
            handleSpawnUpdate(store, eventPublisher, event, log)
            return
        case 'session-updated':
            // Flip run→succeeded/failed when the underlying session hits
            // a terminal archiveReason. Session termination is the only
            // signal we have today that the agent actually finished work
            // (vs. just successfully spawning).
            handleSessionUpdate(store, eventPublisher, event, log)
            return
        default:
            return
    }
}

function handleSpawnUpdate(
    store: Store,
    eventPublisher: EventPublisher,
    event: Extract<SyncEvent, { type: 'cloud-spawn-request-updated' }>,
    log: (msg: string, data?: unknown) => void
): void {
    const data = (event as unknown as { data?: { id?: string; phase?: string; sessionId?: string; error?: { code?: string; message?: string } } }).data
    const spawnRequestId = data?.id
    if (!spawnRequestId) return
    const run = store.routines.findRunBySpawnRequestId(spawnRequestId)
    if (!run) return

    const phase = data?.phase
    const nextStatus = spawnPhaseToRunStatus(phase)
    if (!nextStatus) return

    const updated = store.routines.updateRunStatus(run.id, run.namespace, nextStatus, {
        sessionId: data?.sessionId,
        outcome: nextStatus === 'failed' ? { message: data?.error?.message ?? data?.error?.code ?? phase } : undefined
    })
    if (!updated) return

    store.routines.appendEvent({
        namespace: run.namespace,
        routineId: run.routineId,
        fireId: run.fireId,
        runId: run.id,
        kind: nextStatus === 'failed' ? 'error' : (nextStatus === 'running' ? 'run-started' : (nextStatus === 'succeeded' ? 'run-ended' : 'run-started')),
        data: { spawnPhase: phase, sessionId: data?.sessionId }
    })
    log('[runTracker] spawn phase → run status', { runId: run.id, phase, nextStatus })

    eventPublisher.emit({
        type: 'routine-run-updated',
        namespace: run.namespace,
        routineId: run.routineId,
        runId: run.id,
        status: updated.status
    })
}


function handleSessionUpdate(
    store: Store,
    eventPublisher: EventPublisher,
    event: Extract<SyncEvent, { type: 'session-updated' }>,
    log: (msg: string, data?: unknown) => void
): void {
    const sessionId = (event as unknown as { sessionId?: string }).sessionId
    if (!sessionId) return
    const run = store.routines.findRunBySessionId(sessionId)
    if (!run) return
    if (isTerminal(run.status)) return

    // SessionMetadata.archiveReason is set by the runner when a session
    // terminates. Until that lands we just watch for any session-updated
    // whose metadata has archivedBy/archiveReason set.
    const data = (event as unknown as { data?: { metadata?: Record<string, unknown> } }).data
    const metadata = data?.metadata
    if (!metadata) return
    const archiveReason = typeof metadata.archiveReason === 'string' ? metadata.archiveReason : undefined
    const archivedBy = typeof metadata.archivedBy === 'string' ? metadata.archivedBy : undefined
    if (!archiveReason && !archivedBy) return

    const exitCode = typeof (metadata.archiveDetail as Record<string, unknown> | undefined)?.exitCode === 'number'
        ? ((metadata.archiveDetail as Record<string, unknown>).exitCode as number)
        : undefined
    const finalStatus: RoutineRunStatus = archiveReason === 'crash' || (typeof exitCode === 'number' && exitCode !== 0)
        ? 'failed'
        : 'succeeded'
    const updated = store.routines.updateRunStatus(run.id, run.namespace, finalStatus, {
        outcome: { exitCode, message: archiveReason ?? archivedBy }
    })
    if (!updated) return
    store.routines.appendEvent({
        namespace: run.namespace,
        routineId: run.routineId,
        fireId: run.fireId,
        runId: run.id,
        kind: 'run-ended',
        data: { sessionId, finalStatus, archiveReason, archivedBy, exitCode }
    })
    log('[runTracker] session terminal → run terminal', { runId: run.id, finalStatus })
    eventPublisher.emit({
        type: 'routine-run-updated',
        namespace: run.namespace,
        routineId: run.routineId,
        runId: run.id,
        status: finalStatus
    })
}

function spawnPhaseToRunStatus(phase: string | undefined): RoutineRunStatus | null {
    if (!phase) return null
    switch (phase) {
        case 'queued':
            return null // already in queued; don't bounce
        case 'selecting-worker':
        case 'acquiring-workspace':
        case 'creating-container':
        case 'preparing-workspace':
        case 'starting-session':
            return 'spawning'
        case 'succeeded':
            return 'running'
        case 'failed':
            return 'failed'
        case 'canceled':
            return 'cancelled'
        default:
            return null
    }
}

function isTerminal(status: RoutineRunStatus): boolean {
    return status === 'succeeded' || status === 'failed' || status === 'timeout' || status === 'skipped' || status === 'cancelled'
}
