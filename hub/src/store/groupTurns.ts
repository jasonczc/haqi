import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import { safeJsonParse } from './json'
import type { StoredGroupConversationTurn, StoredGroupMessage } from './types'

type DbGroupConversationTurnRow = {
    id: string
    group_id: string
    namespace: string
    turn_index: number
    status: 'open' | 'closed'
    initiator_message_id: string | null
    initiator_seq: number | null
    initiator_source: string | null
    initiator_actor_session_id: string | null
    responder_start_seq: number | null
    responder_end_seq: number | null
    message_count: number
    initiator_preview: string | null
    responder_preview: string | null
    created_at: number
    updated_at: number
}

type DbGroupMessageRow = {
    id: string
    group_id: string
    namespace: string
    seq: number
    type: 'chat' | 'command' | 'task_state' | 'note_state' | 'system'
    trace_id: string | null
    task_id: string | null
    source: string
    actor_session_id: string | null
    actor_name: string | null
    target_session_ids: string | null
    quoted_message_id: string | null
    payload: string
    created_at: number
}

type MutableGroupTurn = {
    id: string
    groupId: string
    namespace: string
    turnIndex: number
    status: 'open' | 'closed'
    initiatorMessageId: string | null
    initiatorSeq: number | null
    initiatorSource: string | null
    initiatorActorSessionId: string | null
    responderStartSeq: number | null
    responderEndSeq: number | null
    messageCount: number
    initiatorPreview: string | null
    responderPreview: string | null
    createdAt: number
    updatedAt: number
}

