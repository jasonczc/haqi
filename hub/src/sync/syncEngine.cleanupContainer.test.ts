import { describe, expect, it, mock } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'
import { SyncEngine } from './syncEngine'

function makeEngine(): { engine: SyncEngine; containerStop: ReturnType<typeof mock>; containerRemove: ReturnType<typeof mock> } {
    const store = new Store(':memory:')
    const engine = new SyncEngine(
        store,
        {} as Server,
        {
            getSocketIdForMethod: () => null,
        } as unknown as RpcRegistry,
        { broadcast: mock(() => {}) } as unknown as SSEManager
    )
    const containerStop = mock(async () => undefined)
    const containerRemove = mock(async () => undefined)
    ;(engine as any).rpcGateway.containerStop = containerStop
    ;(engine as any).rpcGateway.containerRemove = containerRemove
    return { engine, containerStop, containerRemove }
}

function seedOnlineWorker(engine: SyncEngine, machineId: string): void {
    engine.getOrCreateMachine(
        machineId,
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
    engine.handleMachineAlive({ machineId, time: Date.now() })
}

describe('SyncEngine.cleanupSessionContainer', () => {
    it('skips with no-container when the session has no containerId', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')

        const session = engine.getOrCreateSession(
            'no-container-session',
            { path: '/workspace/repo', host: 'cloudbox' }, // no containerId
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'default')

        expect(result).toEqual({ cleaned: false, skipped: 'no-container' })
        expect(containerStop).not.toHaveBeenCalled()
        expect(containerRemove).not.toHaveBeenCalled()
    })

    it('skips with no-online-worker when no cloud worker is present', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        // no seedOnlineWorker call — no workers registered

        const session = engine.getOrCreateSession(
            'orphan-session',
            { path: '/workspace/repo', host: 'cloudbox', containerId: 'ctr-abc' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'default')

        expect(result).toEqual({ cleaned: false, skipped: 'no-online-worker' })
        expect(containerStop).not.toHaveBeenCalled()
        expect(containerRemove).not.toHaveBeenCalled()
    })

    it('stops and removes the container via RPC for a daemon-session', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')

        const session = engine.getOrCreateSession(
            'alive-session',
            { path: '/workspace/repo', host: 'cloudbox', containerId: 'ctr-abc' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'default')

        expect(result).toEqual({ cleaned: true })
        expect(containerStop).toHaveBeenCalledWith('worker-1', 'ctr-abc')
        expect(containerRemove).toHaveBeenCalledWith('worker-1', 'ctr-abc')
    })

    it('treats container-stop failure as recoverable and still removes', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')
        containerStop.mockImplementation(async () => {
            throw new Error('container already stopped')
        })

        const session = engine.getOrCreateSession(
            'stopped-session',
            { path: '/workspace/repo', host: 'cloudbox', containerId: 'ctr-xyz' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'default')

        expect(result).toEqual({ cleaned: true })
        expect(containerStop).toHaveBeenCalled()
        expect(containerRemove).toHaveBeenCalledWith('worker-1', 'ctr-xyz')
    })

    it('reports error but does not throw when container-remove RPC fails', async () => {
        const { engine, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')
        containerRemove.mockImplementation(async () => {
            throw new Error('worker offline')
        })

        const session = engine.getOrCreateSession(
            'failing-session',
            { path: '/workspace/repo', host: 'cloudbox', containerId: 'ctr-fail' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'default')

        expect(result.cleaned).toBe(false)
        expect(typeof result.error).toBe('string')
        expect(result.error).toContain('worker offline')
    })

    it('returns session-not-found when no matching session exists', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')

        const result = await engine.cleanupSessionContainer('nope', 'default')

        expect(result).toEqual({ cleaned: false, skipped: 'session-not-found' })
        expect(containerStop).not.toHaveBeenCalled()
        expect(containerRemove).not.toHaveBeenCalled()
    })

    it('respects namespace — session in another namespace is not found', async () => {
        const { engine, containerStop, containerRemove } = makeEngine()
        seedOnlineWorker(engine, 'worker-1')

        const session = engine.getOrCreateSession(
            'other-ns-session',
            { path: '/workspace/repo', host: 'cloudbox', containerId: 'ctr-ns' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        const result = await engine.cleanupSessionContainer(session.id, 'other-namespace')

        expect(result).toEqual({ cleaned: false, skipped: 'session-not-found' })
        expect(containerStop).not.toHaveBeenCalled()
        expect(containerRemove).not.toHaveBeenCalled()
    })
})
