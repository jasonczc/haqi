import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from '../store'
import { CheckpointRegistry } from './checkpointRegistry'

describe('CheckpointRegistry', () => {
    let store: Store
    let registry: CheckpointRegistry

    beforeEach(() => {
        store = new Store(':memory:')
        registry = new CheckpointRegistry(store)
    })

    it('saves a checkpoint and retrieves it', () => {
        const id = registry.save({
            namespace: 'default',
            name: 'test-cp',
            repoUrl: 'https://github.com/test/repo.git',
            parentCheckpointId: null,
            baseImage: 'haqi-workspace:dev',
            dockerImage: 'haqi-checkpoint:abc',
            machineId: 'worker-1',
            workspacePath: '/workspace',
            environmentJson: null,
            createdBySession: 'session-1'
        })

        const cp = registry.get(id)
        expect(cp).not.toBeNull()
        expect(cp!.name).toBe('test-cp')
    })

    it('resolves checkpoint for spawn (by id)', () => {
        const id = registry.save({
            namespace: 'default', name: 'cp', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        registry.markReady(id)

        const resolved = registry.resolveForSpawn(id, 'default')
        expect(resolved).not.toBeNull()
        expect(resolved!.dockerImage).toBe('haqi-checkpoint:x')
        expect(resolved!.machineId).toBe('w1')
    })

    it('rejects spawn from non-ready checkpoint', () => {
        const id = registry.save({
            namespace: 'default', name: 'cp', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        // status is still 'creating'
        const resolved = registry.resolveForSpawn(id, 'default')
        expect(resolved).toBeNull()
    })

    it('lists checkpoints for repo', () => {
        registry.save({
            namespace: 'default', name: 'cp1', repoUrl: 'https://github.com/a/b.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        const list = registry.listForRepo('default', 'https://github.com/a/b.git')
        expect(list).toHaveLength(1)
    })

    it('prevents deleting checkpoint with children', () => {
        const parentId = registry.save({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        registry.save({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const result = registry.remove(parentId)
        expect(result.ok).toBe(false)
    })
})
