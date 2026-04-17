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
            repo_volume_path TEXT,
            desktop_state_volume_path TEXT,
            environment_id TEXT,
            environment_version TEXT,
            environment TEXT,
            checkpoint_id TEXT,
            workspace_branch TEXT,
            repo_status TEXT,
            desktop_state TEXT,
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

        CREATE TABLE IF NOT EXISTS cloud_checkpoints (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            name TEXT NOT NULL,
            repo_url TEXT,
            parent_checkpoint_id TEXT,
            base_image TEXT NOT NULL,
            docker_image TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            workspace_path TEXT,
            environment_json TEXT,
            created_by_session TEXT,
            status TEXT NOT NULL DEFAULT 'creating',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_checkpoints_namespace_created
            ON cloud_checkpoints(namespace, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cloud_checkpoints_parent
            ON cloud_checkpoints(parent_checkpoint_id);

        -- Routines -------------------------------------------------------
        -- Declarative "when X happens, spawn agent with Y config" rows.
        -- Version counter bumps on update; fires/runs snapshot the version
        -- so historical runs remain reproducible after edits.
        CREATE TABLE IF NOT EXISTS routines (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            trigger_kind TEXT NOT NULL,
            config TEXT NOT NULL,
            created_by TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_routines_namespace
            ON routines(namespace, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_routines_trigger_kind
            ON routines(trigger_kind);

        -- Fire tokens: per-routine bearer tokens for the API trigger.
        -- Mirrors enrollment token handling: store only token_hash, never
        -- the raw secret. token_preview (first 6 chars + ...) is safe to
        -- show in the UI for identification.
        CREATE TABLE IF NOT EXISTS routine_fire_tokens (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            routine_id TEXT NOT NULL,
            name TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            token_preview TEXT NOT NULL,
            created_by TEXT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            revoked_at INTEGER,
            last_used_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_routine_fire_tokens_routine
            ON routine_fire_tokens(routine_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_fire_tokens_hash
            ON routine_fire_tokens(token_hash);

        -- Fires: every "someone asked this routine to run" event.
        -- dedup_key is used by webhook triggers to drop GitHub redelivery.
        CREATE TABLE IF NOT EXISTS routine_fires (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            routine_id TEXT NOT NULL,
            routine_version INTEGER NOT NULL,
            trigger_kind TEXT NOT NULL,
            payload TEXT,
            actor TEXT NOT NULL,
            dedup_key TEXT,
            filter_result TEXT,
            fired_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_routine_fires_routine
            ON routine_fires(routine_id, fired_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_fires_dedup
            ON routine_fires(routine_id, dedup_key)
            WHERE dedup_key IS NOT NULL;

        -- Runs: the actual execution. status is the state machine; only
        -- terminal states have ended_at set.
        CREATE TABLE IF NOT EXISTS routine_runs (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            routine_id TEXT NOT NULL,
            routine_version INTEGER NOT NULL,
            fire_id TEXT NOT NULL,
            spawn_request_id TEXT,
            session_id TEXT,
            status TEXT NOT NULL,
            skipped_reason TEXT,
            started_at INTEGER,
            ended_at INTEGER,
            outcome TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_routine_runs_routine
            ON routine_runs(routine_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_routine_runs_fire
            ON routine_runs(fire_id);
        CREATE INDEX IF NOT EXISTS idx_routine_runs_session
            ON routine_runs(session_id);
        CREATE INDEX IF NOT EXISTS idx_routine_runs_status
            ON routine_runs(status);

        -- Events: cross-cutting observability stream. Every layer
        -- (pipeline / tracker / triggers) appends here so the UI can
        -- render a complete "why did this fire and what happened?"
        -- timeline without digging through app logs.
        CREATE TABLE IF NOT EXISTS routine_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace TEXT NOT NULL DEFAULT 'default',
            routine_id TEXT NOT NULL,
            fire_id TEXT,
            run_id TEXT,
            kind TEXT NOT NULL,
            data TEXT,
            at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_routine_events_routine
            ON routine_events(routine_id, at DESC);
        CREATE INDEX IF NOT EXISTS idx_routine_events_run
            ON routine_events(run_id, at);
        CREATE INDEX IF NOT EXISTS idx_routine_events_fire
            ON routine_events(fire_id);
    `)
}
