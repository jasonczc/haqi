import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from '../store'

describe('checkpointStore', () => {
    let store: Store

    beforeEach(() => {
        store = new Store(':memory:')
    })

    it('creates and retrieves a checkpoint', () => {
        const id = store.checkpoints.create({
            namespace: 'default',
            name: 'Node 18 + deps',
            repoUrl: 'https://github.com/test/repo.git',
            parentCheckpointId: null,
            baseImage: 'haqi-workspace:dev',
            dockerImage: 'haqi-checkpoint:abc123',
            machineId: 'worker-1',
            workspacePath: '/workspace',
            environmentJson: null,
            createdBySession: 'session-1'
        })
        expect(id).toBeTruthy()

        const cp = store.checkpoints.get(id)
        expect(cp).not.toBeNull()
        expect(cp!.name).toBe('Node 18 + deps')
        expect(cp!.status).toBe('creating')
    })

    it('updates status to ready', () => {
        const id = store.checkpoints.create({
            namespace: 'default', name: 'test', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:x',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.updateStatus(id, 'ready')
        expect(store.checkpoints.get(id)!.status).toBe('ready')
    })

    it('lists by namespace', () => {
        store.checkpoints.create({
            namespace: 'team-a', name: 'cp1', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'team-b', name: 'cp2', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:2',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const list = store.checkpoints.listByNamespace('team-a')
        expect(list).toHaveLength(1)
        expect(list[0].name).toBe('cp1')
    })

    it('lists children of a checkpoint', () => {
        const parentId = store.checkpoints.create({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const children = store.checkpoints.listChildren(parentId)
        expect(children).toHaveLength(1)
        expect(children[0].name).toBe('child')
    })

    it('prevents deletion when children exist', () => {
        const parentId = store.checkpoints.create({
            namespace: 'default', name: 'parent', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:p',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'child', repoUrl: null,
            parentCheckpointId: parentId, baseImage: 'img', dockerImage: 'haqi-checkpoint:c',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const result = store.checkpoints.delete(parentId) as { ok: false; reason: string }
        expect(result.ok).toBe(false)
        expect(result.reason).toBe('has_children')
    })

    it('deletes leaf checkpoint', () => {
        const id = store.checkpoints.create({
            namespace: 'default', name: 'leaf', repoUrl: null,
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:l',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        const result = store.checkpoints.delete(id)
        expect(result.ok).toBe(true)
        expect(store.checkpoints.get(id)).toBeNull()
    })

    it('filters by repoUrl', () => {
        store.checkpoints.create({
            namespace: 'default', name: 'cp1', repoUrl: 'https://github.com/a/b.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:1',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's1'
        })
        store.checkpoints.create({
            namespace: 'default', name: 'cp2', repoUrl: 'https://github.com/c/d.git',
            parentCheckpointId: null, baseImage: 'img', dockerImage: 'haqi-checkpoint:2',
            machineId: 'w1', workspacePath: '/ws', environmentJson: null, createdBySession: 's2'
        })
        const list = store.checkpoints.listByNamespace('default', { repoUrl: 'https://github.com/a/b.git' })
        expect(list).toHaveLength(1)
        expect(list[0].name).toBe('cp1')
    })
})
