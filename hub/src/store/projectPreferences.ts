import type { Database } from 'bun:sqlite'

function normalizeDirectories(directories: string[]): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const directory of directories) {
        const trimmed = directory.trim()
        if (!trimmed || seen.has(trimmed)) {
            continue
        }
        seen.add(trimmed)
        normalized.push(trimmed)
    }
    return normalized
}

export function getProjectOfflineDirectories(
    db: Database,
    namespace: string,
    userId: number
): string[] {
    const rows = db.prepare(`
        SELECT directory
        FROM project_offline_preferences
        WHERE namespace = ? AND user_id = ?
        ORDER BY updated_at DESC, directory ASC
    `).all(namespace, userId) as Array<{ directory: string }>

    return rows.map((row) => row.directory)
}

export function replaceProjectOfflineDirectories(
    db: Database,
    namespace: string,
    userId: number,
    directories: string[]
): string[] {
    const normalized = normalizeDirectories(directories)
    const now = Date.now()
    const insertStmt = db.prepare(`
        INSERT INTO project_offline_preferences (
            namespace,
            user_id,
            directory,
            created_at,
            updated_at
        ) VALUES (
            @namespace,
            @user_id,
            @directory,
            @created_at,
            @updated_at
        )
    `)

    try {
        db.exec('BEGIN')
        db.prepare(`
            DELETE FROM project_offline_preferences
            WHERE namespace = ? AND user_id = ?
        `).run(namespace, userId)

        for (const directory of normalized) {
            insertStmt.run({
                namespace,
                user_id: userId,
                directory,
                created_at: now,
                updated_at: now
            })
        }

        db.exec('COMMIT')
        return normalized
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}
