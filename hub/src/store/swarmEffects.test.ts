import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'

function closeStore(store: Store): void {
    const db = (store as unknown as { db: Database }).db
    db.close()
}

describe('swarm effects schema', () => {
    it('runs v19 to v20 migration and creates swarm_effects table', () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-swarm-effects-'))
        const dbPath = join(dir, 'hapi.db')

        const seeded = new Store(dbPath)
        const seededDb = (seeded as unknown as { db: Database }).db
        seededDb.exec(`
            DROP TABLE IF EXISTS swarm_effects;
            PRAGMA user_version = 19;
        `)
        closeStore(seeded)

        const migrated = new Store(dbPath)
        const migratedDb = (migrated as unknown as { db: Database }).db
        const versionRow = migratedDb.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        expect(versionRow?.user_version).toBe(20)

        const row = migratedDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'swarm_effects'"
        ).get() as { name?: string } | undefined
        expect(row?.name).toBe('swarm_effects')

        closeStore(migrated)
        rmSync(dir, { recursive: true, force: true })
    })
})
