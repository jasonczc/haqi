import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { safeJsonParse } from './json'
import type {
    StoredSwarm,
    StoredSwarmActivity,
    StoredSwarmArtifact,
    StoredSwarmEffect,
    StoredSwarmEvent,
    StoredSwarmOutcome,
    StoredSwarmParticipant,
    StoredSwarmParticipantLease,
    StoredSwarmPolicy,
    StoredSwarmReview,
    StoredSwarmRoleBinding,
    StoredSwarmRoleBindingHistory,
    StoredSwarmRoleProfile,
    StoredSwarmSubject,
    StoredSwarmThread,
    StoredSwarmThreadEntry,
    StoredSwarmTransition,
    StoredSwarmWorkItem,
    StoredSwarmWorkItemAssignment
} from './types'

type DbSwarmRow = {
    id: string
    namespace: string
    title: string
    status: string
    current_phase: string
    created_by: string | null
    created_at: number
    updated_at: number
}

type DbSwarmSubjectRow = {
    id: string
    swarm_id: string
    namespace: string
    kind: string
    summary: string
    success_criteria: string | null
    constraints_json: string | null
    status: string
    created_at: number
    updated_at: number
}

type DbSwarmParticipantRow = {
    id: string
    swarm_id: string
    namespace: string
    kind: 'human' | 'agent' | 'service'
    ref_id: string | null
    provider: string | null
    model: string | null
    capabilities_json: string | null
    availability: string | null
    created_at: number
    updated_at: number
}

type DbSwarmOutcomeRow = {
    id: string
    swarm_id: string
    subject_id: string | null
    work_item_id: string | null
    namespace: string
    kind: string
    status: string
    created_by_participant_id: string | null
    content_json: string | null
    artifact_refs_json: string | null
    created_at: number
    updated_at: number
}

type DbSwarmArtifactRow = {
    id: string
    swarm_id: string
    work_item_id: string | null
    namespace: string
    kind: string
    title: string
    content_json: string | null
    url: string | null
    status: string
    created_at: number
    updated_at: number
}

type DbSwarmWorkItemRow = {
    id: string
    swarm_id: string
    subject_id: string | null
    namespace: string
    title: string
    intent: string | null
    status: string
    assigned_participant_id: string | null
    expected_artifact: string | null
    done_criteria: string | null
    last_dispatch_at: number | null
    created_at: number
    updated_at: number
}

type DbSwarmTransitionRow = {
    id: string
    swarm_id: string
    namespace: string
    entity_type: string
    entity_id: string
    from_state: string | null
    to_state: string
    reason: string | null
    by_participant_id: string | null
    created_at: number
}

type DbSwarmEventRow = {
    id: string
    swarm_id: string
    namespace: string
    type: string
    payload_json: string | null
    created_at: number
}

type DbSwarmEffectRow = {
    id: string
    swarm_id: string
    work_item_id: string | null
    namespace: string
    kind: string
    summary: string | null
    data_json: string | null
    raw_json: string | null
    created_at: number
}


type DbSwarmActivityRow = {
    id: string
    swarm_id: string
    subject_id: string | null
    work_item_id: string | null
    namespace: string
    kind: string
    status: string
    participant_id: string | null
    content_json: string | null
    created_at: number
    updated_at: number
}

type DbSwarmRoleBindingRow = {
    id: string
    swarm_id: string
    namespace: string
    participant_id: string
    role: string
    phase: string | null
    status: string
    created_at: number
    updated_at: number
}

type DbSwarmRoleBindingHistoryRow = {
    id: string
    swarm_id: string
    namespace: string
    participant_id: string
    role: string
    phase: string | null
    action: string
    reason: string | null
    created_at: number
}

type DbSwarmRoleProfileRow = {
    id: string
    swarm_id: string
    namespace: string
    role: string
    instruction_text: string | null
    preferred_skill_ids_json: string | null
    allowed_tools_json: string | null
    output_contract: string | null
    created_at: number
    updated_at: number
}

type DbSwarmThreadRow = {
    id: string
    swarm_id: string
    namespace: string
    title: string
    kind: string
    status: string
    summary: string | null
    created_at: number
    updated_at: number
}

type DbSwarmPolicyRow = {
    id: string
    swarm_id: string
    namespace: string
    kind: string
    status: string
    config_json: string | null
    created_at: number
    updated_at: number
}


type DbSwarmReviewRow = {
    id: string
    swarm_id: string
    work_item_id: string | null
    artifact_id: string | null
    namespace: string
    status: string
    verdict: string | null
    summary: string | null
    created_by_participant_id: string | null
    created_at: number
    updated_at: number
}


type DbSwarmThreadEntryRow = {
    id: string
    swarm_id: string
    thread_id: string
    namespace: string
    kind: string
    participant_id: string | null
    reply_to_entry_id: string | null
    cites_entry_ids_json: string | null
    content_json: string | null
    created_at: number
    updated_at: number
}

type DbSwarmWorkItemAssignmentRow = {
    id: string
    swarm_id: string
    work_item_id: string
    participant_id: string
    namespace: string
    status: string
    assigned_at: number
    unassigned_at: number | null
    reason: string | null
    created_at: number
    updated_at: number
}

type DbSwarmParticipantLeaseRow = {
    id: string
    swarm_id: string
    work_item_id: string
    participant_id: string
    namespace: string
    status: string
    assigned_at: number
    last_heartbeat_at: number | null
    expires_at: number | null
    released_at: number | null
    created_at: number
    updated_at: number
}

function parseStringArray(value: string | null): string[] | null {
    if (!value) {
        return null
    }
    const parsed = safeJsonParse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
        ? parsed
        : null
}