const PREVIEW_TEXT_MAX_LENGTH = 6000
function toStoredGroupConversationTurn(row: DbGroupConversationTurnRow): StoredGroupConversationTurn {
    return {
        id: row.id,
        groupId: row.group_id,
        namespace: row.namespace,
        turnIndex: row.turn_index,
        status: row.status,
        initiatorMessageId: row.initiator_message_id,
        initiatorSeq: row.initiator_seq,
        initiatorSource: row.initiator_source,
        initiatorActorSessionId: row.initiator_actor_session_id,
        responderStartSeq: row.responder_start_seq,
        responderEndSeq: row.responder_end_seq,
        messageCount: row.message_count,
        initiatorPreview: row.initiator_preview,
        responderPreview: row.responder_preview,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function parseTargetSessionIds(value: string | null): string[] | null {
    if (!value) {
        return null
    }
    const parsed = safeJsonParse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
        ? parsed
        : null
}

function toStoredGroupMessage(row: DbGroupMessageRow): StoredGroupMessage {
    return {
        id: row.id,
        groupId: row.group_id,
        namespace: row.namespace,
        seq: row.seq,
        type: row.type,
        traceId: row.trace_id,
        taskId: row.task_id,
        source: row.source,
        actorSessionId: row.actor_session_id,
        actorName: row.actor_name,
        targetSessionIds: parseTargetSessionIds(row.target_session_ids),
        quotedMessageId: row.quoted_message_id,
        payload: safeJsonParse(row.payload),
        createdAt: row.created_at
    }
}

function normalizePreviewText(text: string): string | null {
    const normalizedNewlines = text.replace(/\r\n?/g, '\n')
    const normalized = normalizedNewlines
        .replace(/^(?:[ \t]*\n)+/, '')
        .replace(/(?:\n[ \t]*)+$/, '')
    if (!normalized.trim()) {
        return null
    }
    if (normalized.length <= PREVIEW_TEXT_MAX_LENGTH) {
        return normalized
    }
    return `${normalized.slice(0, PREVIEW_TEXT_MAX_LENGTH - 1)}…`
}

function trimTail(text: string): string {
    if (text.length <= PREVIEW_TEXT_MAX_LENGTH) {
        return text
    }
    return `…${text.slice(Math.max(0, text.length - (PREVIEW_TEXT_MAX_LENGTH - 1)))}`
}

function extractSnippetFromPayload(payload: unknown): string | null {
    if (typeof payload === 'string') {
        return normalizePreviewText(payload)
    }
    if (!payload || typeof payload !== 'object') {
        return null
    }

    const record = payload as Record<string, unknown>
    const textCandidate = record.text
    if (typeof textCandidate === 'string') {
        return normalizePreviewText(textCandidate)
    }
    const commandCandidate = record.command
    if (typeof commandCandidate === 'string') {
        return normalizePreviewText(commandCandidate)
    }
    const messageCandidate = record.message
    if (typeof messageCandidate === 'string') {
        return normalizePreviewText(messageCandidate)
    }
    const statusCandidate = record.status
    if (typeof statusCandidate === 'string') {
        const reason = typeof record.reason === 'string'
            ? record.reason.trim()
            : ''
        const combined = reason.length > 0 ? `${statusCandidate} (${reason})` : statusCandidate
        return normalizePreviewText(combined)
    }

    try {
        return normalizePreviewText(JSON.stringify(payload))
    } catch {
        return null
    }
}

function buildRollingPreview(previousPreview: string | null, nextSnippet: string | null): string | null {
    const previous = previousPreview ? normalizePreviewText(previousPreview) : null
    const normalizedSnippet = nextSnippet ? normalizePreviewText(nextSnippet) : null
    if (!normalizedSnippet) {
        return previous
    }

    if (!previous) {
        return normalizedSnippet
    }

    if (previous === normalizedSnippet || previous.endsWith(`\n${normalizedSnippet}`)) {
        return previous
    }

    return trimTail(`${previous}\n${normalizedSnippet}`)
}

function isInitiatorMessage(message: StoredGroupMessage): boolean {
    return message.source.startsWith('user:')
}

function getOpenTurnRow(db: Database, groupId: string, namespace: string): DbGroupConversationTurnRow | null {
    const row = db.prepare(
        `SELECT *
         FROM group_conversation_turns
         WHERE group_id = ? AND namespace = ? AND status = 'open'
         ORDER BY turn_index DESC
         LIMIT 1`
    ).get(groupId, namespace) as DbGroupConversationTurnRow | undefined
    return row ?? null
}

function getNextTurnIndex(db: Database, groupId: string, namespace: string): number {
    const row = db.prepare(
        `SELECT COALESCE(MAX(turn_index), 0) + 1 AS next_turn_index
         FROM group_conversation_turns
         WHERE group_id = ? AND namespace = ?`
    ).get(groupId, namespace) as { next_turn_index: number } | undefined
    return row?.next_turn_index ?? 1
}

function getTurnById(
    db: Database,
    groupId: string,
    namespace: string,
    turnId: string
): StoredGroupConversationTurn | null {
    const row = db.prepare(
        `SELECT *
         FROM group_conversation_turns
         WHERE id = ? AND group_id = ? AND namespace = ?
         LIMIT 1`
    ).get(turnId, groupId, namespace) as DbGroupConversationTurnRow | undefined
    return row ? toStoredGroupConversationTurn(row) : null
}

function computeTurnSeqRange(turn: StoredGroupConversationTurn): { startSeq: number | null; endSeq: number | null } {
    const startSeq = turn.initiatorSeq ?? turn.responderStartSeq ?? turn.responderEndSeq
    const endSeq = turn.responderEndSeq ?? turn.initiatorSeq ?? turn.responderStartSeq
    return { startSeq, endSeq }
}

function insertTurn(db: Database, turn: MutableGroupTurn): void {
    db.prepare(`
        INSERT INTO group_conversation_turns (
            id,
            group_id,
            namespace,
            turn_index,
            status,
            initiator_message_id,
            initiator_seq,
            initiator_source,
            initiator_actor_session_id,
            responder_start_seq,
            responder_end_seq,
            message_count,
            initiator_preview,
            responder_preview,
            created_at,
            updated_at
        ) VALUES (
            @id,
            @group_id,
            @namespace,
            @turn_index,
            @status,
            @initiator_message_id,
            @initiator_seq,
            @initiator_source,
            @initiator_actor_session_id,
            @responder_start_seq,
            @responder_end_seq,
            @message_count,
            @initiator_preview,
            @responder_preview,
            @created_at,
            @updated_at
        )
    `).run({
        id: turn.id,
        group_id: turn.groupId,
        namespace: turn.namespace,
        turn_index: turn.turnIndex,
        status: turn.status,
        initiator_message_id: turn.initiatorMessageId,
        initiator_seq: turn.initiatorSeq,
        initiator_source: turn.initiatorSource,
        initiator_actor_session_id: turn.initiatorActorSessionId,
        responder_start_seq: turn.responderStartSeq,
        responder_end_seq: turn.responderEndSeq,
        message_count: turn.messageCount,
        initiator_preview: turn.initiatorPreview,
        responder_preview: turn.responderPreview,
        created_at: turn.createdAt,
        updated_at: turn.updatedAt
    })
}

export function createGroupConversationTurnsSchema(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS group_conversation_turns (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            namespace TEXT NOT NULL DEFAULT 'default',
            turn_index INTEGER NOT NULL,
            status TEXT NOT NULL,
            initiator_message_id TEXT,
            initiator_seq INTEGER,
            initiator_source TEXT,
            initiator_actor_session_id TEXT,
            responder_start_seq INTEGER,
            responder_end_seq INTEGER,
            message_count INTEGER NOT NULL DEFAULT 0,
            initiator_preview TEXT,
            responder_preview TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (initiator_message_id) REFERENCES group_messages(id) ON DELETE SET NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_group_conversation_turns_group_turn_index
            ON group_conversation_turns(group_id, namespace, turn_index);
        CREATE INDEX IF NOT EXISTS idx_group_conversation_turns_group_updated
            ON group_conversation_turns(group_id, namespace, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_group_conversation_turns_group_status
            ON group_conversation_turns(group_id, namespace, status, turn_index DESC);
    `)
}

export function appendGroupMessageToConversationTurns(
    db: Database,
    message: StoredGroupMessage
): StoredGroupConversationTurn {
    const snippet = extractSnippetFromPayload(message.payload)
    const openTurn = getOpenTurnRow(db, message.groupId, message.namespace)
    const initiator = isInitiatorMessage(message)

    if (initiator) {
        if (openTurn) {
            db.prepare(
                `UPDATE group_conversation_turns
                 SET status = ?, updated_at = ?
                 WHERE id = ?`
            ).run('closed', Math.max(openTurn.updated_at, message.createdAt), openTurn.id)
        }

        const turnId = randomUUID()
        const nextTurnIndex = getNextTurnIndex(db, message.groupId, message.namespace)
        db.prepare(`
            INSERT INTO group_conversation_turns (
                id,
                group_id,
                namespace,
                turn_index,
                status,
                initiator_message_id,
                initiator_seq,
                initiator_source,
                initiator_actor_session_id,
                responder_start_seq,
                responder_end_seq,
                message_count,
                initiator_preview,
                responder_preview,
                created_at,
                updated_at
            ) VALUES (
                @id,
                @group_id,
                @namespace,
                @turn_index,
                'open',
                @initiator_message_id,
                @initiator_seq,
                @initiator_source,
                @initiator_actor_session_id,
                NULL,
                NULL,
                @message_count,
                @initiator_preview,
                NULL,
                @created_at,
                @updated_at
            )
        `).run({
            id: turnId,
            group_id: message.groupId,
            namespace: message.namespace,
            turn_index: nextTurnIndex,
            initiator_message_id: message.id,
            initiator_seq: message.seq,
            initiator_source: message.source,
            initiator_actor_session_id: message.actorSessionId,
            message_count: 1,
            initiator_preview: snippet,
            created_at: message.createdAt,
            updated_at: message.createdAt
        })

        const inserted = getTurnById(db, message.groupId, message.namespace, turnId)
        if (!inserted) {
            throw new Error('Failed to create group conversation turn for initiator message')
        }
        return inserted
    }

    if (openTurn) {
        const responderStartSeq = openTurn.responder_start_seq ?? message.seq
        const responderPreview = buildRollingPreview(openTurn.responder_preview, snippet)
        db.prepare(`
            UPDATE group_conversation_turns
            SET
                responder_start_seq = @responder_start_seq,
                responder_end_seq = @responder_end_seq,
                message_count = @message_count,
                responder_preview = @responder_preview,
                updated_at = @updated_at
            WHERE id = @id
        `).run({
            id: openTurn.id,
            responder_start_seq: responderStartSeq,
            responder_end_seq: message.seq,
            message_count: openTurn.message_count + 1,
            responder_preview: responderPreview,
            updated_at: message.createdAt
        })

        const updated = getTurnById(db, message.groupId, message.namespace, openTurn.id)
        if (!updated) {
            throw new Error('Failed to update group conversation turn for responder message')
        }
        return updated
    }

    const turnId = randomUUID()
    const nextTurnIndex = getNextTurnIndex(db, message.groupId, message.namespace)
    db.prepare(`
        INSERT INTO group_conversation_turns (
            id,
            group_id,
            namespace,
            turn_index,
            status,
            initiator_message_id,
            initiator_seq,
            initiator_source,
            initiator_actor_session_id,
            responder_start_seq,
            responder_end_seq,
            message_count,
            initiator_preview,
            responder_preview,
            created_at,
            updated_at
        ) VALUES (
            @id,
            @group_id,
            @namespace,
            @turn_index,
            'open',
            NULL,
            NULL,
            NULL,
            NULL,
            @responder_start_seq,
            @responder_end_seq,
            @message_count,
            NULL,
            @responder_preview,
            @created_at,
            @updated_at
        )
    `).run({
        id: turnId,
        group_id: message.groupId,
        namespace: message.namespace,
        turn_index: nextTurnIndex,
        responder_start_seq: message.seq,
        responder_end_seq: message.seq,
        message_count: 1,
        responder_preview: snippet,
        created_at: message.createdAt,
        updated_at: message.createdAt
    })

    const inserted = getTurnById(db, message.groupId, message.namespace, turnId)
    if (!inserted) {
        throw new Error('Failed to create group conversation turn for responder message')
    }
    return inserted
}

export function getGroupConversationTurns(
    db: Database,
    groupId: string,
    namespace: string,
    limit: number = 200,
    beforeTurnIndex?: number
): StoredGroupConversationTurn[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
    const rows = (beforeTurnIndex !== undefined && beforeTurnIndex !== null && Number.isFinite(beforeTurnIndex))
        ? db.prepare(
            `SELECT *
             FROM group_conversation_turns
             WHERE group_id = ? AND namespace = ? AND turn_index < ?
             ORDER BY turn_index DESC
             LIMIT ?`
        ).all(groupId, namespace, beforeTurnIndex, safeLimit) as DbGroupConversationTurnRow[]
        : db.prepare(
            `SELECT *
             FROM group_conversation_turns
             WHERE group_id = ? AND namespace = ?
             ORDER BY turn_index DESC
             LIMIT ?`
        ).all(groupId, namespace, safeLimit) as DbGroupConversationTurnRow[]

    return rows.reverse().map(toStoredGroupConversationTurn)
}

export function getGroupConversationTurnById(
    db: Database,
    groupId: string,
    namespace: string,
    turnId: string
): StoredGroupConversationTurn | null {
    const row = db.prepare(
        `SELECT *
         FROM group_conversation_turns
         WHERE group_id = ? AND namespace = ? AND id = ?
         LIMIT 1`
    ).get(groupId, namespace, turnId) as DbGroupConversationTurnRow | undefined
    return row ? toStoredGroupConversationTurn(row) : null
}

export function getGroupConversationTurnMessagesPage(
    db: Database,
    groupId: string,
    namespace: string,
    turnId: string,
    options: { limit: number; beforeSeq: number | null }
): {
    turn: StoredGroupConversationTurn
    messages: StoredGroupMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
        startSeq: number | null
        endSeq: number | null
    }
} | null {
    const turn = getGroupConversationTurnById(db, groupId, namespace, turnId)
    if (!turn) {
        return null
    }

    const safeLimit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 200
    const safeBeforeSeq = options.beforeSeq !== null && Number.isFinite(options.beforeSeq)
        ? options.beforeSeq
        : null
    const { startSeq, endSeq } = computeTurnSeqRange(turn)

    if (startSeq === null || endSeq === null) {
        return {
            turn,
            messages: [],
            page: {
                limit: safeLimit,
                beforeSeq: safeBeforeSeq,
                nextBeforeSeq: null,
                hasMore: false,
                startSeq,
                endSeq
            }
        }
    }

    const rows = safeBeforeSeq !== null
        ? db.prepare(
            `SELECT *
             FROM group_messages
             WHERE group_id = ? AND namespace = ? AND seq >= ? AND seq <= ? AND seq < ?
             ORDER BY seq DESC
             LIMIT ?`
        ).all(groupId, namespace, startSeq, endSeq, safeBeforeSeq, safeLimit) as DbGroupMessageRow[]
        : db.prepare(
            `SELECT *
             FROM group_messages
             WHERE group_id = ? AND namespace = ? AND seq >= ? AND seq <= ?
             ORDER BY seq DESC
             LIMIT ?`
        ).all(groupId, namespace, startSeq, endSeq, safeLimit) as DbGroupMessageRow[]

    const messages = rows.reverse().map(toStoredGroupMessage)

    let oldestSeq: number | null = null
    for (const message of messages) {
        if (oldestSeq === null || message.seq < oldestSeq) {
            oldestSeq = message.seq
        }
    }

    const nextBeforeSeq = oldestSeq
    const hasMore = nextBeforeSeq !== null && nextBeforeSeq > startSeq

    return {
        turn,
        messages,
        page: {
            limit: safeLimit,
            beforeSeq: safeBeforeSeq,
            nextBeforeSeq,
            hasMore,
            startSeq,
            endSeq
        }
    }
}

export function rebuildGroupConversationTurns(
    db: Database,
    groupId: string,
    namespace: string
): number {
    const rows = db.prepare(
        `SELECT *
         FROM group_messages
         WHERE group_id = ? AND namespace = ?
         ORDER BY seq ASC`
    ).all(groupId, namespace) as DbGroupMessageRow[]

    db.prepare(
        'DELETE FROM group_conversation_turns WHERE group_id = ? AND namespace = ?'
    ).run(groupId, namespace)

    if (rows.length === 0) {
        return 0
    }

    const turns: MutableGroupTurn[] = []
    let openTurn: MutableGroupTurn | null = null
    let nextTurnIndex = 1

    for (const row of rows) {
        const message = toStoredGroupMessage(row)
        const snippet = extractSnippetFromPayload(message.payload)
        const initiator = isInitiatorMessage(message)

        if (initiator) {
            if (openTurn) {
                openTurn.status = 'closed'
                openTurn.updatedAt = Math.max(openTurn.updatedAt, message.createdAt)
            }

            const nextTurn: MutableGroupTurn = {
                id: randomUUID(),
                groupId,
                namespace,
                turnIndex: nextTurnIndex,
                status: 'open',
                initiatorMessageId: message.id,
                initiatorSeq: message.seq,
                initiatorSource: message.source,
                initiatorActorSessionId: message.actorSessionId,
                responderStartSeq: null,
                responderEndSeq: null,
                messageCount: 1,
                initiatorPreview: snippet,
                responderPreview: null,
                createdAt: message.createdAt,
                updatedAt: message.createdAt
            }
            turns.push(nextTurn)
            openTurn = nextTurn
            nextTurnIndex += 1
            continue
        }

        if (!openTurn) {
            const nextTurn: MutableGroupTurn = {
                id: randomUUID(),
                groupId,
                namespace,
                turnIndex: nextTurnIndex,
                status: 'open',
                initiatorMessageId: null,
                initiatorSeq: null,
                initiatorSource: null,
                initiatorActorSessionId: null,
                responderStartSeq: message.seq,
                responderEndSeq: message.seq,
                messageCount: 1,
                initiatorPreview: null,
                responderPreview: snippet,
                createdAt: message.createdAt,
                updatedAt: message.createdAt
            }
            turns.push(nextTurn)
            openTurn = nextTurn
            nextTurnIndex += 1
            continue
        }

        openTurn.messageCount += 1
        if (openTurn.responderStartSeq === null) {
            openTurn.responderStartSeq = message.seq
        }
        openTurn.responderEndSeq = message.seq
        openTurn.responderPreview = buildRollingPreview(openTurn.responderPreview, snippet)
        openTurn.updatedAt = message.createdAt
    }

    for (const turn of turns) {
        insertTurn(db, turn)
    }
    return turns.length
}

export function rebuildAllGroupConversationTurns(db: Database): number {
    const rows = db.prepare(
        'SELECT id, namespace FROM groups ORDER BY created_at ASC'
    ).all() as Array<{ id: string; namespace: string }>
    let total = 0
    for (const row of rows) {
        total += rebuildGroupConversationTurns(db, row.id, row.namespace)
    }
    return total
}
