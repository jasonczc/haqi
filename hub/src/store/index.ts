import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'
import { UserStore } from './userStore'
import { GroupStore } from './groupStore'

export type {
    PreviewUrlHistoryEntry,
    StoredGroup,
    StoredGroupMember,
    StoredGroupMessage,
    StoredGroupNote,
    StoredGroupTask,
    StoredMachine,
    StoredMessage,
    StoredPushSubscription,
    StoredSession,
    StoredUser,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'
export { UserStore } from './userStore'
export { GroupStore } from './groupStore'

const SCHEMA_VERSION: number = 4
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'users',
    'push_subscriptions',
    'preview_url_history',
    'groups',
    'group_members',
    'group_messages',
    'group_tasks',
    'group_notes'
] as const

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly users: UserStore
    readonly push: PushStore
    readonly groups: GroupStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.users = new UserStore(this.db)
        this.push = new PushStore(this.db)
        this.groups = new GroupStore(this.db)
    }

    getDatabasePath(): string {
        return this.dbPath
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                this.migrateLegacySchemaIfNeeded()
                this.createSchema()
                this.setUserVersion(SCHEMA_VERSION)
                return
            }

            this.createSchema()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === 1 && SCHEMA_VERSION >= 2) {
            this.migrateFromV1ToV2()
            this.setUserVersion(2)
            this.initSchema()
            return
        }

        if (currentVersion === 2 && SCHEMA_VERSION >= 3) {
            this.migrateFromV2ToV3()
            this.setUserVersion(3)
            this.initSchema()
            return
        }

        if (currentVersion === 3 && SCHEMA_VERSION >= 4) {
            this.migrateFromV3ToV4()
            this.setUserVersion(4)
            return
        }

        if (currentVersion !== SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        this.ensureRequiredTablesPresent()
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                namespace TEXT NOT NULL DEFAULT 'default',
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                preview_url TEXT,
                todos TEXT,
                todos_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                runner_state TEXT,
                runner_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
            CREATE INDEX IF NOT EXISTS idx_users_platform_namespace ON users(platform, namespace);

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_namespace ON push_subscriptions(namespace);

            CREATE TABLE IF NOT EXISTS preview_url_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                url TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                UNIQUE(namespace, url)
            );
            CREATE INDEX IF NOT EXISTS idx_preview_url_history_namespace_last_used
                ON preview_url_history(namespace, last_used_at DESC);

            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                name TEXT NOT NULL,
                description TEXT,
                note_session_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_groups_namespace ON groups(namespace);

            CREATE TABLE IF NOT EXISTS group_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                member_type TEXT NOT NULL,
                session_id TEXT,
                user_id INTEGER,
                role TEXT NOT NULL DEFAULT 'member',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
            CREATE INDEX IF NOT EXISTS idx_group_members_namespace ON group_members(namespace);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_dedupe
                ON group_members(group_id, member_type, session_id, user_id);

            CREATE TABLE IF NOT EXISTS group_messages (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                seq INTEGER NOT NULL,
                type TEXT NOT NULL,
                trace_id TEXT,
                task_id TEXT,
                source TEXT NOT NULL,
                actor_session_id TEXT,
                actor_name TEXT,
                target_session_ids TEXT,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_group_messages_group_seq
                ON group_messages(group_id, seq);
            CREATE INDEX IF NOT EXISTS idx_group_messages_namespace_created
                ON group_messages(namespace, created_at DESC);

            CREATE TABLE IF NOT EXISTS group_tasks (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                trace_id TEXT NOT NULL,
                source TEXT NOT NULL,
                target_session_id TEXT NOT NULL,
                command TEXT NOT NULL,
                status TEXT NOT NULL,
                dedupe_key TEXT,
                expires_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER,
                error TEXT,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (target_session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_group_tasks_group_status
                ON group_tasks(group_id, status);
            CREATE INDEX IF NOT EXISTS idx_group_tasks_namespace_created
                ON group_tasks(namespace, created_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_group_tasks_dedupe_key
                ON group_tasks(group_id, dedupe_key)
                WHERE dedupe_key IS NOT NULL;

            CREATE TABLE IF NOT EXISTS group_notes (
                group_id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                content TEXT NOT NULL DEFAULT '',
                version INTEGER NOT NULL DEFAULT 1,
                updated_by TEXT,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
                );
            CREATE INDEX IF NOT EXISTS idx_group_notes_namespace ON group_notes(namespace);
        `)
    }

    private migrateLegacySchemaIfNeeded(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            return
        }

        const hasDaemon = columns.has('daemon_state') || columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') || columns.has('runner_state_version')

        if (hasDaemon && hasRunner) {
            throw new Error('SQLite schema has both daemon_state and runner_state columns in machines; manual cleanup required.')
        }

        if (hasDaemon && !hasRunner) {
            this.migrateFromV1ToV2()
        }
    }

    private migrateFromV1ToV2(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            throw new Error('SQLite schema missing machines table for v1 to v2 migration.')
        }

        const hasDaemon = columns.has('daemon_state') && columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') && columns.has('runner_state_version')

        if (hasRunner && !hasDaemon) {
            return
        }

        if (!hasDaemon) {
            throw new Error('SQLite schema missing daemon_state columns for v1 to v2 migration.')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state TO runner_state')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state_version TO runner_state_version')
            this.db.exec('COMMIT')
            return
        } catch (error) {
            this.db.exec('ROLLBACK')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec(`
                CREATE TABLE machines_new (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata TEXT,
                    metadata_version INTEGER DEFAULT 1,
                    runner_state TEXT,
                    runner_state_version INTEGER DEFAULT 1,
                    active INTEGER DEFAULT 0,
                    active_at INTEGER,
                    seq INTEGER DEFAULT 0
                );
            `)
            this.db.exec(`
                INSERT INTO machines_new (
                    id, namespace, created_at, updated_at,
                    metadata, metadata_version,
                    runner_state, runner_state_version,
                    active, active_at, seq
                )
                SELECT id, namespace, created_at, updated_at,
                       metadata, metadata_version,
                       daemon_state, daemon_state_version,
                       active, active_at, seq
                FROM machines;
            `)
            this.db.exec('DROP TABLE machines')
            this.db.exec('ALTER TABLE machines_new RENAME TO machines')
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace)')
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v1->v2 failed: ${message}`)
        }
    }

    private migrateFromV2ToV3(): void {
        return
    }

    private migrateFromV3ToV4(): void {
        const sessionColumns = this.getSessionColumnNames()
        try {
            this.db.exec('BEGIN')

            if (!sessionColumns.has('preview_url')) {
                this.db.exec('ALTER TABLE sessions ADD COLUMN preview_url TEXT')
            }

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS preview_url_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    namespace TEXT NOT NULL,
                    url TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_used_at INTEGER NOT NULL,
                    UNIQUE(namespace, url)
                );
            `)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_preview_url_history_namespace_last_used
                ON preview_url_history(namespace, last_used_at DESC)
            `)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS groups (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    name TEXT NOT NULL,
                    description TEXT,
                    note_session_id TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_groups_namespace ON groups(namespace);

                CREATE TABLE IF NOT EXISTS group_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    member_type TEXT NOT NULL,
                    session_id TEXT,
                    user_id INTEGER,
                    role TEXT NOT NULL DEFAULT 'member',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
                CREATE INDEX IF NOT EXISTS idx_group_members_namespace ON group_members(namespace);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_dedupe
                    ON group_members(group_id, member_type, session_id, user_id);

                CREATE TABLE IF NOT EXISTS group_messages (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    seq INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    trace_id TEXT,
                    task_id TEXT,
                    source TEXT NOT NULL,
                    actor_session_id TEXT,
                    actor_name TEXT,
                    target_session_ids TEXT,
                    payload TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_group_messages_group_seq
                    ON group_messages(group_id, seq);
                CREATE INDEX IF NOT EXISTS idx_group_messages_namespace_created
                    ON group_messages(namespace, created_at DESC);

                CREATE TABLE IF NOT EXISTS group_tasks (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    trace_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    target_session_id TEXT NOT NULL,
                    command TEXT NOT NULL,
                    status TEXT NOT NULL,
                    dedupe_key TEXT,
                    expires_at INTEGER,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    started_at INTEGER,
                    completed_at INTEGER,
                    error TEXT,
                    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                    FOREIGN KEY (target_session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_group_tasks_group_status
                    ON group_tasks(group_id, status);
                CREATE INDEX IF NOT EXISTS idx_group_tasks_namespace_created
                    ON group_tasks(namespace, created_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_group_tasks_dedupe_key
                    ON group_tasks(group_id, dedupe_key)
                    WHERE dedupe_key IS NOT NULL;

                CREATE TABLE IF NOT EXISTS group_notes (
                    group_id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    content TEXT NOT NULL DEFAULT '',
                    version INTEGER NOT NULL DEFAULT 1,
                    updated_by TEXT,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_group_notes_namespace ON group_notes(namespace);
            `)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v3->v4 failed: ${message}`)
        }
    }

    private getMachineColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(machines)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getSessionColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private ensureRequiredTablesPresent(): void {
        const missingBeforeRepair = this.getMissingRequiredTables()
        if (missingBeforeRepair.length === 0) {
            return
        }

        // Self-heal partial upgrades where user_version was bumped but
        // table creation did not complete (e.g. interrupted startup).
        this.createSchema()

        const missingAfterRepair = this.getMissingRequiredTables()
        if (missingAfterRepair.length === 0) {
            return
        }

        throw new Error(
            `SQLite schema is missing required tables (${missingAfterRepair.join(', ')}). ` +
            'Automatic schema repair was attempted and failed. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }

    private getMissingRequiredTables(): string[] {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        return REQUIRED_TABLES.filter((table) => !existing.has(table))
    }

    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = (this.dbPath === ':memory:' || this.dbPath.startsWith('file::memory:'))
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            'This build does not run compatibility migrations. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }
}
