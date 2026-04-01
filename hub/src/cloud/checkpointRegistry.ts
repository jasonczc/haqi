import type { Store, StoredCheckpoint, CreateCheckpointParams } from '../store'

export type { StoredCheckpoint, CreateCheckpointParams }

export class CheckpointRegistry {
    constructor(private readonly store: Store) {}

    save(params: CreateCheckpointParams): string {
        return this.store.checkpoints.create(params)
    }

    markReady(id: string): void {
        this.store.checkpoints.updateStatus(id, 'ready')
    }

    markFailed(id: string): void {
        this.store.checkpoints.updateStatus(id, 'failed')
    }

    get(id: string): StoredCheckpoint | null {
        return this.store.checkpoints.get(id)
    }

    getByNamespace(id: string, namespace: string): StoredCheckpoint | null {
        return this.store.checkpoints.getByNamespace(id, namespace)
    }

    list(namespace: string): StoredCheckpoint[] {
        return this.store.checkpoints.listByNamespace(namespace)
    }

    listForRepo(namespace: string, repoUrl: string): StoredCheckpoint[] {
        return this.store.checkpoints.listByNamespace(namespace, { repoUrl })
    }

    listChildren(id: string): StoredCheckpoint[] {
        return this.store.checkpoints.listChildren(id)
    }

    resolveForSpawn(checkpointId: string, namespace: string): StoredCheckpoint | null {
        const cp = this.store.checkpoints.getByNamespace(checkpointId, namespace)
        if (!cp || cp.status !== 'ready') return null
        return cp
    }

    remove(id: string): { ok: true } | { ok: false; reason: string; children?: string[] } {
        return this.store.checkpoints.delete(id)
    }
}
