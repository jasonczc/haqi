import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'

const GROUP_TABLES = [
    'groups',
    'group_members',
    'group_messages',
    'group_tasks',
    'group_notes'
] as const

function closeStore(store: Store): void {
    const db = (store as unknown as { db: Database }).db
    db.close()
}

describe('Store schema repair', () => {
    it('auto-repairs missing group tables when user_version is already current', () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-store-repair-'))
        const dbPath = join(dir, 'hapi.db')

        const seeded = new Store(dbPath)
        const seededDb = (seeded as unknown as { db: Database }).db
        seededDb.exec(`
            DROP TABLE IF EXISTS group_notes;
            DROP TABLE IF EXISTS group_tasks;
            DROP TABLE IF EXISTS group_messages;
            DROP TABLE IF EXISTS group_members;
            DROP TABLE IF EXISTS groups;
            PRAGMA user_version = 4;
        `)
        closeStore(seeded)

        const repaired = new Store(dbPath)
        const repairedDb = (repaired as unknown as { db: Database }).db

        const placeholders = GROUP_TABLES.map(() => '?').join(', ')
        const rows = repairedDb.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...GROUP_TABLES) as Array<{ name: string }>
        const tableSet = new Set(rows.map((row) => row.name))
        for (const table of GROUP_TABLES) {
            expect(tableSet.has(table)).toBe(true)
        }

        const group = repaired.groups.createGroup({
            namespace: 'default',
            name: 'Schema Repair Smoke Test'
        })
        expect(group.name).toBe('Schema Repair Smoke Test')
        const note = repaired.groups.getGroupNote(group.id, 'default')
        expect(note).not.toBeNull()

        closeStore(repaired)
        rmSync(dir, { recursive: true, force: true })
    })
})