function toStoredSwarm(row: DbSwarmRow): StoredSwarm {
    return {
        id: row.id,
        namespace: row.namespace,
        title: row.title,
        status: row.status,
        currentPhase: row.current_phase,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmSubject(row: DbSwarmSubjectRow): StoredSwarmSubject {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        kind: row.kind,
        summary: row.summary,
        successCriteria: row.success_criteria,
        constraints: safeJsonParse(row.constraints_json),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmParticipant(row: DbSwarmParticipantRow): StoredSwarmParticipant {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        kind: row.kind,
        refId: row.ref_id,
        provider: row.provider,
        model: row.model,
        capabilities: parseStringArray(row.capabilities_json),
        availability: row.availability,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmOutcome(row: DbSwarmOutcomeRow): StoredSwarmOutcome {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        subjectId: row.subject_id,
        workItemId: row.work_item_id,
        namespace: row.namespace,
        kind: row.kind,
        status: row.status,
        createdByParticipantId: row.created_by_participant_id,
        content: safeJsonParse(row.content_json),
        artifactRefs: parseStringArray(row.artifact_refs_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmArtifact(row: DbSwarmArtifactRow): StoredSwarmArtifact {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        workItemId: row.work_item_id,
        namespace: row.namespace,
        kind: row.kind,
        title: row.title,
        content: safeJsonParse(row.content_json),
        url: row.url,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmWorkItem(row: DbSwarmWorkItemRow): StoredSwarmWorkItem {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        subjectId: row.subject_id,
        namespace: row.namespace,
        title: row.title,
        intent: row.intent,
        status: row.status,
        assignedParticipantId: row.assigned_participant_id,
        expectedArtifact: row.expected_artifact,
        doneCriteria: row.done_criteria,
        lastDispatchAt: row.last_dispatch_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmTransition(row: DbSwarmTransitionRow): StoredSwarmTransition {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        entityType: row.entity_type,
        entityId: row.entity_id,
        fromState: row.from_state,
        toState: row.to_state,
        reason: row.reason,
        byParticipantId: row.by_participant_id,
        createdAt: row.created_at
    }
}

function toStoredSwarmEvent(row: DbSwarmEventRow): StoredSwarmEvent {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        type: row.type,
        payload: safeJsonParse(row.payload_json),
        createdAt: row.created_at
    }
}


function toStoredSwarmActivity(row: DbSwarmActivityRow): StoredSwarmActivity {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        subjectId: row.subject_id,
        workItemId: row.work_item_id,
        namespace: row.namespace,
        kind: row.kind,
        status: row.status,
        participantId: row.participant_id,
        content: safeJsonParse(row.content_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmRoleBinding(row: DbSwarmRoleBindingRow): StoredSwarmRoleBinding {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        participantId: row.participant_id,
        role: row.role,
        phase: row.phase,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmRoleBindingHistory(row: DbSwarmRoleBindingHistoryRow): StoredSwarmRoleBindingHistory {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        participantId: row.participant_id,
        role: row.role,
        phase: row.phase,
        action: row.action,
        reason: row.reason,
        createdAt: row.created_at
    }
}

function toStoredSwarmRoleProfile(row: DbSwarmRoleProfileRow): StoredSwarmRoleProfile {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        role: row.role,
        instructionText: row.instruction_text,
        preferredSkillIds: safeJsonParse(row.preferred_skill_ids_json) as string[] | null,
        allowedTools: safeJsonParse(row.allowed_tools_json) as string[] | null,
        outputContract: row.output_contract,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmThread(row: DbSwarmThreadRow): StoredSwarmThread {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        title: row.title,
        kind: row.kind,
        status: row.status,
        summary: row.summary,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmPolicy(row: DbSwarmPolicyRow): StoredSwarmPolicy {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        namespace: row.namespace,
        kind: row.kind,
        status: row.status,
        config: safeJsonParse(row.config_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}


function toStoredSwarmReview(row: DbSwarmReviewRow): StoredSwarmReview {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        workItemId: row.work_item_id,
        artifactId: row.artifact_id,
        namespace: row.namespace,
        status: row.status,
        verdict: row.verdict,
        summary: row.summary,
        createdByParticipantId: row.created_by_participant_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}


function toStoredSwarmThreadEntry(row: DbSwarmThreadEntryRow): StoredSwarmThreadEntry {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        threadId: row.thread_id,
        namespace: row.namespace,
        kind: row.kind,
        participantId: row.participant_id,
        replyToEntryId: row.reply_to_entry_id,
        citesEntryIds: parseStringArray(row.cites_entry_ids_json),
        content: safeJsonParse(row.content_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredSwarmWorkItemAssignment(row: DbSwarmWorkItemAssignmentRow): StoredSwarmWorkItemAssignment {
    return {
        id: row.id, swarmId: row.swarm_id, workItemId: row.work_item_id, participantId: row.participant_id, namespace: row.namespace,
        status: row.status, assignedAt: row.assigned_at, unassignedAt: row.unassigned_at, reason: row.reason, createdAt: row.created_at, updatedAt: row.updated_at
    }
}

function toStoredSwarmParticipantLease(row: DbSwarmParticipantLeaseRow): StoredSwarmParticipantLease {
    return {
        id: row.id, swarmId: row.swarm_id, workItemId: row.work_item_id, participantId: row.participant_id, namespace: row.namespace,
        status: row.status, assignedAt: row.assigned_at, lastHeartbeatAt: row.last_heartbeat_at, expiresAt: row.expires_at, releasedAt: row.released_at, createdAt: row.created_at, updatedAt: row.updated_at
    }
}

function toStoredSwarmEffect(row: DbSwarmEffectRow): StoredSwarmEffect {
    return {
        id: row.id,
        swarmId: row.swarm_id,
        workItemId: row.work_item_id,
        namespace: row.namespace,
        kind: row.kind,
        summary: row.summary,
        data: safeJsonParse(row.data_json),
        raw: safeJsonParse(row.raw_json),
        createdAt: row.created_at
    }
}

function addSwarmEventInternal(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        type: string
        payload?: unknown
        createdAt?: number
    }
): StoredSwarmEvent {
    const id = randomUUID()
    const createdAt = options.createdAt ?? Date.now()
    db.prepare(`
        INSERT INTO swarm_events (
            id, swarm_id, namespace, type, payload_json, created_at
        ) VALUES (
            @id, @swarm_id, @namespace, @type, @payload_json, @created_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        type: options.type,
        payload_json: options.payload === undefined ? null : JSON.stringify(options.payload),
        created_at: createdAt
    })
    const row = db.prepare('SELECT * FROM swarm_events WHERE id = ?').get(id) as DbSwarmEventRow | undefined
    if (!row) {
        throw new Error('Failed to create swarm event')
    }
    return toStoredSwarmEvent(row)
}

export function addSwarmEvent(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        type: string
        payload?: unknown
    }
): StoredSwarmEvent {
    return addSwarmEventInternal(db, options)
}

export function addSwarmEffect(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        workItemId?: string | null
        kind: string
        summary?: string | null
        data?: unknown
        raw?: unknown
        createdAt?: number
    }
): StoredSwarmEffect {
    const id = randomUUID()
    const createdAt = options.createdAt ?? Date.now()
    db.prepare(`
        INSERT INTO swarm_effects (
            id, swarm_id, work_item_id, namespace, kind, summary, data_json, raw_json, created_at
        ) VALUES (
            @id, @swarm_id, @work_item_id, @namespace, @kind, @summary, @data_json, @raw_json, @created_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        work_item_id: options.workItemId ?? null,
        namespace: options.namespace,
        kind: options.kind,
        summary: options.summary ?? null,
        data_json: options.data === undefined ? null : JSON.stringify(options.data),
        raw_json: options.raw === undefined ? null : JSON.stringify(options.raw),
        created_at: createdAt
    })
    const row = db.prepare('SELECT * FROM swarm_effects WHERE id = ?').get(id) as DbSwarmEffectRow | undefined
    if (!row) {
        throw new Error('Failed to create swarm effect')
    }
    return toStoredSwarmEffect(row)
}

export function createSwarm(
    db: Database,
    options: {
        namespace: string
        title: string
        createdBy?: string | null
        status?: string
        currentPhase?: string
        subject?: {
            kind?: string
            summary: string
            successCriteria?: string | null
            constraints?: unknown
            status?: string
        }
    }
): StoredSwarm {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarms (
            id, namespace, title, status, current_phase, created_by, created_at, updated_at
        ) VALUES (
            @id, @namespace, @title, @status, @current_phase, @created_by, @created_at, @updated_at
        )
    `).run({
        id,
        namespace: options.namespace,
        title: options.title,
        status: options.status ?? 'active',
        current_phase: options.currentPhase ?? 'define',
        created_by: options.createdBy ?? null,
        created_at: now,
        updated_at: now
    })

    if (options.subject) {
        createSwarmSubject(db, {
            swarmId: id,
            namespace: options.namespace,
            kind: options.subject.kind ?? 'goal',
            summary: options.subject.summary,
            successCriteria: options.subject.successCriteria ?? null,
            constraints: options.subject.constraints,
            status: options.subject.status ?? 'open'
        })
    }

    addSwarmEventInternal(db, {
        swarmId: id,
        namespace: options.namespace,
        type: 'swarm-created',
        payload: {
            title: options.title,
            currentPhase: options.currentPhase ?? 'define'
        },
        createdAt: now
    })

    const created = getSwarmByNamespace(db, id, options.namespace)
    if (!created) {
        throw new Error('Failed to create swarm')
    }
    return created
}

export function getSwarmsByNamespace(db: Database, namespace: string): StoredSwarm[] {
    const rows = db.prepare(
        'SELECT * FROM swarms WHERE namespace = ? ORDER BY updated_at DESC'
    ).all(namespace) as DbSwarmRow[]
    return rows.map(toStoredSwarm)
}

export function getSwarmEffects(db: Database, swarmId: string, namespace: string): StoredSwarmEffect[] {
    const rows = db.prepare(`
        SELECT * FROM swarm_effects
        WHERE swarm_id = ? AND namespace = ?
        ORDER BY created_at DESC
    `).all(swarmId, namespace) as DbSwarmEffectRow[]
    return rows.map(toStoredSwarmEffect)
}

export function getSwarmsByParticipantRef(
    db: Database,
    namespace: string,
    refId: string
): StoredSwarm[] {
    const rows = db.prepare(`
        SELECT s.*
        FROM swarms s
        INNER JOIN swarm_participants p
            ON p.swarm_id = s.id AND p.namespace = s.namespace
        WHERE s.namespace = ? AND p.ref_id = ?
        ORDER BY s.updated_at DESC
    `).all(namespace, refId) as DbSwarmRow[]
    return rows.map(toStoredSwarm)
}

export function getSwarmParticipantByRef(
    db: Database,
    swarmId: string,
    namespace: string,
    refId: string
): StoredSwarmParticipant | null {
    const row = db.prepare(
        'SELECT * FROM swarm_participants WHERE swarm_id = ? AND namespace = ? AND ref_id = ? LIMIT 1'
    ).get(swarmId, namespace, refId) as DbSwarmParticipantRow | undefined
    return row ? toStoredSwarmParticipant(row) : null
}

export function getSwarmByNamespace(db: Database, swarmId: string, namespace: string): StoredSwarm | null {
    const row = db.prepare(
        'SELECT * FROM swarms WHERE id = ? AND namespace = ? LIMIT 1'
    ).get(swarmId, namespace) as DbSwarmRow | undefined
    return row ? toStoredSwarm(row) : null
}

export function updateSwarm(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        title?: string
        status?: string
        currentPhase?: string
    }
): StoredSwarm | null {
    const existing = getSwarmByNamespace(db, options.swarmId, options.namespace)
    if (!existing) {
        return null
    }

    const next = {
        title: options.title ?? existing.title,
        status: options.status ?? existing.status,
        currentPhase: options.currentPhase ?? existing.currentPhase,
        updatedAt: Date.now()
    }

    db.prepare(`
        UPDATE swarms
        SET title = @title,
            status = @status,
            current_phase = @current_phase,
            updated_at = @updated_at
        WHERE id = @id AND namespace = @namespace
    `).run({
        id: options.swarmId,
        namespace: options.namespace,
        title: next.title,
        status: next.status,
        current_phase: next.currentPhase,
        updated_at: next.updatedAt
    })

    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'swarm-updated',
        payload: {
            title: next.title,
            status: next.status,
            currentPhase: next.currentPhase
        },
        createdAt: next.updatedAt
    })

    return getSwarmByNamespace(db, options.swarmId, options.namespace)
}

export function createSwarmSubject(
    db: Database,
    options: {
        swarmId: string
        workItemId?: string | null
        namespace: string
        kind: string
        summary: string
        successCriteria?: string | null
        constraints?: unknown
        status?: string
    }
): StoredSwarmSubject {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_subjects (
            id, swarm_id, namespace, kind, summary, success_criteria, constraints_json, status, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @kind, @summary, @success_criteria, @constraints_json, @status, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        kind: options.kind,
        summary: options.summary,
        success_criteria: options.successCriteria ?? null,
        constraints_json: options.constraints === undefined ? null : JSON.stringify(options.constraints),
        status: options.status ?? 'open',
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_subjects WHERE id = ?').get(id) as DbSwarmSubjectRow | undefined
    if (!row) {
        throw new Error('Failed to create swarm subject')
    }
    const subject = toStoredSwarmSubject(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'subject-created',
        payload: {
            subjectId: subject.id,
            kind: subject.kind,
            summary: subject.summary
        },
        createdAt: now
    })
    return subject
}

export function getSwarmSubject(db: Database, swarmId: string, namespace: string): StoredSwarmSubject | null {
    const row = db.prepare(
        'SELECT * FROM swarm_subjects WHERE swarm_id = ? AND namespace = ? ORDER BY created_at ASC LIMIT 1'
    ).get(swarmId, namespace) as DbSwarmSubjectRow | undefined
    return row ? toStoredSwarmSubject(row) : null
}

export function updateSwarmSubject(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        kind?: string
        summary?: string
        successCriteria?: string | null
        constraints?: unknown
        status?: string
    }
): StoredSwarmSubject {
    const existing = getSwarmSubject(db, options.swarmId, options.namespace)
    if (!existing) {
        return createSwarmSubject(db, {
            swarmId: options.swarmId,
            namespace: options.namespace,
            kind: options.kind ?? 'goal',
            summary: options.summary ?? '',
            successCriteria: options.successCriteria ?? null,
            constraints: options.constraints,
            status: options.status ?? 'open'
        })
    }

    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_subjects
        SET kind = @kind,
            summary = @summary,
            success_criteria = @success_criteria,
            constraints_json = @constraints_json,
            status = @status,
            updated_at = @updated_at
        WHERE id = @id
    `).run({
        id: existing.id,
        kind: options.kind ?? existing.kind,
        summary: options.summary ?? existing.summary,
        success_criteria: options.successCriteria ?? existing.successCriteria,
        constraints_json: options.constraints === undefined ? JSON.stringify(existing.constraints) : JSON.stringify(options.constraints),
        status: options.status ?? existing.status,
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_subjects WHERE id = ?').get(existing.id) as DbSwarmSubjectRow | undefined
    if (!row) {
        throw new Error('Failed to update swarm subject')
    }
    const subject = toStoredSwarmSubject(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'subject-updated',
        payload: {
            subjectId: subject.id,
            status: subject.status
        },
        createdAt: updatedAt
    })
    return subject
}

export function getSwarmParticipants(db: Database, swarmId: string, namespace: string): StoredSwarmParticipant[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_participants WHERE swarm_id = ? AND namespace = ? ORDER BY created_at ASC'
    ).all(swarmId, namespace) as DbSwarmParticipantRow[]
    return rows.map(toStoredSwarmParticipant)
}

export function addSwarmParticipant(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        kind: 'human' | 'agent' | 'service'
        refId?: string | null
        provider?: string | null
        model?: string | null
        capabilities?: string[] | null
        availability?: string | null
    }
): StoredSwarmParticipant {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_participants (
            id, swarm_id, namespace, kind, ref_id, provider, model, capabilities_json, availability, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @kind, @ref_id, @provider, @model, @capabilities_json, @availability, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        kind: options.kind,
        ref_id: options.refId ?? null,
        provider: options.provider ?? null,
        model: options.model ?? null,
        capabilities_json: options.capabilities ? JSON.stringify(options.capabilities) : null,
        availability: options.availability ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_participants WHERE id = ?').get(id) as DbSwarmParticipantRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm participant')
    }
    const participant = toStoredSwarmParticipant(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'participant-added',
        payload: {
            participantId: participant.id,
            kind: participant.kind,
            refId: participant.refId
        },
        createdAt: now
    })
    return participant
}

export function removeSwarmParticipant(db: Database, swarmId: string, namespace: string, participantId: string): boolean {
    const existing = db.prepare(
        'SELECT * FROM swarm_participants WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(participantId, swarmId, namespace) as DbSwarmParticipantRow | undefined
    if (!existing) {
        return false
    }
    const result = db.prepare(
        'DELETE FROM swarm_participants WHERE id = ? AND swarm_id = ? AND namespace = ?'
    ).run(participantId, swarmId, namespace)
    if (result.changes > 0) {
        addSwarmEventInternal(db, {
            swarmId,
            namespace,
            type: 'participant-removed',
            payload: {
                participantId,
                refId: existing.ref_id
            }
        })
        return true
    }
    return false
}

export function getSwarmOutcomes(db: Database, swarmId: string, namespace: string): StoredSwarmOutcome[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_outcomes WHERE swarm_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(swarmId, namespace) as DbSwarmOutcomeRow[]
    return rows.map(toStoredSwarmOutcome)
}

export function addSwarmOutcome(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        subjectId?: string | null
        workItemId?: string | null
        kind: string
        status?: string
        createdByParticipantId?: string | null
        content?: unknown
        artifactRefs?: string[] | null
    }
): StoredSwarmOutcome {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_outcomes (
            id, swarm_id, subject_id, work_item_id, namespace, kind, status, created_by_participant_id, content_json, artifact_refs_json, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @subject_id, @work_item_id, @namespace, @kind, @status, @created_by_participant_id, @content_json, @artifact_refs_json, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        subject_id: options.subjectId ?? null,
        work_item_id: options.workItemId ?? null,
        namespace: options.namespace,
        kind: options.kind,
        status: options.status ?? 'open',
        created_by_participant_id: options.createdByParticipantId ?? null,
        content_json: options.content === undefined ? null : JSON.stringify(options.content),
        artifact_refs_json: options.artifactRefs ? JSON.stringify(options.artifactRefs) : null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_outcomes WHERE id = ?').get(id) as DbSwarmOutcomeRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm outcome')
    }
    const outcome = toStoredSwarmOutcome(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'outcome-created',
        payload: {
            outcomeId: outcome.id,
            kind: outcome.kind,
            status: outcome.status
        },
        createdAt: now
    })
    return outcome
}

export function updateSwarmOutcome(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        outcomeId: string
        workItemId?: string | null
        status?: string
        content?: unknown
        artifactRefs?: string[] | null
    }
): StoredSwarmOutcome | null {
    const existing = db.prepare(
        'SELECT * FROM swarm_outcomes WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(options.outcomeId, options.swarmId, options.namespace) as DbSwarmOutcomeRow | undefined
    if (!existing) {
        return null
    }
    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_outcomes
        SET status = @status,
            work_item_id = @work_item_id,
            content_json = @content_json,
            artifact_refs_json = @artifact_refs_json,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.outcomeId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        status: options.status ?? existing.status,
        work_item_id: options.workItemId === undefined ? existing.work_item_id : options.workItemId,
        content_json: options.content === undefined ? existing.content_json : JSON.stringify(options.content),
        artifact_refs_json: options.artifactRefs === undefined ? existing.artifact_refs_json : JSON.stringify(options.artifactRefs),
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_outcomes WHERE id = ?').get(options.outcomeId) as DbSwarmOutcomeRow | undefined
    if (!row) {
        throw new Error('Failed to update swarm outcome')
    }
    const outcome = toStoredSwarmOutcome(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'outcome-updated',
        payload: {
            outcomeId: outcome.id,
            status: outcome.status
        },
        createdAt: updatedAt
    })
    return outcome
}

export function getSwarmWorkItems(db: Database, swarmId: string, namespace: string): StoredSwarmWorkItem[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_work_items WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmWorkItemRow[]
    return rows.map(toStoredSwarmWorkItem)
}

export function getSwarmWorkItemById(
    db: Database,
    swarmId: string,
    namespace: string,
    workItemId: string
): StoredSwarmWorkItem | null {
    const row = db.prepare(
        'SELECT * FROM swarm_work_items WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(workItemId, swarmId, namespace) as DbSwarmWorkItemRow | undefined
    return row ? toStoredSwarmWorkItem(row) : null
}

export function addSwarmWorkItem(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        subjectId?: string | null
        title: string
        intent?: string | null
        status?: string
        assignedParticipantId?: string | null
        expectedArtifact?: string | null
        doneCriteria?: string | null
        lastDispatchAt?: number | null
    }
): StoredSwarmWorkItem {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_work_items (
            id, swarm_id, subject_id, namespace, title, intent, status, assigned_participant_id,
            expected_artifact, done_criteria, last_dispatch_at, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @subject_id, @namespace, @title, @intent, @status, @assigned_participant_id,
            @expected_artifact, @done_criteria, @last_dispatch_at, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        subject_id: options.subjectId ?? null,
        namespace: options.namespace,
        title: options.title,
        intent: options.intent ?? null,
        status: options.status ?? 'open',
        assigned_participant_id: options.assignedParticipantId ?? null,
        expected_artifact: options.expectedArtifact ?? null,
        done_criteria: options.doneCriteria ?? null,
        last_dispatch_at: options.lastDispatchAt ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_work_items WHERE id = ?').get(id) as DbSwarmWorkItemRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm work item')
    }
    const workItem = toStoredSwarmWorkItem(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'work-item-created',
        payload: {
            workItemId: workItem.id,
            title: workItem.title,
            status: workItem.status,
            assignedParticipantId: workItem.assignedParticipantId
        },
        createdAt: now
    })
    return workItem
}

export function updateSwarmWorkItem(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        workItemId: string
        title?: string
        intent?: string | null
        status?: string
        assignedParticipantId?: string | null
        expectedArtifact?: string | null
        doneCriteria?: string | null
        lastDispatchAt?: number | null
    }
): StoredSwarmWorkItem | null {
    const existing = db.prepare(
        'SELECT * FROM swarm_work_items WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(options.workItemId, options.swarmId, options.namespace) as DbSwarmWorkItemRow | undefined
    if (!existing) {
        return null
    }
    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_work_items
        SET title = @title,
            intent = @intent,
            status = @status,
            assigned_participant_id = @assigned_participant_id,
            expected_artifact = @expected_artifact,
            done_criteria = @done_criteria,
            last_dispatch_at = @last_dispatch_at,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.workItemId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        title: options.title ?? existing.title,
        intent: options.intent === undefined ? existing.intent : options.intent,
        status: options.status ?? existing.status,
        assigned_participant_id: options.assignedParticipantId === undefined ? existing.assigned_participant_id : options.assignedParticipantId,
        expected_artifact: options.expectedArtifact === undefined ? existing.expected_artifact : options.expectedArtifact,
        done_criteria: options.doneCriteria === undefined ? existing.done_criteria : options.doneCriteria,
        last_dispatch_at: options.lastDispatchAt === undefined ? existing.last_dispatch_at : options.lastDispatchAt,
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_work_items WHERE id = ?').get(options.workItemId) as DbSwarmWorkItemRow | undefined
    if (!row) {
        throw new Error('Failed to update swarm work item')
    }
    const workItem = toStoredSwarmWorkItem(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'work-item-updated',
        payload: {
            workItemId: workItem.id,
            status: workItem.status,
            assignedParticipantId: workItem.assignedParticipantId
        },
        createdAt: updatedAt
    })
    return workItem
}

export function getSwarmArtifacts(db: Database, swarmId: string, namespace: string): StoredSwarmArtifact[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_artifacts WHERE swarm_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(swarmId, namespace) as DbSwarmArtifactRow[]
    return rows.map(toStoredSwarmArtifact)
}

export function addSwarmArtifact(
    db: Database,
    options: {
        swarmId: string
        workItemId?: string | null
        namespace: string
        kind: string
        title: string
        content?: unknown
        url?: string | null
        status?: string
    }
): StoredSwarmArtifact {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_artifacts (
            id, swarm_id, work_item_id, namespace, kind, title, content_json, url, status, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @work_item_id, @namespace, @kind, @title, @content_json, @url, @status, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        work_item_id: options.workItemId ?? null,
        namespace: options.namespace,
        kind: options.kind,
        title: options.title,
        content_json: options.content === undefined ? null : JSON.stringify(options.content),
        url: options.url ?? null,
        status: options.status ?? 'draft',
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_artifacts WHERE id = ?').get(id) as DbSwarmArtifactRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm artifact')
    }
    const artifact = toStoredSwarmArtifact(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'artifact-created',
        payload: {
            artifactId: artifact.id,
            kind: artifact.kind,
            title: artifact.title
        },
        createdAt: now
    })
    return artifact
}

