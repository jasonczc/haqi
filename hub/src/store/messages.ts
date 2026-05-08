import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type { StoredMessage } from './types'
import { safeJsonParse } from './json'
import { appendMessageToConversationTurns, rebuildSessionConversationTurns } from './turns'

type DbMessageRow = {
    id: string
    session_id: string
    content: string
    created_at: number
    seq: number
    local_id: string | null
}


type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getUserMessageText(content: unknown): string | null {
    if (!isRecord(content)) return null
    if (content.role !== 'user') return null
    const inner = content.content
    if (!isRecord(inner)) return null
    if (inner.type !== 'text') return null
    return typeof inner.text === 'string' ? inner.text : null
}

function getSentFrom(content: unknown): string | null {
    if (!isRecord(content)) return null
    const meta = content.meta
    if (!isRecord(meta)) return null
    return typeof meta.sentFrom === 'string' ? meta.sentFrom : null
}

function getAttachmentPaths(content: unknown): string[] {
    if (!isRecord(content)) return []
    if (content.role !== 'user') return []
    const inner = content.content
    if (!isRecord(inner) || !Array.isArray(inner.attachments)) return []

    const paths: string[] = []
    for (const item of inner.attachments) {
        if (isRecord(item) && typeof item.path === 'string' && item.path.length > 0) {
            paths.push(item.path)
        }
    }
    return paths
}

const HAPI_BLOBS_PATH_PATTERN = /@([^\s"'`<>()]*[/\\]hapi-blobs[/\\][^\s"'`<>()]+)/g

function extractHapiBlobReferences(text: string): string[] {
    return Array.from(text.matchAll(HAPI_BLOBS_PATH_PATTERN), (match) => match[1] ?? '')
        .filter((path) => path.length > 0)
}

function basename(path: string): string {
    return path.split(/[/\\]/).filter(Boolean).pop() ?? 'upload'
}

function sanitizeHapiBlobReferences(text: string): string {
    return text.replace(HAPI_BLOBS_PATH_PATTERN, (_match, path: string) => `@[${basename(path)}]`)
}

function withUserMessageText(content: unknown, text: string): unknown {
    if (!isRecord(content)) return content
    const inner = content.content
    if (!isRecord(inner)) return content
    return {
        ...content,
        content: {
            ...inner,
            text
        }
    }
}

function buildCopiedMessageRows(rows: DbMessageRow[]): Array<{ row: DbMessageRow; content: string }> {
    const canonicalAttachmentPaths = new Set<string>()
    for (const row of rows) {
        const parsed = safeJsonParse(row.content)
        for (const path of getAttachmentPaths(parsed)) {
            canonicalAttachmentPaths.add(path)
        }
    }

    const copied: Array<{ row: DbMessageRow; content: string }> = []
    for (const row of rows) {
        const parsed = safeJsonParse(row.content)
        const text = getUserMessageText(parsed)
        const hapiBlobRefs = text ? extractHapiBlobReferences(text) : []

        if (text && getSentFrom(parsed) === 'cli' && hapiBlobRefs.length > 0) {
            if (hapiBlobRefs.some((path) => canonicalAttachmentPaths.has(path))) {
                continue
            }

            copied.push({
                row,
                content: JSON.stringify(withUserMessageText(parsed, sanitizeHapiBlobReferences(text)))
            })
            continue
        }

        copied.push({ row, content: row.content })
    }

    return copied
}

function toStoredMessage(row: DbMessageRow): StoredMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        content: safeJsonParse(row.content),
        createdAt: row.created_at,
        seq: row.seq,
        localId: row.local_id
    }
}

export function addMessage(
    db: Database,
    sessionId: string,
    content: unknown,
    localId?: string
): StoredMessage {
    const now = Date.now()

    if (localId) {
        const existing = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND local_id = ? LIMIT 1'
        ).get(sessionId, localId) as DbMessageRow | undefined
        if (existing) {
            return toStoredMessage(existing)
        }
    }

    try {
        db.exec('BEGIN')

        const msgSeqRow = db.prepare(
            'SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM messages WHERE session_id = ?'
        ).get(sessionId) as { nextSeq: number }
        const msgSeq = msgSeqRow.nextSeq

        const id = randomUUID()
        const json = JSON.stringify(content)

        db.prepare(`
            INSERT INTO messages (
                id, session_id, content, created_at, seq, local_id
            ) VALUES (
                @id, @session_id, @content, @created_at, @seq, @local_id
            )
        `).run({
            id,
            session_id: sessionId,
            content: json,
            created_at: now,
            seq: msgSeq,
            local_id: localId ?? null
        })

        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessageRow | undefined
        if (!row) {
            throw new Error('Failed to create message')
        }

        const stored = toStoredMessage(row)
        appendMessageToConversationTurns(db, stored)

        db.exec('COMMIT')
        return stored
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}

