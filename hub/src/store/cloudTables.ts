import type { Database } from 'bun:sqlite'

export function createCloudTablesSchema(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS cloud_spawn_requests (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            requested_machine_id TEXT,
            selected_machine_id TEXT,
            phase TEXT NOT NULL,
            request TEXT NOT NULL,
            workspace_id TEXT,
            session_id TEXT,
            reused_workspace INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_spawn_requests_namespace_updated
            ON cloud_spawn_requests(namespace, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cloud_spawn_requests_namespace_phase
            ON cloud_spawn_requests(namespace, phase);
        CREATE INDEX IF NOT EXISTS idx_cloud_spawn_requests_session
            ON cloud_spawn_requests(session_id);

        CREATE TABLE IF NOT EXISTS cloud_workspaces (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            machine_id TEXT,
            workspace_key TEXT,
            name TEXT,
            mode TEXT,
            status TEXT NOT NULL,
            source TEXT,
            path TEXT,
            environment_id TEXT,
            environment_version TEXT,
            environment TEXT,
            reused INTEGER NOT NULL DEFAULT 0,
            last_lease_id TEXT,
            last_used_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_workspaces_namespace_updated
            ON cloud_workspaces(namespace, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cloud_workspaces_namespace_status
            ON cloud_workspaces(namespace, status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_workspaces_namespace_key
            ON cloud_workspaces(namespace, workspace_key)
            WHERE workspace_key IS NOT NULL;

        CREATE TABLE IF NOT EXISTS cloud_workspace_leases (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            workspace_id TEXT NOT NULL,
            request_id TEXT,
            machine_id TEXT NOT NULL,
            session_id TEXT,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER,
            released_at INTEGER,
            FOREIGN KEY (workspace_id) REFERENCES cloud_workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY (request_id) REFERENCES cloud_spawn_requests(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_workspace_leases_workspace
            ON cloud_workspace_leases(workspace_id, status);
        CREATE INDEX IF NOT EXISTS idx_cloud_workspace_leases_namespace_updated
            ON cloud_workspace_leases(namespace, updated_at DESC);

        CREATE TABLE IF NOT EXISTS cloud_secrets (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT,
            mount_as TEXT,
            env_name TEXT,
            file_path TEXT,
            adapter TEXT,
            encrypted_value TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_accessed_at INTEGER,
            UNIQUE(namespace, name)
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_secrets_namespace_updated
            ON cloud_secrets(namespace, updated_at DESC);

        CREATE TABLE IF NOT EXISTS cloud_secret_access_events (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            secret_id TEXT NOT NULL,
            secret_name TEXT NOT NULL,
            request_id TEXT,
            machine_id TEXT,
            session_id TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (secret_id) REFERENCES cloud_secrets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_secret_access_events_secret
            ON cloud_secret_access_events(secret_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cloud_secret_access_events_namespace_created
            ON cloud_secret_access_events(namespace, created_at DESC);

        CREATE TABLE IF NOT EXISTS cloud_worker_enrollment_tokens (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            label TEXT,
            machine_id TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            token_preview TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            revoked_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_worker_enrollment_tokens_namespace
            ON cloud_worker_enrollment_tokens(namespace, created_at DESC);

        CREATE TABLE IF NOT EXISTS cloud_worker_sessions (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            machine_id TEXT,
            enrollment_token_id TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            token_preview TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER,
            revoked_at INTEGER,
            last_used_at INTEGER,
            FOREIGN KEY (enrollment_token_id) REFERENCES cloud_worker_enrollment_tokens(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_worker_sessions_namespace
            ON cloud_worker_sessions(namespace, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cloud_worker_sessions_machine
            ON cloud_worker_sessions(machine_id, updated_at DESC);
    `)
}
