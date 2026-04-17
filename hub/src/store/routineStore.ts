/**
 * Surface for the Routines subsystem to consume.
 *
 * Thin wrapper around routines.ts query functions, matching the shape
 * of MachineStore / CloudStore / CloudAgentPreferenceStore. All methods
 * are namespace-scoped (callers must pass namespace through).
 *
 * Intentionally does NOT encapsulate transactions — tests that need
 * determinism can open an in-memory Database and call functions
 * directly. The store just routes to the module-level functions.
 */

import type { Database } from 'bun:sqlite'
import type {
    FilterExpression,
    FireActor,
    FilterResult,
    Routine,
    RoutineEvent,
    RoutineEventKind,
    RoutineFire,
    RoutineFireToken,
    RoutineRun,
    RoutineRunOutcome,
    RoutineRunStatus,
    RoutineSpawnOverrides,
    RoutineStatus,
    TriggerConfig,
    TriggerKind
} from '@hapi/protocol/schemas'
import * as routinesDb from './routines'

export class RoutineStore {
    private readonly db: Database
    constructor(db: Database) { this.db = db }

    // ── Routines ─────────────────────────────────────────────────

    createRoutine(params: {
        id: string
        namespace: string
        name: string
        description?: string
        trigger: TriggerConfig
        filter?: FilterExpression
        spawn: RoutineSpawnOverrides
        concurrency: Routine['concurrency']
        createdBy?: string
    }): Routine { return routinesDb.createRoutine(this.db, params) }

    getRoutine(id: string, namespace: string): Routine | null {
        return routinesDb.getRoutine(this.db, id, namespace)
    }

    listRoutines(namespace: string): Routine[] {
        return routinesDb.listRoutines(this.db, namespace)
    }

    listActiveRoutinesByTrigger(kind: TriggerKind): Routine[] {
        return routinesDb.listActiveRoutinesByTrigger(this.db, kind)
    }

    updateRoutine(id: string, namespace: string, updates: Parameters<typeof routinesDb.updateRoutine>[3]): Routine | null {
        return routinesDb.updateRoutine(this.db, id, namespace, updates)
    }

    deleteRoutine(id: string, namespace: string): boolean {
        return routinesDb.deleteRoutine(this.db, id, namespace)
    }

    // ── Fire tokens ──────────────────────────────────────────────

    createFireToken(params: Parameters<typeof routinesDb.createFireToken>[1]): RoutineFireToken {
        return routinesDb.createFireToken(this.db, params)
    }

    getFireTokenByHash(tokenHash: string): RoutineFireToken | null {
        return routinesDb.getFireTokenByHash(this.db, tokenHash)
    }

    listFireTokens(routineId: string, namespace: string): RoutineFireToken[] {
        return routinesDb.listFireTokens(this.db, routineId, namespace)
    }

    revokeFireToken(id: string, namespace: string): boolean {
        return routinesDb.revokeFireToken(this.db, id, namespace)
    }

    touchFireTokenLastUsed(id: string): void {
        routinesDb.touchFireTokenLastUsed(this.db, id)
    }

    // ── Fires ────────────────────────────────────────────────────

    recordFire(params: Parameters<typeof routinesDb.recordFire>[1]): RoutineFire {
        return routinesDb.recordFire(this.db, params)
    }

    listFires(routineId: string, namespace: string, limit?: number): RoutineFire[] {
        return routinesDb.listFires(this.db, routineId, namespace, limit)
    }

    // ── Runs ─────────────────────────────────────────────────────

    createRun(params: Parameters<typeof routinesDb.createRun>[1]): RoutineRun {
        return routinesDb.createRun(this.db, params)
    }

    updateRunStatus(
        id: string,
        namespace: string,
        status: RoutineRunStatus,
        extra?: { spawnRequestId?: string; sessionId?: string; outcome?: RoutineRunOutcome }
    ): RoutineRun | null {
        return routinesDb.updateRunStatus(this.db, id, namespace, status, extra)
    }

    getRun(id: string, namespace: string): RoutineRun | null {
        return routinesDb.getRun(this.db, id, namespace)
    }

    listRuns(routineId: string, namespace: string, limit?: number): RoutineRun[] {
        return routinesDb.listRuns(this.db, routineId, namespace, limit)
    }

    findActiveRunsForRoutine(routineId: string, namespace: string): RoutineRun[] {
        return routinesDb.findActiveRunsForRoutine(this.db, routineId, namespace)
    }

    findRunBySessionId(sessionId: string): RoutineRun | null {
        return routinesDb.findRunBySessionId(this.db, sessionId)
    }

    findRunBySpawnRequestId(spawnRequestId: string): RoutineRun | null {
        return routinesDb.findRunBySpawnRequestId(this.db, spawnRequestId)
    }

    // ── Events ───────────────────────────────────────────────────

    appendEvent(params: {
        namespace: string
        routineId: string
        fireId?: string
        runId?: string
        kind: RoutineEventKind
        data?: unknown
    }): RoutineEvent { return routinesDb.appendEvent(this.db, params) }

    listEvents(routineId: string, namespace: string, limit?: number): RoutineEvent[] {
        return routinesDb.listEvents(this.db, routineId, namespace, limit)
    }

    listEventsForRun(runId: string, namespace: string): RoutineEvent[] {
        return routinesDb.listEventsForRun(this.db, runId, namespace)
    }
}

// Re-export the module error so callers can catch without importing
// routines.ts directly.
export { FireDuplicateError } from './routines'
export type {
    FireActor,
    FilterExpression,
    FilterResult,
    Routine,
    RoutineEvent,
    RoutineFire,
    RoutineFireToken,
    RoutineRun,
    RoutineRunOutcome,
    RoutineRunStatus,
    RoutineSpawnOverrides,
    RoutineStatus,
    TriggerConfig,
    TriggerKind
}