export function getSwarmTransitions(db: Database, swarmId: string, namespace: string): StoredSwarmTransition[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_transitions WHERE swarm_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(swarmId, namespace) as DbSwarmTransitionRow[]
    return rows.map(toStoredSwarmTransition)
}

export function addSwarmTransition(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        entityType: string
        entityId: string
        fromState?: string | null
        toState: string
        reason?: string | null
        byParticipantId?: string | null
    }
): StoredSwarmTransition {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_transitions (
            id, swarm_id, namespace, entity_type, entity_id, from_state, to_state, reason, by_participant_id, created_at
        ) VALUES (
            @id, @swarm_id, @namespace, @entity_type, @entity_id, @from_state, @to_state, @reason, @by_participant_id, @created_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        entity_type: options.entityType,
        entity_id: options.entityId,
        from_state: options.fromState ?? null,
        to_state: options.toState,
        reason: options.reason ?? null,
        by_participant_id: options.byParticipantId ?? null,
        created_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_transitions WHERE id = ?').get(id) as DbSwarmTransitionRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm transition')
    }
    const transition = toStoredSwarmTransition(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'transition-created',
        payload: {
            transitionId: transition.id,
            entityType: transition.entityType,
            toState: transition.toState
        },
        createdAt: now
    })
    return transition
}

