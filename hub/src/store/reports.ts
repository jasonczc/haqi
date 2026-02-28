import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type {
    StoredReport,
    StoredReportAsset,
    StoredReportShare
} from './types'
import { safeJsonParse } from './json'

type DbReportRow = {
    id: string
    namespace: string
    session_id: string | null
    task_id: string | null
    title: string
    status: string
    markdown: string
    metadata: string | null
    created_at: number
    updated_at: number
}

type DbReportAssetRow = {
    id: string
    report_id: string
    namespace: string
    file_name: string
    storage_key: string
    mime_type: string
    size: number
    caption: string | null
    created_at: number
}

type DbReportShareRow = {
    id: string
    report_id: string
    namespace: string
    token: string
    created_by: string | null
    created_at: number
    expires_at: number | null
    revoked_at: number | null
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toStoredReport(row: DbReportRow): StoredReport {
    return {
        id: row.id,
        namespace: row.namespace,
        sessionId: row.session_id,
        taskId: row.task_id,
        title: row.title,
        status: row.status,
        markdown: row.markdown,
        metadata: row.metadata ? safeJsonParse(row.metadata) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredReportAsset(row: DbReportAssetRow): StoredReportAsset {
    return {
        id: row.id,
        reportId: row.report_id,
        namespace: row.namespace,
        fileName: row.file_name,
        storageKey: row.storage_key,
        mimeType: row.mime_type,
        size: row.size,
        caption: row.caption,
        createdAt: row.created_at
    }
}

function toStoredReportShare(row: DbReportShareRow): StoredReportShare {
    return {
        id: row.id,
        reportId: row.report_id,
        namespace: row.namespace,
        token: row.token,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at
    }
}

export function createReport(
    db: Database,
    options: {
        namespace: string
        sessionId?: string | null
        taskId?: string | null
        title?: string | null
        status?: string | null
        markdown?: string | null
        metadata?: unknown
    }
): StoredReport {
    const now = Date.now()
    const id = randomUUID()
    const title = normalizeNonEmptyString(options.title) ?? `Report ${id.slice(0, 8)}`
    const status = normalizeNonEmptyString(options.status) ?? 'unknown'
    const markdown = options.markdown ?? ''

    db.prepare(`
        INSERT INTO reports (
            id, namespace, session_id, task_id,
            title, status, markdown, metadata,
            created_at, updated_at
        ) VALUES (
            @id, @namespace, @session_id, @task_id,
            @title, @status, @markdown, @metadata,
            @created_at, @updated_at
        )
    `).run({
        id,
        namespace: options.namespace,
        session_id: normalizeNonEmptyString(options.sessionId),
        task_id: normalizeNonEmptyString(options.taskId),
        title,
        status,
        markdown,
        metadata: options.metadata === undefined ? null : JSON.stringify(options.metadata),
        created_at: now,
        updated_at: now
    })

    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as DbReportRow | undefined
    if (!row) {
        throw new Error('Failed to create report')
    }
    return toStoredReport(row)
}

export function getReport(db: Database, id: string): StoredReport | null {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as DbReportRow | undefined
    return row ? toStoredReport(row) : null
}

export function getReportByNamespace(db: Database, id: string, namespace: string): StoredReport | null {
    const row = db.prepare('SELECT * FROM reports WHERE id = ? AND namespace = ?').get(id, namespace) as DbReportRow | undefined
    return row ? toStoredReport(row) : null
}

export function listReportsByNamespace(
    db: Database,
    namespace: string,
    options?: {
        limit?: number
        sessionId?: string | null
    }
): StoredReport[] {
    const limit = Math.max(1, Math.min(200, options?.limit ?? 50))
    const sessionId = normalizeNonEmptyString(options?.sessionId)

    if (sessionId) {
        const rows = db.prepare(
            'SELECT * FROM reports WHERE namespace = ? AND session_id = ? ORDER BY updated_at DESC LIMIT ?'
        ).all(namespace, sessionId, limit) as DbReportRow[]
        return rows.map(toStoredReport)
    }

    const rows = db.prepare(
        'SELECT * FROM reports WHERE namespace = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(namespace, limit) as DbReportRow[]
    return rows.map(toStoredReport)
}

export function updateReport(
    db: Database,
    options: {
        id: string
        namespace: string
        title?: string | null
        status?: string | null
        markdown?: string | null
        metadata?: unknown
        taskId?: string | null
    }
): StoredReport | null {
    const existing = getReportByNamespace(db, options.id, options.namespace)
    if (!existing) {
        return null
    }

    const nextTitle = options.title !== undefined
        ? (normalizeNonEmptyString(options.title) ?? existing.title)
        : existing.title
    const nextStatus = options.status !== undefined
        ? (normalizeNonEmptyString(options.status) ?? existing.status)
        : existing.status
    const nextMarkdown = options.markdown !== undefined
        ? (options.markdown ?? '')
        : existing.markdown
    const nextTaskId = options.taskId !== undefined
        ? normalizeNonEmptyString(options.taskId)
        : existing.taskId
    const nextMetadata = options.metadata !== undefined
        ? options.metadata
        : existing.metadata

    db.prepare(`
        UPDATE reports
        SET title = @title,
            status = @status,
            markdown = @markdown,
            task_id = @task_id,
            metadata = @metadata,
            updated_at = @updated_at
        WHERE id = @id AND namespace = @namespace
    `).run({
        id: options.id,
        namespace: options.namespace,
        title: nextTitle,
        status: nextStatus,
        markdown: nextMarkdown,
        task_id: nextTaskId,
        metadata: nextMetadata === undefined ? null : JSON.stringify(nextMetadata),
        updated_at: Date.now()
    })

    return getReportByNamespace(db, options.id, options.namespace)
}

export function createReportAsset(
    db: Database,
    options: {
        reportId: string
        namespace: string
        fileName: string
        storageKey: string
        mimeType: string
        size: number
        caption?: string | null
    }
): StoredReportAsset {
    const id = randomUUID()
    const now = Date.now()

    db.prepare(`
        INSERT INTO report_assets (
            id, report_id, namespace, file_name,
            storage_key, mime_type, size, caption, created_at
        ) VALUES (
            @id, @report_id, @namespace, @file_name,
            @storage_key, @mime_type, @size, @caption, @created_at
        )
    `).run({
        id,
        report_id: options.reportId,
        namespace: options.namespace,
        file_name: options.fileName,
        storage_key: options.storageKey,
        mime_type: options.mimeType,
        size: Math.max(0, Math.floor(options.size)),
        caption: normalizeNonEmptyString(options.caption),
        created_at: now
    })

    const row = db.prepare('SELECT * FROM report_assets WHERE id = ?').get(id) as DbReportAssetRow | undefined
    if (!row) {
        throw new Error('Failed to create report asset')
    }
    return toStoredReportAsset(row)
}

export function listReportAssetsByNamespace(
    db: Database,
    reportId: string,
    namespace: string
): StoredReportAsset[] {
    const rows = db.prepare(
        'SELECT * FROM report_assets WHERE report_id = ? AND namespace = ? ORDER BY created_at ASC'
    ).all(reportId, namespace) as DbReportAssetRow[]
    return rows.map(toStoredReportAsset)
}

export function listReportAssets(db: Database, reportId: string): StoredReportAsset[] {
    const rows = db.prepare(
        'SELECT * FROM report_assets WHERE report_id = ? ORDER BY created_at ASC'
    ).all(reportId) as DbReportAssetRow[]
    return rows.map(toStoredReportAsset)
}

export function getReportAssetByNamespace(
    db: Database,
    reportId: string,
    assetId: string,
    namespace: string
): StoredReportAsset | null {
    const row = db.prepare(
        'SELECT * FROM report_assets WHERE id = ? AND report_id = ? AND namespace = ? LIMIT 1'
    ).get(assetId, reportId, namespace) as DbReportAssetRow | undefined
    return row ? toStoredReportAsset(row) : null
}

export function getReportAsset(db: Database, reportId: string, assetId: string): StoredReportAsset | null {
    const row = db.prepare(
        'SELECT * FROM report_assets WHERE id = ? AND report_id = ? LIMIT 1'
    ).get(assetId, reportId) as DbReportAssetRow | undefined
    return row ? toStoredReportAsset(row) : null
}

export function createReportShare(
    db: Database,
    options: {
        reportId: string
        namespace: string
        token: string
        createdBy?: string | null
        expiresAt?: number | null
    }
): StoredReportShare {
    const id = randomUUID()
    const now = Date.now()

    db.prepare(`
        INSERT INTO report_shares (
            id, report_id, namespace, token,
            created_by, created_at, expires_at, revoked_at
        ) VALUES (
            @id, @report_id, @namespace, @token,
            @created_by, @created_at, @expires_at, NULL
        )
    `).run({
        id,
        report_id: options.reportId,
        namespace: options.namespace,
        token: options.token,
        created_by: normalizeNonEmptyString(options.createdBy),
        created_at: now,
        expires_at: options.expiresAt ?? null
    })

    const row = db.prepare('SELECT * FROM report_shares WHERE id = ?').get(id) as DbReportShareRow | undefined
    if (!row) {
        throw new Error('Failed to create report share')
    }
    return toStoredReportShare(row)
}

export function listReportSharesByNamespace(
    db: Database,
    reportId: string,
    namespace: string,
    options?: { includeRevoked?: boolean }
): StoredReportShare[] {
    if (options?.includeRevoked) {
        const rows = db.prepare(
            'SELECT * FROM report_shares WHERE report_id = ? AND namespace = ? ORDER BY created_at DESC'
        ).all(reportId, namespace) as DbReportShareRow[]
        return rows.map(toStoredReportShare)
    }

    const rows = db.prepare(
        'SELECT * FROM report_shares WHERE report_id = ? AND namespace = ? AND revoked_at IS NULL ORDER BY created_at DESC'
    ).all(reportId, namespace) as DbReportShareRow[]
    return rows.map(toStoredReportShare)
}

export function getReportShareByNamespace(
    db: Database,
    reportId: string,
    shareId: string,
    namespace: string
): StoredReportShare | null {
    const row = db.prepare(
        'SELECT * FROM report_shares WHERE id = ? AND report_id = ? AND namespace = ? LIMIT 1'
    ).get(shareId, reportId, namespace) as DbReportShareRow | undefined
    return row ? toStoredReportShare(row) : null
}

export function revokeReportShareByNamespace(
    db: Database,
    reportId: string,
    shareId: string,
    namespace: string
): StoredReportShare | null {
    const existing = getReportShareByNamespace(db, reportId, shareId, namespace)
    if (!existing) {
        return null
    }

    if (existing.revokedAt !== null) {
        return existing
    }

    db.prepare(`
        UPDATE report_shares
        SET revoked_at = @revoked_at
        WHERE id = @id AND report_id = @report_id AND namespace = @namespace
    `).run({
        id: shareId,
        report_id: reportId,
        namespace,
        revoked_at: Date.now()
    })

    return getReportShareByNamespace(db, reportId, shareId, namespace)
}

export function getReportShareByToken(db: Database, token: string): StoredReportShare | null {
    const row = db.prepare(
        'SELECT * FROM report_shares WHERE token = ? LIMIT 1'
    ).get(token) as DbReportShareRow | undefined
    return row ? toStoredReportShare(row) : null
}
