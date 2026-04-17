/**
 * Routine persistence.
 *
 * Layout mirrors machines.ts / cloudStore.ts — pure functions that take
 * a Database handle, with a thin RoutineStore class (routineStore.ts)
 * as the surface other hub modules consume.
 *
 * Five tables:
 *   - routines              (config + version counter)
 *   - routine_fire_tokens   (hashed bearer tokens for api trigger)
 *   - routine_fires         (one row per fire event; source of truth for run history)
 *   - routine_runs          (execution rows; fire → (possibly many) runs)
 *   - routine_events        (observability stream; every layer appends here)
 *
 * All rows are namespace-scoped. JSON columns are always round-tripped
 * through safeJsonParse so a malformed row can never crash a read path.
 */

import type { Database } from 'bun:sqlite'
import { safeJsonParse } from './json'
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

// ── Row shapes ───────────────────────────────────────────────────────

type DbRoutineRow = {
    id: string
    namespace: string
    name: string
    description: string | null
    version: number
    status: string
    trigger_kind: string
    config: string
    created_by: string | null
    created_at: number
    updated_at: number
}

type DbRoutineTokenRow = {
    id: string
    namespace: string
    routine_id: string
    name: string | null
    token_hash: string
    token_preview: string
    created_by: string | null
    created_at: number
    expires_at: number | null
    revoked_at: number | null
    last_used_at: number | null
}

type DbRoutineFireRow = {
    id: string
    namespace: string
    routine_id: string
    routine_version: number
    trigger_kind: string
    payload: string | null
    actor: string
    dedup_key: string | null
    filter_result: string | null
    fired_at: number
}

type DbRoutineRunRow = {
    id: string
    namespace: string
    routine_id: string
    routine_version: number
    fire_id: string
    spawn_request_id: string | null
    session_id: string | null
    status: string
    skipped_reason: string | null
    started_at: number | null
    ended_at: number | null
    outcome: string | null
}

type DbRoutineEventRow = {
    id: number
    namespace: string
    routine_id: string
    fire_id: string | null
    run_id: string | null
    kind: string
    data: string | null
    at: number
}

// ── config JSON is the "rest" of the routine on top of the columns. ──
// We keep name/description/status/trigger_kind/version as columns for
// indexing and cheap listing; everything else (filter, spawn overrides,
// concurrency, trigger config body) lives inside this JSON blob.
type RoutineConfigBlob = {
    trigger: TriggerConfig
    filter?: FilterExpression
    spawn: RoutineSpawnOverrides
    concurrency: Routine['concurrency']
}

// ── Mappers ──────────────────────────────────────────────────────────