export function getMessages(
    db: Database,
    sessionId: string,
    limit: number = 200,
    beforeSeq?: number
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200

    const rows = (beforeSeq !== undefined && beforeSeq !== null && Number.isFinite(beforeSeq))
        ? db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, beforeSeq, safeLimit) as DbMessageRow[]
        : db.prepare(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, safeLimit) as DbMessageRow[]

    return rows.reverse().map(toStoredMessage)
}

export function getMessagesAfter(
    db: Database,
    sessionId: string,
    afterSeq: number,
    limit: number = 200
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
    const safeAfterSeq = Number.isFinite(afterSeq) ? afterSeq : 0

    const rows = db.prepare(
        'SELECT * FROM messages WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
    ).all(sessionId, safeAfterSeq, safeLimit) as DbMessageRow[]

    return rows.map(toStoredMessage)
}

export function getMaxSeq(db: Database, sessionId: string): number {
    const row = db.prepare(
        'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM messages WHERE session_id = ?'
    ).get(sessionId) as { maxSeq: number } | undefined
    return row?.maxSeq ?? 0
}

export function mergeSessionMessages(
    db: Database,
    fromSessionId: string,
    toSessionId: string
): { moved: number; oldMaxSeq: number; newMaxSeq: number } {
    if (fromSessionId === toSessionId) {
        return { moved: 0, oldMaxSeq: 0, newMaxSeq: 0 }
    }

    const oldMaxSeq = getMaxSeq(db, fromSessionId)
    const newMaxSeq = getMaxSeq(db, toSessionId)

    try {
        db.exec('BEGIN')

        if (newMaxSeq > 0 && oldMaxSeq > 0) {
            db.prepare(
                'UPDATE messages SET seq = seq + ? WHERE session_id = ?'
            ).run(oldMaxSeq, toSessionId)
        }

        const collisions = db.prepare(`
            SELECT local_id FROM messages
            WHERE session_id = ? AND local_id IS NOT NULL
            INTERSECT
            SELECT local_id FROM messages
            WHERE session_id = ? AND local_id IS NOT NULL
        `).all(toSessionId, fromSessionId) as Array<{ local_id: string }>

        if (collisions.length > 0) {
            const localIds = collisions.map((row) => row.local_id)
            const placeholders = localIds.map(() => '?').join(', ')
            db.prepare(
                `UPDATE messages SET local_id = NULL WHERE session_id = ? AND local_id IN (${placeholders})`
            ).run(fromSessionId, ...localIds)
        }

        const result = db.prepare(
            'UPDATE messages SET session_id = ? WHERE session_id = ?'
        ).run(toSessionId, fromSessionId)

        rebuildSessionConversationTurns(db, fromSessionId)
        rebuildSessionConversationTurns(db, toSessionId)

        db.exec('COMMIT')
        return { moved: result.changes, oldMaxSeq, newMaxSeq }
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}

export function copySessionMessages(
    db: Database,
    fromSessionId: string,
    toSessionId: string
): { copied: number; oldMaxSeq: number; newMaxSeq: number } {
    if (fromSessionId === toSessionId) {
        return { copied: 0, oldMaxSeq: 0, newMaxSeq: getMaxSeq(db, toSessionId) }
    }

    const oldMaxSeq = getMaxSeq(db, fromSessionId)
    const newMaxSeq = getMaxSeq(db, toSessionId)

    if (oldMaxSeq <= 0) {
        return { copied: 0, oldMaxSeq, newMaxSeq }
    }

    try {
        db.exec('BEGIN')

        if (newMaxSeq > 0) {
            db.prepare(
                'UPDATE messages SET seq = seq + ? WHERE session_id = ?'
            ).run(oldMaxSeq, toSessionId)
        }

        const sourceRows = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC'
        ).all(fromSessionId) as DbMessageRow[]
        const copiedRows = buildCopiedMessageRows(sourceRows)
        const insert = db.prepare(`
            INSERT INTO messages (id, session_id, content, created_at, seq, local_id)
            VALUES (lower(hex(randomblob(16))), @session_id, @content, @created_at, @seq, NULL)
        `)

        for (const item of copiedRows) {
            insert.run({
                session_id: toSessionId,
                content: item.content,
                created_at: item.row.created_at,
                seq: item.row.seq
            })
        }

        rebuildSessionConversationTurns(db, toSessionId)

        db.exec('COMMIT')
        return { copied: copiedRows.length, oldMaxSeq, newMaxSeq }
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}