export function getSwarmEvents(db: Database, swarmId: string, namespace: string): StoredSwarmEvent[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_events WHERE swarm_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(swarmId, namespace) as DbSwarmEventRow[]
    return rows.map(toStoredSwarmEvent)
}

export function getSwarmThreadEntries(db: Database, swarmId: string, namespace: string): StoredSwarmThreadEntry[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_thread_entries WHERE swarm_id = ? AND namespace = ? ORDER BY created_at ASC'
    ).all(swarmId, namespace) as DbSwarmThreadEntryRow[]
    return rows.map(toStoredSwarmThreadEntry)
}

export function addSwarmThreadEntry(
    db: Database,
    options: {
        swarmId: string
        threadId: string
        namespace: string
        kind: string
        participantId?: string | null
        replyToEntryId?: string | null
        citesEntryIds?: string[] | null
        content?: unknown
    }
): StoredSwarmThreadEntry {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_thread_entries (
            id, swarm_id, thread_id, namespace, kind, participant_id, reply_to_entry_id, cites_entry_ids_json, content_json, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @thread_id, @namespace, @kind, @participant_id, @reply_to_entry_id, @cites_entry_ids_json, @content_json, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        thread_id: options.threadId,
        namespace: options.namespace,
        kind: options.kind,
        participant_id: options.participantId ?? null,
        reply_to_entry_id: options.replyToEntryId ?? null,
        cites_entry_ids_json: options.citesEntryIds ? JSON.stringify(options.citesEntryIds) : null,
        content_json: options.content === undefined ? null : JSON.stringify(options.content),
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_thread_entries WHERE id = ?').get(id) as DbSwarmThreadEntryRow | undefined
    if (!row) throw new Error('Failed to add swarm thread entry')
    return toStoredSwarmThreadEntry(row)
}

export function getSwarmWorkItemAssignments(db: Database, swarmId: string, namespace: string): StoredSwarmWorkItemAssignment[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_work_item_assignments WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmWorkItemAssignmentRow[]
    return rows.map(toStoredSwarmWorkItemAssignment)
}

export function addSwarmWorkItemAssignment(
    db: Database,
    options: {
        swarmId: string
        workItemId: string
        participantId: string
        namespace: string
        status?: string
        assignedAt?: number
        reason?: string | null
    }
): StoredSwarmWorkItemAssignment {
    const id = randomUUID()
    const now = Date.now()
    const assignedAt = options.assignedAt ?? now
    db.prepare(`
        INSERT INTO swarm_work_item_assignments (
            id, swarm_id, work_item_id, participant_id, namespace, status, assigned_at, unassigned_at, reason, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @work_item_id, @participant_id, @namespace, @status, @assigned_at, NULL, @reason, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        work_item_id: options.workItemId,
        participant_id: options.participantId,
        namespace: options.namespace,
        status: options.status ?? 'active',
        assigned_at: assignedAt,
        reason: options.reason ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_work_item_assignments WHERE id = ?').get(id) as DbSwarmWorkItemAssignmentRow | undefined
    if (!row) throw new Error('Failed to add swarm work item assignment')
    return toStoredSwarmWorkItemAssignment(row)
}

export function releaseSwarmWorkItemAssignments(
    db: Database,
    options: {
        swarmId: string
        workItemId: string
        namespace: string
        participantId?: string
        reason?: string | null
    }
): StoredSwarmWorkItemAssignment[] {
    const now = Date.now()
    if (options.participantId) {
        db.prepare(`
            UPDATE swarm_work_item_assignments
            SET status = 'released',
                unassigned_at = COALESCE(unassigned_at, ?),
                reason = COALESCE(?, reason),
                updated_at = ?
            WHERE swarm_id = ?
              AND work_item_id = ?
              AND namespace = ?
              AND status != 'released'
              AND participant_id = ?
        `).run(now, options.reason ?? null, now, options.swarmId, options.workItemId, options.namespace, options.participantId)
        const rows = db.prepare(
            `SELECT * FROM swarm_work_item_assignments
             WHERE swarm_id = ? AND work_item_id = ? AND namespace = ? AND participant_id = ?
             ORDER BY updated_at DESC, created_at DESC`
        ).all(options.swarmId, options.workItemId, options.namespace, options.participantId) as DbSwarmWorkItemAssignmentRow[]
        return rows.map(toStoredSwarmWorkItemAssignment)
    }
    db.prepare(`
        UPDATE swarm_work_item_assignments
        SET status = 'released',
            unassigned_at = COALESCE(unassigned_at, ?),
            reason = COALESCE(?, reason),
            updated_at = ?
        WHERE swarm_id = ?
          AND work_item_id = ?
          AND namespace = ?
          AND status != 'released'
    `).run(now, options.reason ?? null, now, options.swarmId, options.workItemId, options.namespace)
    const rows = db.prepare(
        `SELECT * FROM swarm_work_item_assignments
         WHERE swarm_id = ? AND work_item_id = ? AND namespace = ?
         ORDER BY updated_at DESC, created_at DESC`
    ).all(options.swarmId, options.workItemId, options.namespace) as DbSwarmWorkItemAssignmentRow[]
    return rows.map(toStoredSwarmWorkItemAssignment)
}

export function getSwarmParticipantLeases(db: Database, swarmId: string, namespace: string): StoredSwarmParticipantLease[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_participant_leases WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmParticipantLeaseRow[]
    return rows.map(toStoredSwarmParticipantLease)
}

export function upsertSwarmParticipantLease(
    db: Database,
    options: {
        swarmId: string
        workItemId: string
        participantId: string
        namespace: string
        status?: string
        lastHeartbeatAt?: number | null
        expiresAt?: number | null
        releasedAt?: number | null
    }
): StoredSwarmParticipantLease {
    const existing = db.prepare(
        'SELECT * FROM swarm_participant_leases WHERE swarm_id = ? AND work_item_id = ? AND participant_id = ? AND namespace = ? LIMIT 1'
    ).get(options.swarmId, options.workItemId, options.participantId, options.namespace) as DbSwarmParticipantLeaseRow | undefined
    const now = Date.now()
    if (!existing) {
        const id = randomUUID()
        db.prepare(`
            INSERT INTO swarm_participant_leases (
                id, swarm_id, work_item_id, participant_id, namespace, status, assigned_at, last_heartbeat_at, expires_at, released_at, created_at, updated_at
            ) VALUES (
                @id, @swarm_id, @work_item_id, @participant_id, @namespace, @status, @assigned_at, @last_heartbeat_at, @expires_at, @released_at, @created_at, @updated_at
            )
        `).run({
            id,
            swarm_id: options.swarmId,
            work_item_id: options.workItemId,
            participant_id: options.participantId,
            namespace: options.namespace,
            status: options.status ?? 'active',
            assigned_at: now,
            last_heartbeat_at: options.lastHeartbeatAt ?? now,
            expires_at: options.expiresAt ?? null,
            released_at: options.releasedAt ?? null,
            created_at: now,
            updated_at: now
        })
        const row = db.prepare('SELECT * FROM swarm_participant_leases WHERE id = ?').get(id) as DbSwarmParticipantLeaseRow | undefined
        if (!row) throw new Error('Failed to create swarm participant lease')
        return toStoredSwarmParticipantLease(row)
    }
    db.prepare(`
        UPDATE swarm_participant_leases
        SET status = @status,
            last_heartbeat_at = @last_heartbeat_at,
            expires_at = @expires_at,
            released_at = @released_at,
            updated_at = @updated_at
        WHERE id = @id
    `).run({
        id: existing.id,
        status: options.status ?? existing.status,
        last_heartbeat_at: options.lastHeartbeatAt === undefined ? existing.last_heartbeat_at : options.lastHeartbeatAt,
        expires_at: options.expiresAt === undefined ? existing.expires_at : options.expiresAt,
        released_at: options.releasedAt === undefined ? existing.released_at : options.releasedAt,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_participant_leases WHERE id = ?').get(existing.id) as DbSwarmParticipantLeaseRow | undefined
    if (!row) throw new Error('Failed to update swarm participant lease')
    return toStoredSwarmParticipantLease(row)
}

export function getSwarmActivities(db: Database, swarmId: string, namespace: string): StoredSwarmActivity[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_activities WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmActivityRow[]
    return rows.map(toStoredSwarmActivity)
}

export function addSwarmActivity(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        subjectId?: string | null
        workItemId?: string | null
        kind: string
        status?: string
        participantId?: string | null
        content?: unknown
    }
): StoredSwarmActivity {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_activities (
            id, swarm_id, subject_id, work_item_id, namespace, kind, status, participant_id, content_json, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @subject_id, @work_item_id, @namespace, @kind, @status, @participant_id, @content_json, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        subject_id: options.subjectId ?? null,
        work_item_id: options.workItemId ?? null,
        namespace: options.namespace,
        kind: options.kind,
        status: options.status ?? 'open',
        participant_id: options.participantId ?? null,
        content_json: options.content === undefined ? null : JSON.stringify(options.content),
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_activities WHERE id = ?').get(id) as DbSwarmActivityRow | undefined
    if (!row) {
        throw new Error('Failed to add swarm activity')
    }
    const activity = toStoredSwarmActivity(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'activity-created',
        payload: { activityId: activity.id, kind: activity.kind, status: activity.status },
        createdAt: now
    })
    return activity
}

export function updateSwarmActivity(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        activityId: string
        status?: string
        content?: unknown
    }
): StoredSwarmActivity | null {
    const existing = db.prepare(
        'SELECT * FROM swarm_activities WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(options.activityId, options.swarmId, options.namespace) as DbSwarmActivityRow | undefined
    if (!existing) {
        return null
    }
    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_activities
        SET status = @status,
            content_json = @content_json,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.activityId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        status: options.status ?? existing.status,
        content_json: options.content === undefined ? existing.content_json : JSON.stringify(options.content),
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_activities WHERE id = ?').get(options.activityId) as DbSwarmActivityRow | undefined
    return row ? toStoredSwarmActivity(row) : null
}

export function getSwarmRoleBindings(db: Database, swarmId: string, namespace: string): StoredSwarmRoleBinding[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_role_bindings WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmRoleBindingRow[]
    return rows.map(toStoredSwarmRoleBinding)
}

export function addSwarmRoleBinding(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        participantId: string
        role: string
        phase?: string | null
        status?: string
    }
): StoredSwarmRoleBinding {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_role_bindings (
            id, swarm_id, namespace, participant_id, role, phase, status, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @participant_id, @role, @phase, @status, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        participant_id: options.participantId,
        role: options.role,
        phase: options.phase ?? null,
        status: options.status ?? 'active',
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_role_bindings WHERE id = ?').get(id) as DbSwarmRoleBindingRow | undefined
    if (!row) throw new Error('Failed to add swarm role binding')
    return toStoredSwarmRoleBinding(row)
}

export function resetSwarmRoleBindings(
    db: Database,
    options: {
        swarmId: string
        namespace: string
    }
): void {
    db.prepare(
        'DELETE FROM swarm_role_bindings WHERE swarm_id = ? AND namespace = ?'
    ).run(options.swarmId, options.namespace)
}

export function getSwarmRoleBindingHistory(db: Database, swarmId: string, namespace: string): StoredSwarmRoleBindingHistory[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_role_binding_history WHERE swarm_id = ? AND namespace = ? ORDER BY created_at DESC'
    ).all(swarmId, namespace) as DbSwarmRoleBindingHistoryRow[]
    return rows.map(toStoredSwarmRoleBindingHistory)
}

export function addSwarmRoleBindingHistory(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        participantId: string
        role: string
        phase?: string | null
        action: string
        reason?: string | null
    }
): StoredSwarmRoleBindingHistory {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_role_binding_history (
            id, swarm_id, namespace, participant_id, role, phase, action, reason, created_at
        ) VALUES (
            @id, @swarm_id, @namespace, @participant_id, @role, @phase, @action, @reason, @created_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        participant_id: options.participantId,
        role: options.role,
        phase: options.phase ?? null,
        action: options.action,
        reason: options.reason ?? null,
        created_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_role_binding_history WHERE id = ?').get(id) as DbSwarmRoleBindingHistoryRow | undefined
    if (!row) throw new Error('Failed to add swarm role binding history')
    return toStoredSwarmRoleBindingHistory(row)
}

export function getSwarmRoleProfiles(db: Database, swarmId: string, namespace: string): StoredSwarmRoleProfile[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_role_profiles WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmRoleProfileRow[]
    return rows.map(toStoredSwarmRoleProfile)
}

export function addSwarmRoleProfile(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        role: string
        instructionText?: string | null
        preferredSkillIds?: string[] | null
        allowedTools?: string[] | null
        outputContract?: string | null
    }
): StoredSwarmRoleProfile {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_role_profiles (
            id, swarm_id, namespace, role, instruction_text, preferred_skill_ids_json, allowed_tools_json, output_contract, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @role, @instruction_text, @preferred_skill_ids_json, @allowed_tools_json, @output_contract, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        role: options.role,
        instruction_text: options.instructionText ?? null,
        preferred_skill_ids_json: options.preferredSkillIds === undefined ? null : JSON.stringify(options.preferredSkillIds),
        allowed_tools_json: options.allowedTools === undefined ? null : JSON.stringify(options.allowedTools),
        output_contract: options.outputContract ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_role_profiles WHERE id = ?').get(id) as DbSwarmRoleProfileRow | undefined
    if (!row) throw new Error('Failed to add swarm role profile')
    return toStoredSwarmRoleProfile(row)
}

export function updateSwarmRoleProfile(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        roleProfileId: string
        instructionText?: string | null
        preferredSkillIds?: string[] | null
        allowedTools?: string[] | null
        outputContract?: string | null
    }
): StoredSwarmRoleProfile | null {
    const existing = db.prepare(
        'SELECT * FROM swarm_role_profiles WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(options.roleProfileId, options.swarmId, options.namespace) as DbSwarmRoleProfileRow | undefined
    if (!existing) {
        return null
    }
    const now = Date.now()
    db.prepare(`
        UPDATE swarm_role_profiles
        SET instruction_text = @instruction_text,
            preferred_skill_ids_json = @preferred_skill_ids_json,
            allowed_tools_json = @allowed_tools_json,
            output_contract = @output_contract,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.roleProfileId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        instruction_text: options.instructionText === undefined ? existing.instruction_text : options.instructionText,
        preferred_skill_ids_json: options.preferredSkillIds === undefined ? existing.preferred_skill_ids_json : JSON.stringify(options.preferredSkillIds),
        allowed_tools_json: options.allowedTools === undefined ? existing.allowed_tools_json : JSON.stringify(options.allowedTools),
        output_contract: options.outputContract === undefined ? existing.output_contract : options.outputContract,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_role_profiles WHERE id = ?').get(options.roleProfileId) as DbSwarmRoleProfileRow | undefined
    return row ? toStoredSwarmRoleProfile(row) : null
}

export function getSwarmThreads(db: Database, swarmId: string, namespace: string): StoredSwarmThread[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_threads WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmThreadRow[]
    return rows.map(toStoredSwarmThread)
}

export function addSwarmThread(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        title: string
        kind?: string
        status?: string
        summary?: string | null
    }
): StoredSwarmThread {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_threads (
            id, swarm_id, namespace, title, kind, status, summary, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @title, @kind, @status, @summary, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        title: options.title,
        kind: options.kind ?? 'discussion',
        status: options.status ?? 'open',
        summary: options.summary ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_threads WHERE id = ?').get(id) as DbSwarmThreadRow | undefined
    if (!row) throw new Error('Failed to add swarm thread')
    return toStoredSwarmThread(row)
}



export function getSwarmReviews(db: Database, swarmId: string, namespace: string): StoredSwarmReview[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_reviews WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmReviewRow[]
    return rows.map(toStoredSwarmReview)
}

export function addSwarmReview(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        workItemId?: string | null
        artifactId?: string | null
        status?: string
        verdict?: string | null
        summary?: string | null
        createdByParticipantId?: string | null
    }
): StoredSwarmReview {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_reviews (
            id, swarm_id, work_item_id, artifact_id, namespace, status, verdict, summary, created_by_participant_id, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @work_item_id, @artifact_id, @namespace, @status, @verdict, @summary, @created_by_participant_id, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        work_item_id: options.workItemId ?? null,
        artifact_id: options.artifactId ?? null,
        namespace: options.namespace,
        status: options.status ?? 'open',
        verdict: options.verdict ?? null,
        summary: options.summary ?? null,
        created_by_participant_id: options.createdByParticipantId ?? null,
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_reviews WHERE id = ?').get(id) as DbSwarmReviewRow | undefined
    if (!row) throw new Error('Failed to add swarm review')
    const review = toStoredSwarmReview(row)
    addSwarmEventInternal(db, {
        swarmId: options.swarmId,
        namespace: options.namespace,
        type: 'review-created',
        payload: { reviewId: review.id, verdict: review.verdict, status: review.status },
        createdAt: now
    })
    return review
}

export function updateSwarmReview(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        reviewId: string
        status?: string
        verdict?: string | null
        summary?: string | null
    }
): StoredSwarmReview | null {
    const existing = db.prepare('SELECT * FROM swarm_reviews WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1').get(
        options.reviewId, options.swarmId, options.namespace
    ) as DbSwarmReviewRow | undefined
    if (!existing) return null
    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_reviews
        SET status = @status,
            verdict = @verdict,
            summary = @summary,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.reviewId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        status: options.status ?? existing.status,
        verdict: options.verdict === undefined ? existing.verdict : options.verdict,
        summary: options.summary === undefined ? existing.summary : options.summary,
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_reviews WHERE id = ?').get(options.reviewId) as DbSwarmReviewRow | undefined
    return row ? toStoredSwarmReview(row) : null
}

export function getSwarmPolicies(db: Database, swarmId: string, namespace: string): StoredSwarmPolicy[] {
    const rows = db.prepare(
        'SELECT * FROM swarm_policies WHERE swarm_id = ? AND namespace = ? ORDER BY updated_at DESC, created_at DESC'
    ).all(swarmId, namespace) as DbSwarmPolicyRow[]
    return rows.map(toStoredSwarmPolicy)
}

export function addSwarmPolicy(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        kind: string
        status?: string
        config?: unknown
    }
): StoredSwarmPolicy {
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
        INSERT INTO swarm_policies (
            id, swarm_id, namespace, kind, status, config_json, created_at, updated_at
        ) VALUES (
            @id, @swarm_id, @namespace, @kind, @status, @config_json, @created_at, @updated_at
        )
    `).run({
        id,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        kind: options.kind,
        status: options.status ?? 'active',
        config_json: options.config === undefined ? null : JSON.stringify(options.config),
        created_at: now,
        updated_at: now
    })
    const row = db.prepare('SELECT * FROM swarm_policies WHERE id = ?').get(id) as DbSwarmPolicyRow | undefined
    if (!row) throw new Error('Failed to add swarm policy')
    return toStoredSwarmPolicy(row)
}

export function updateSwarmPolicy(
    db: Database,
    options: {
        swarmId: string
        namespace: string
        policyId: string
        status?: string
        config?: unknown
    }
): StoredSwarmPolicy | null {
    const existing = db.prepare(
        'SELECT * FROM swarm_policies WHERE id = ? AND swarm_id = ? AND namespace = ? LIMIT 1'
    ).get(options.policyId, options.swarmId, options.namespace) as DbSwarmPolicyRow | undefined
    if (!existing) {
        return null
    }
    const updatedAt = Date.now()
    db.prepare(`
        UPDATE swarm_policies
        SET status = @status,
            config_json = @config_json,
            updated_at = @updated_at
        WHERE id = @id AND swarm_id = @swarm_id AND namespace = @namespace
    `).run({
        id: options.policyId,
        swarm_id: options.swarmId,
        namespace: options.namespace,
        status: options.status ?? existing.status,
        config_json: options.config === undefined ? existing.config_json : JSON.stringify(options.config),
        updated_at: updatedAt
    })
    const row = db.prepare('SELECT * FROM swarm_policies WHERE id = ?').get(options.policyId) as DbSwarmPolicyRow | undefined
    return row ? toStoredSwarmPolicy(row) : null
}