function toRoutine(row: DbRoutineRow): Routine {
    const config = (safeJsonParse(row.config) ?? {}) as RoutineConfigBlob
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        description: row.description ?? undefined,
        version: row.version,
        status: row.status as RoutineStatus,
        trigger: config.trigger,
        filter: config.filter,
        spawn: config.spawn,
        concurrency: config.concurrency,
        createdBy: row.created_by ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toRoutineToken(row: DbRoutineTokenRow): RoutineFireToken {
    return {
        id: row.id,
        namespace: row.namespace,
        routineId: row.routine_id,
        name: row.name ?? undefined,
        tokenPreview: row.token_preview,
        createdBy: row.created_by ?? undefined,
        createdAt: row.created_at,
        expiresAt: row.expires_at ?? undefined,
        revokedAt: row.revoked_at ?? undefined,
        lastUsedAt: row.last_used_at ?? undefined
    }
}

function toRoutineFire(row: DbRoutineFireRow): RoutineFire {
    return {
        id: row.id,
        namespace: row.namespace,
        routineId: row.routine_id,
        routineVersion: row.routine_version,
        triggerKind: row.trigger_kind as TriggerKind,
        payload: row.payload === null ? undefined : safeJsonParse(row.payload),
        actor: (safeJsonParse(row.actor) ?? { type: 'api', tokenId: 'unknown' }) as FireActor,
        dedupKey: row.dedup_key ?? undefined,
        filterResult: row.filter_result === null ? undefined : (safeJsonParse(row.filter_result) as FilterResult | undefined) ?? undefined,
        firedAt: row.fired_at
    }
}

function toRoutineRun(row: DbRoutineRunRow): RoutineRun {
    return {
        id: row.id,
        namespace: row.namespace,
        routineId: row.routine_id,
        routineVersion: row.routine_version,
        fireId: row.fire_id,
        spawnRequestId: row.spawn_request_id ?? undefined,
        sessionId: row.session_id ?? undefined,
        status: row.status as RoutineRunStatus,
        skippedReason: row.skipped_reason ?? undefined,
        startedAt: row.started_at ?? undefined,
        endedAt: row.ended_at ?? undefined,
        outcome: row.outcome === null ? undefined : (safeJsonParse(row.outcome) as RoutineRunOutcome | undefined) ?? undefined
    }
}

function toRoutineEvent(row: DbRoutineEventRow): RoutineEvent {
    return {
        id: row.id,
        namespace: row.namespace,
        routineId: row.routine_id,
        fireId: row.fire_id ?? undefined,
        runId: row.run_id ?? undefined,
        kind: row.kind as RoutineEventKind,
        data: row.data === null ? undefined : safeJsonParse(row.data),
        at: row.at
    }
}

// ── Routines ─────────────────────────────────────────────────────────

export function createRoutine(
    db: Database,
    params: {
        id: string
        namespace: string
        name: string
        description?: string
        trigger: TriggerConfig
        filter?: FilterExpression
        spawn: RoutineSpawnOverrides
        concurrency: Routine['concurrency']
        createdBy?: string
    }
): Routine {
    const now = Date.now()
    const config: RoutineConfigBlob = {
        trigger: params.trigger,
        filter: params.filter,
        spawn: params.spawn,
        concurrency: params.concurrency
    }
    db.prepare(`
        INSERT INTO routines (
            id, namespace, name, description, version, status,
            trigger_kind, config, created_by, created_at, updated_at
        ) VALUES (
            @id, @namespace, @name, @description, 1, 'active',
            @trigger_kind, @config, @created_by, @now, @now
        )
    `).run({
        id: params.id,
        namespace: params.namespace,
        name: params.name,
        description: params.description ?? null,
        trigger_kind: params.trigger.kind,
        config: JSON.stringify(config),
        created_by: params.createdBy ?? null,
        now
    })
    const row = db.prepare('SELECT * FROM routines WHERE id = ?').get(params.id) as DbRoutineRow | undefined
    if (!row) throw new Error('Failed to create routine')
    return toRoutine(row)
}

export function getRoutine(db: Database, id: string, namespace: string): Routine | null {
    const row = db.prepare('SELECT * FROM routines WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoutineRow | undefined
    return row ? toRoutine(row) : null
}

export function listRoutines(db: Database, namespace: string): Routine[] {
    const rows = db.prepare('SELECT * FROM routines WHERE namespace = ? ORDER BY updated_at DESC').all(namespace) as DbRoutineRow[]
    return rows.map(toRoutine)
}

export function listActiveRoutinesByTrigger(db: Database, triggerKind: TriggerKind): Routine[] {
    const rows = db.prepare(
        `SELECT * FROM routines WHERE trigger_kind = ? AND status = 'active' ORDER BY id ASC`
    ).all(triggerKind) as DbRoutineRow[]
    return rows.map(toRoutine)
}

export function updateRoutine(
    db: Database,
    id: string,
    namespace: string,
    updates: {
        name?: string
        description?: string | null
        status?: RoutineStatus
        trigger?: TriggerConfig
        filter?: FilterExpression | null
        spawn?: RoutineSpawnOverrides
        concurrency?: Routine['concurrency']
    }
): Routine | null {
    const existing = getRoutine(db, id, namespace)
    if (!existing) return null

    const mergedConfig: RoutineConfigBlob = {
        trigger: updates.trigger ?? existing.trigger,
        filter: updates.filter === null ? undefined : (updates.filter ?? existing.filter),
        spawn: updates.spawn ?? existing.spawn,
        concurrency: updates.concurrency ?? existing.concurrency
    }
    const now = Date.now()
    db.prepare(`
        UPDATE routines
           SET name = @name,
               description = @description,
               status = @status,
               trigger_kind = @trigger_kind,
               config = @config,
               version = version + 1,
               updated_at = @now
         WHERE id = @id AND namespace = @namespace
    `).run({
        id,
        namespace,
        name: updates.name ?? existing.name,
        description: updates.description === null ? null : (updates.description ?? existing.description ?? null),
        status: updates.status ?? existing.status,
        trigger_kind: mergedConfig.trigger.kind,
        config: JSON.stringify(mergedConfig),
        now
    })
    return getRoutine(db, id, namespace)
}

export function deleteRoutine(db: Database, id: string, namespace: string): boolean {
    // Explicit cascading deletes (SQLite CASCADE is not always enabled in Bun's driver
    // config; belt-and-suspenders).
    db.prepare('DELETE FROM routine_events WHERE routine_id = ?').run(id)
    db.prepare('DELETE FROM routine_runs WHERE routine_id = ?').run(id)
    db.prepare('DELETE FROM routine_fires WHERE routine_id = ?').run(id)
    db.prepare('DELETE FROM routine_fire_tokens WHERE routine_id = ?').run(id)
    const result = db.prepare('DELETE FROM routines WHERE id = ? AND namespace = ?').run(id, namespace)
    return result.changes > 0
}

// ── Fire tokens ──────────────────────────────────────────────────────

export function createFireToken(
    db: Database,
    params: {
        id: string
        namespace: string
        routineId: string
        name?: string
        tokenHash: string
        tokenPreview: string
        createdBy?: string
        expiresAt?: number
    }
): RoutineFireToken {
    const now = Date.now()
    db.prepare(`
        INSERT INTO routine_fire_tokens (
            id, namespace, routine_id, name, token_hash, token_preview,
            created_by, created_at, expires_at
        ) VALUES (
            @id, @namespace, @routine_id, @name, @token_hash, @token_preview,
            @created_by, @now, @expires_at
        )
    `).run({
        id: params.id,
        namespace: params.namespace,
        routine_id: params.routineId,
        name: params.name ?? null,
        token_hash: params.tokenHash,
        token_preview: params.tokenPreview,
        created_by: params.createdBy ?? null,
        now,
        expires_at: params.expiresAt ?? null
    })
    const row = db.prepare('SELECT * FROM routine_fire_tokens WHERE id = ?').get(params.id) as DbRoutineTokenRow | undefined
    if (!row) throw new Error('Failed to create fire token')
    return toRoutineToken(row)
}

export function getFireTokenByHash(db: Database, tokenHash: string): RoutineFireToken | null {
    const row = db.prepare('SELECT * FROM routine_fire_tokens WHERE token_hash = ?').get(tokenHash) as DbRoutineTokenRow | undefined
    return row ? toRoutineToken(row) : null
}

export function listFireTokens(db: Database, routineId: string, namespace: string): RoutineFireToken[] {
    const rows = db.prepare(
        'SELECT * FROM routine_fire_tokens WHERE routine_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(routineId, namespace) as DbRoutineTokenRow[]
    return rows.map(toRoutineToken)
}

export function revokeFireToken(db: Database, id: string, namespace: string): boolean {
    const result = db.prepare(
        'UPDATE routine_fire_tokens SET revoked_at = ? WHERE id = ? AND namespace = ? AND revoked_at IS NULL'
    ).run(Date.now(), id, namespace)
    return result.changes > 0
}

export function touchFireTokenLastUsed(db: Database, id: string): void {
    db.prepare('UPDATE routine_fire_tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), id)
}

// ── Fires ────────────────────────────────────────────────────────────

export function recordFire(
    db: Database,
    params: {
        id: string
        namespace: string
        routineId: string
        routineVersion: number
        triggerKind: TriggerKind
        payload?: unknown
        actor: FireActor
        dedupKey?: string
        filterResult?: FilterResult
    }
): RoutineFire {
    const firedAt = Date.now()
    try {
        db.prepare(`
            INSERT INTO routine_fires (
                id, namespace, routine_id, routine_version, trigger_kind,
                payload, actor, dedup_key, filter_result, fired_at
            ) VALUES (
                @id, @namespace, @routine_id, @routine_version, @trigger_kind,
                @payload, @actor, @dedup_key, @filter_result, @fired_at
            )
        `).run({
            id: params.id,
            namespace: params.namespace,
            routine_id: params.routineId,
            routine_version: params.routineVersion,
            trigger_kind: params.triggerKind,
            payload: params.payload === undefined ? null : JSON.stringify(params.payload),
            actor: JSON.stringify(params.actor),
            dedup_key: params.dedupKey ?? null,
            filter_result: params.filterResult === undefined ? null : JSON.stringify(params.filterResult),
            fired_at: firedAt
        })
    } catch (err) {
        // UNIQUE constraint on (routine_id, dedup_key) — webhook redelivery.
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
            throw new FireDuplicateError(params.routineId, params.dedupKey ?? '')
        }
        throw err
    }
    const row = db.prepare('SELECT * FROM routine_fires WHERE id = ?').get(params.id) as DbRoutineFireRow | undefined
    if (!row) throw new Error('Failed to record fire')
    return toRoutineFire(row)
}

export class FireDuplicateError extends Error {
    readonly code = 'fire_duplicate'
    readonly routineId: string
    readonly dedupKey: string
    constructor(routineId: string, dedupKey: string) {
        super(`Fire with dedupKey=${dedupKey} already recorded for routine=${routineId}`)
        this.routineId = routineId
        this.dedupKey = dedupKey
    }
}

export function listFires(db: Database, routineId: string, namespace: string, limit = 100): RoutineFire[] {
    const rows = db.prepare(
        'SELECT * FROM routine_fires WHERE routine_id = ? AND namespace = ? ORDER BY fired_at DESC LIMIT ?'
    ).all(routineId, namespace, limit) as DbRoutineFireRow[]
    return rows.map(toRoutineFire)
}

// ── Runs ─────────────────────────────────────────────────────────────

export function createRun(
    db: Database,
    params: {
        id: string
        namespace: string
        routineId: string
        routineVersion: number
        fireId: string
        status: RoutineRunStatus
        skippedReason?: string
        spawnRequestId?: string
        sessionId?: string
    }
): RoutineRun {
    const now = Date.now()
    const startedAt = params.status === 'queued' || params.status === 'skipped' ? null : now
    const endedAt = isTerminalRunStatus(params.status) ? now : null
    db.prepare(`
        INSERT INTO routine_runs (
            id, namespace, routine_id, routine_version, fire_id,
            spawn_request_id, session_id, status, skipped_reason,
            started_at, ended_at
        ) VALUES (
            @id, @namespace, @routine_id, @routine_version, @fire_id,
            @spawn_request_id, @session_id, @status, @skipped_reason,
            @started_at, @ended_at
        )
    `).run({
        id: params.id,
        namespace: params.namespace,
        routine_id: params.routineId,
        routine_version: params.routineVersion,
        fire_id: params.fireId,
        spawn_request_id: params.spawnRequestId ?? null,
        session_id: params.sessionId ?? null,
        status: params.status,
        skipped_reason: params.skippedReason ?? null,
        started_at: startedAt,
        ended_at: endedAt
    })
    const row = db.prepare('SELECT * FROM routine_runs WHERE id = ?').get(params.id) as DbRoutineRunRow | undefined
    if (!row) throw new Error('Failed to create run')
    return toRoutineRun(row)
}

export function updateRunStatus(
    db: Database,
    id: string,
    namespace: string,
    status: RoutineRunStatus,
    extra?: {
        spawnRequestId?: string
        sessionId?: string
        outcome?: RoutineRunOutcome
    }
): RoutineRun | null {
    const current = db.prepare('SELECT * FROM routine_runs WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoutineRunRow | undefined
    if (!current) return null
    const now = Date.now()
    const startedAt = current.started_at ?? (status === 'spawning' || status === 'running' ? now : null)
    const endedAt = isTerminalRunStatus(status) ? now : current.ended_at
    db.prepare(`
        UPDATE routine_runs
           SET status = @status,
               spawn_request_id = COALESCE(@spawn_request_id, spawn_request_id),
               session_id = COALESCE(@session_id, session_id),
               outcome = COALESCE(@outcome, outcome),
               started_at = @started_at,
               ended_at = @ended_at
         WHERE id = @id AND namespace = @namespace
    `).run({
        id,
        namespace,
        status,
        spawn_request_id: extra?.spawnRequestId ?? null,
        session_id: extra?.sessionId ?? null,
        outcome: extra?.outcome === undefined ? null : JSON.stringify(extra.outcome),
        started_at: startedAt,
        ended_at: endedAt
    })
    const row = db.prepare('SELECT * FROM routine_runs WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoutineRunRow | undefined
    return row ? toRoutineRun(row) : null
}

export function getRun(db: Database, id: string, namespace: string): RoutineRun | null {
    const row = db.prepare('SELECT * FROM routine_runs WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoutineRunRow | undefined
    return row ? toRoutineRun(row) : null
}

export function listRuns(db: Database, routineId: string, namespace: string, limit = 100): RoutineRun[] {
    const rows = db.prepare(
        'SELECT * FROM routine_runs WHERE routine_id = ? AND namespace = ? ORDER BY COALESCE(started_at, 0) DESC LIMIT ?'
    ).all(routineId, namespace, limit) as DbRoutineRunRow[]
    return rows.map(toRoutineRun)
}

export function findActiveRunsForRoutine(db: Database, routineId: string, namespace: string): RoutineRun[] {
    const rows = db.prepare(
        `SELECT * FROM routine_runs
          WHERE routine_id = ? AND namespace = ? AND status IN ('queued', 'spawning', 'running')`
    ).all(routineId, namespace) as DbRoutineRunRow[]
    return rows.map(toRoutineRun)
}

export function findRunBySessionId(db: Database, sessionId: string): RoutineRun | null {
    const row = db.prepare('SELECT * FROM routine_runs WHERE session_id = ? LIMIT 1').get(sessionId) as DbRoutineRunRow | undefined
    return row ? toRoutineRun(row) : null
}

export function findRunBySpawnRequestId(db: Database, spawnRequestId: string): RoutineRun | null {
    const row = db.prepare('SELECT * FROM routine_runs WHERE spawn_request_id = ? LIMIT 1').get(spawnRequestId) as DbRoutineRunRow | undefined
    return row ? toRoutineRun(row) : null
}

// ── Events ───────────────────────────────────────────────────────────

export function appendEvent(
    db: Database,
    params: {
        namespace: string
        routineId: string
        fireId?: string
        runId?: string
        kind: RoutineEventKind
        data?: unknown
    }
): RoutineEvent {
    const at = Date.now()
    const result = db.prepare(`
        INSERT INTO routine_events (namespace, routine_id, fire_id, run_id, kind, data, at)
        VALUES (@namespace, @routine_id, @fire_id, @run_id, @kind, @data, @at)
    `).run({
        namespace: params.namespace,
        routine_id: params.routineId,
        fire_id: params.fireId ?? null,
        run_id: params.runId ?? null,
        kind: params.kind,
        data: params.data === undefined ? null : JSON.stringify(params.data),
        at
    })
    const row = db.prepare('SELECT * FROM routine_events WHERE id = ?').get(Number(result.lastInsertRowid)) as DbRoutineEventRow | undefined
    if (!row) throw new Error('Failed to append routine event')
    return toRoutineEvent(row)
}

export function listEvents(
    db: Database,
    routineId: string,
    namespace: string,
    limit = 200
): RoutineEvent[] {
    const rows = db.prepare(
        'SELECT * FROM routine_events WHERE routine_id = ? AND namespace = ? ORDER BY at DESC, id DESC LIMIT ?'
    ).all(routineId, namespace, limit) as DbRoutineEventRow[]
    return rows.map(toRoutineEvent)
}

export function listEventsForRun(db: Database, runId: string, namespace: string): RoutineEvent[] {
    const rows = db.prepare(
        'SELECT * FROM routine_events WHERE run_id = ? AND namespace = ? ORDER BY at ASC, id ASC'
    ).all(runId, namespace) as DbRoutineEventRow[]
    return rows.map(toRoutineEvent)
}

// ── helpers ──────────────────────────────────────────────────────────

export function isTerminalRunStatus(status: RoutineRunStatus): boolean {
    return status === 'succeeded' || status === 'failed' || status === 'timeout' || status === 'skipped' || status === 'cancelled'
}
