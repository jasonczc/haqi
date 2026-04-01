import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

export type StoredCheckpoint = {
    id: string
    namespace: string
    name: string
    repoUrl: string | null
    parentCheckpointId: string | null
    baseImage: string
    dockerImage: string
    machineId: string
    workspacePath: string | null
    environmentJson: string | null
    createdBySession: string | null
    status: 'creating' | 'ready' | 'failed'
    createdAt: number
    updatedAt: number
}

export type CreateCheckpointParams = {
    namespace: string
    name: string
    repoUrl: string | null
    parentCheckpointId: string | null
    baseImage: string
    dockerImage: string
    machineId: string
    workspacePath: string | null
    environmentJson: string | null
    createdBySession: string | null
}

export type DeleteCheckpointResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'has_children'; children?: string[] }

type DbCheckpointRow = {
    id: string
    namespace: string
    name: string
    repo_url: string | null
    parent_checkpoint_id: string | null
    base_image: string
    docker_image: string
    machine_id: string
    workspace_path: string | null
    environment_json: string | null
    created_by_session: string | null
    status: 'creating' | 'ready' | 'failed'
    created_at: number
    updated_at: number
}

function rowToCheckpoint(row: DbCheckpointRow): StoredCheckpoint {
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        repoUrl: row.repo_url,
        parentCheckpointId: row.parent_checkpoint_id,
        baseImage: row.base_image,
        dockerImage: row.docker_image,
        machineId: row.machine_id,
        workspacePath: row.workspace_path,
        environmentJson: row.environment_json,
        createdBySession: row.created_by_session,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export class CheckpointStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    create(params: CreateCheckpointParams): string {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO cloud_checkpoints
            (id, namespace, name, repo_url, parent_checkpoint_id, base_image, docker_image,
             machine_id, workspace_path, environment_json, created_by_session, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)
        `).run(
            id,
            params.namespace,
            params.name,
            params.repoUrl,
            params.parentCheckpointId,
            params.baseImage,
            params.dockerImage,
            params.machineId,
            params.workspacePath,
            params.environmentJson,
            params.createdBySession,
            now,
            now,
        )
        return id
    }

    get(id: string): StoredCheckpoint | null {
        const row = this.db.prepare('SELECT * FROM cloud_checkpoints WHERE id = ?').get(id) as DbCheckpointRow | null
        return row ? rowToCheckpoint(row) : null
    }

    getByNamespace(id: string, namespace: string): StoredCheckpoint | null {
        const row = this.db.prepare('SELECT * FROM cloud_checkpoints WHERE id = ? AND namespace = ?')
            .get(id, namespace) as DbCheckpointRow | null
        return row ? rowToCheckpoint(row) : null
    }

    listByNamespace(namespace: string, filter?: { repoUrl?: string }): StoredCheckpoint[] {
        if (filter?.repoUrl) {
            const rows = this.db.prepare(
                'SELECT * FROM cloud_checkpoints WHERE namespace = ? AND repo_url = ? ORDER BY created_at DESC'
            ).all(namespace, filter.repoUrl) as DbCheckpointRow[]
            return rows.map(rowToCheckpoint)
        }
        const rows = this.db.prepare(
            'SELECT * FROM cloud_checkpoints WHERE namespace = ? ORDER BY created_at DESC'
        ).all(namespace) as DbCheckpointRow[]
        return rows.map(rowToCheckpoint)
    }

    listChildren(parentId: string): StoredCheckpoint[] {
        const rows = this.db.prepare(
            'SELECT * FROM cloud_checkpoints WHERE parent_checkpoint_id = ? ORDER BY created_at DESC'
        ).all(parentId) as DbCheckpointRow[]
        return rows.map(rowToCheckpoint)
    }

    updateStatus(id: string, status: 'creating' | 'ready' | 'failed'): void {
        this.db.prepare('UPDATE cloud_checkpoints SET status = ?, updated_at = ? WHERE id = ?')
            .run(status, Date.now(), id)
    }

    delete(id: string): DeleteCheckpointResult {
        const checkpoint = this.get(id)
        if (!checkpoint) return { ok: false, reason: 'not_found' }

        const children = this.listChildren(id)
        if (children.length > 0) {
            return { ok: false, reason: 'has_children', children: children.map(c => c.id) }
        }

        this.db.prepare('DELETE FROM cloud_checkpoints WHERE id = ?').run(id)
        return { ok: true }
    }
}
