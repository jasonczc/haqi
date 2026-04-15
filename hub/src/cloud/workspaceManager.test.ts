import { beforeEach, describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { WorkspaceManager } from './workspaceManager'

describe('WorkspaceManager', () => {
    let store: Store
    let manager: WorkspaceManager
    let spawnRequestId: string

    beforeEach(() => {
        store = new Store(':memory:')
        store.machines.getOrCreateMachine('worker-1', { host: 'worker-1' }, null, 'default')
        spawnRequestId = store.cloud.createSpawnRequest({
            namespace: 'default',
            requestedMachineId: 'worker-1',
            selectedMachineId: 'worker-1',
            phase: 'queued',
            request: {}
        }).id
        manager = new WorkspaceManager(store, () => true)
    })

    it('uses environment repository defaults when request omits workspaceSource', () => {
        const acquired = manager.acquireWorkspace({
            namespace: 'default',
            machineId: 'worker-1',
            requestId: spawnRequestId,
            request: {
                runtimeKind: 'daemon-session',
                worktreeName: 'fix-login',
                workspace: {
                    mode: 'persistent'
                },
                environmentId: 'env-ts'
            },
            environment: {
                id: 'env-ts',
                repository: {
                    url: 'https://github.com/acme/demo.git',
                    ref: {
                        branch: 'main'
                    },
                    branchStrategy: {
                        mode: 'create',
                        prefix: 'haqi/'
                    }
                }
            }
        })

        expect(acquired.workspace.source?.repository?.url).toBe('https://github.com/acme/demo.git')
        expect(acquired.workspace.workspaceBranch).toBe('haqi/fix-login')
    })

    it('reuses the base branch when branch strategy mode is reuse', () => {
        const acquired = manager.acquireWorkspace({
            namespace: 'default',
            machineId: 'worker-1',
            requestId: spawnRequestId,
            request: {
                runtimeKind: 'daemon-session',
                workspaceSource: {
                    type: 'repo',
                    repository: {
                        url: 'https://github.com/acme/demo.git',
                        ref: {
                            branch: 'release'
                        },
                        branchStrategy: {
                            mode: 'reuse'
                        }
                    }
                }
            }
        })

        expect(acquired.workspace.workspaceBranch).toBe('release')
    })
})
