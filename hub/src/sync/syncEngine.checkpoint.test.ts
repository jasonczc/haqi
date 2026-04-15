import { describe, expect, it, mock } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'
import { SyncEngine } from './syncEngine'

describe('SyncEngine checkpoint save', () => {
    it('defaults parent checkpoint to the source session checkpoint', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as Server,
            {
                getSocketIdForMethod: () => null,
            } as unknown as RpcRegistry,
            { broadcast: mock(() => {}) } as unknown as SSEManager
        )

        engine.getOrCreateMachine(
            'worker-1',
            {
                host: 'cloudbox',
                platform: 'linux',
                happyCliVersion: '0.1.0',
                homeDir: '/home/worker',
                happyHomeDir: '/home/worker/.hapi',
                happyLibDir: '/home/worker/.local/share/hapi',
                executorType: 'cloud-self-hosted',
            },
            null,
            'default'
        )
        engine.handleMachineAlive({ machineId: 'worker-1', time: Date.now() })

        const session = engine.getOrCreateSession(
            'setup-session',
            {
                path: '/workspace/repo',
                host: 'cloudbox',
                containerId: 'container-1',
                repositoryUrl: 'https://github.com/acme/repo.git',
                checkpointId: 'parent-123',
            },
            { requests: {}, completedRequests: {} },
            'default'
        )

        ;(engine as any).rpcGateway.checkpointCreate = async () => ({ success: true })

        const result = await engine.saveCheckpoint(session.id, 'default', 'derived-checkpoint')
        expect(result).toEqual(expect.objectContaining({
            checkpointId: expect.any(String)
        }))

        if (!('checkpointId' in result)) {
            return
        }

        const checkpoint = store.checkpoints.get(result.checkpointId)
        expect(checkpoint).not.toBeNull()
        expect(checkpoint?.parentCheckpointId).toBe('parent-123')
        expect(checkpoint?.baseImage).toBe('haqi-checkpoint:parent-123')
        expect(checkpoint?.status).toBe('ready')
    })
})
