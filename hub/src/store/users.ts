import type { Database } from 'bun:sqlite'

import type { StoredUser } from './types'

type DbUserRow = {
    id: number
    platform: string
    platform_user_id: string
    namespace: string
    created_at: number
}

function toStoredUser(row: DbUserRow): StoredUser {
    return {
        id: row.id,
        platform: row.platform,
        platformUserId: row.platform_user_id,
        namespace: row.namespace,
        createdAt: row.created_at
    }
}

export function getUser(db: Database, platform: string, platformUserId: string): StoredUser | null {
    const row = db.prepare(
        'SELECT * FROM users WHERE platform = ? AND platform_user_id = ? LIMIT 1'
    ).get(platform, platformUserId) as DbUserRow | undefined
    return row ? toStoredUser(row) : null
}

export function getUsersByPlatform(db: Database, platform: string): StoredUser[] {
    const rows = db.prepare(
        'SELECT * FROM users WHERE platform = ? ORDER BY created_at ASC'
    ).all(platform) as DbUserRow[]
    return rows.map(toStoredUser)
}

export function getUsersByPlatformAndNamespace(
    db: Database,
    platform: string,
    namespace: string
): StoredUser[] {
    const rows = db.prepare(
        'SELECT * FROM users WHERE platform = ? AND namespace = ? ORDER BY created_at ASC'
    ).all(platform, namespace) as DbUserRow[]
    return rows.map(toStoredUser)
}

export function addUser(
    db: Database,
    platform: string,
    platformUserId: string,
    namespace: string
): StoredUser {
    const now = Date.now()
    db.prepare(`
        INSERT OR IGNORE INTO users (
            platform, platform_user_id, namespace, created_at
        ) VALUES (
            @platform, @platform_user_id, @namespace, @created_at
        )
    `).run({
        platform,
        platform_user_id: platformUserId,
        namespace,
        created_at: now
    })

    const row = getUser(db, platform, platformUserId)
    if (!row) {
        throw new Error('Failed to create user')
    }
    return row
}

export function removeUser(db: Database, platform: string, platformUserId: string): boolean {
    const result = db.prepare(
        'DELETE FROM users WHERE platform = ? AND platform_user_id = ?'
    ).run(platform, platformUserId)
    return result.changes > 0
}

/**
 * Ensure a users row exists with the exact id the access-token flow hands
 * out as `ownerId` (from owner-id.json). Required so that any table with
 * `FOREIGN KEY (user_id) REFERENCES users(id)` — e.g. cloud_agent_preferences
 * — can accept writes from web requests authenticated with CLI_API_TOKEN.
 * Idempotent: INSERT OR IGNORE skips if the row already exists.
 */
export function ensureOwnerUser(db: Database, ownerId: number, namespace: string): void {
    db.prepare(`
        INSERT OR IGNORE INTO users (
            id, platform, platform_user_id, namespace, created_at
        ) VALUES (
            @id, 'access-token', @platform_user_id, @namespace, @created_at
        )
    `).run({
        id: ownerId,
        platform_user_id: `owner-${ownerId}`,
        namespace,
        created_at: Date.now()
    })
}
