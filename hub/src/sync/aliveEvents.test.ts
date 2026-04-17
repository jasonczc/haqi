import { describe, expect, it, mock } from 'bun:test'
import type { SyncEvent } from '@hapi/protocol/types'
import { Store } from '../store'
import type { EventPublisher } from './eventPublisher'
import { MachineCache } from './machineCache'
import { SessionCache } from './sessionCache'
import { SyncEngine } from './syncEngine'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'

function createPublisher(events: SyncEvent[]): EventPublisher {
    return {
        emit: (event: SyncEvent) => {
            events.push(event)
        }
    } as unknown as EventPublisher
}

describe('alive incremental events', () => {
    it('includes active=true in session alive updates', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-alive-test',
            { path: '/tmp/project', host: 'localhost' },
            { requests: {}, completedRequests: {} },
            'default'
        )

        events.length = 0
        cache.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

        const update = events.find((event) => event.type === 'session-updated')
        expect(update).toBeDefined()
        if (!update || update.type !== 'session-updated') {
            return
        }

        expect(update.data).toEqual(expect.objectContaining({ active: true }))
    })

    it('emits full active machine object on machine alive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new MachineCache(store, createPublisher(events))

        const machine = cache.getOrCreateMachine(
            'machine-alive-test',
            { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
            null,
            'default'
        )

        events.length = 0
        cache.handleMachineAlive({ machineId: machine.id, time: Date.now() })

        const update = events.find((event) => event.type === 'machine-updated')
        expect(update).toBeDefined()
        if (!update || update.type !== 'machine-updated') {
            return
        }

        expect(update.data).toEqual(expect.objectContaining({ id: machine.id, active: true }))
    })

    it('auto-prunes machines inactive beyond the dead-machine TTL', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new MachineCache(store, createPublisher(events))

        const now = Date.now()

        const stale = cache.getOrCreateMachine(
            'machine-stale',
            { host: 'spot-1', platform: 'linux', happyCliVersion: '0.1.0' },
            null,
            'default'
        )
        const recent = cache.getOrCreateMachine(
            'machine-recent',
            { host: 'spot-2', platform: 'linux', happyCliVersion: '0.1.0' },
            null,
            'default'
        )

        // Directly age activeAt on the cached Machine objects (the public
        // heartbeat API clamps timestamps to ~realNow).
        const twoHoursAgo = now - 2 * 60 * 60 * 1000
        ;(stale as unknown as { activeAt: number }).activeAt = twoHoursAgo
        ;(stale as unknown as { active: boolean }).active = false
        ;(recent as unknown as { activeAt: number }).activeAt = now
        ;(recent as unknown as { active: boolean }).active = true

        events.length = 0
        cache.expireInactive(now)

        expect(store.machines.getMachine('machine-stale')).toBeNull()
        expect(store.machines.getMachine('machine-recent')).not.toBeNull()

        const removal = events.find(
            (event) => event.type === 'machine-updated' && event.machineId === 'machine-stale' && event.data === null
        )
        expect(removal).toBeDefined()
    })

    it('persists active/activeAt to DB on heartbeat so state survives hub restart', () => {
        const store = new Store(':memory:')
        const firstRunEvents: SyncEvent[] = []
        const cache = new MachineCache(store, createPublisher(firstRunEvents))

        cache.getOrCreateMachine(
            'machine-persist',
            { host: 'worker', platform: 'linux', happyCliVersion: '0.1.0' },
            null,
            'default'
        )

        // First heartbeat (inactive → active transition) MUST write to DB.
        const aliveTime = Date.now()
        cache.handleMachineAlive({ machineId: 'machine-persist', time: aliveTime })

        const row = store.machines.getMachine('machine-persist')
        expect(row).not.toBeNull()
        expect(row?.active).toBe(true)
        expect(row?.activeAt).toBe(aliveTime)

        // Simulate hub restart: new cache, same store. Machine should
        // re-hydrate as active from DB, not default back to inactive.
        const secondRunEvents: SyncEvent[] = []
        const restartedCache = new MachineCache(store, createPublisher(secondRunEvents))
        restartedCache.reloadAll()

        const hydrated = restartedCache.getMachine('machine-persist')
        expect(hydrated).toBeDefined()
        expect(hydrated?.active).toBe(true)
        expect(hydrated?.activeAt).toBe(aliveTime)
    })

    it('persists active→inactive transition on expireInactive so prune is correct', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new MachineCache(store, createPublisher(events))

        const machine = cache.getOrCreateMachine(
            'machine-timeout',
            { host: 'worker', platform: 'linux', happyCliVersion: '0.1.0' },
            null,
            'default'
        )

        const past = Date.now() - 5 * 60 * 1000 // 5 min ago — well past heartbeat timeout
        ;(machine as unknown as { activeAt: number }).activeAt = past
        ;(machine as unknown as { active: boolean }).active = true

        cache.expireInactive(Date.now())

        // DB must reflect the in-memory transition so a hub restart doesn't
        // see a phantom "active" machine.
        const row = store.machines.getMachine('machine-timeout')
        expect(row?.active).toBe(false)
    })

    it('stores environment and preview history through sync engine registries', () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as Server,
            {
                getSocketIdForMethod: () => null,
            } as unknown as RpcRegistry,
            {} as SSEManager
        )

        const preview = {
            id: 'preview-1',
            name: 'web',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            visibility: 'private' as const
        }

        engine.registerSessionPreviews('session-a', [preview])
        expect(engine.getSessionPreviews('session-a')).toEqual([preview])

        engine.registerEnvironmentDefinition({
            id: 'node-dev',
            version: '1',
            runtime: {
                kind: 'docker-session',
                image: 'ghcr.io/acme/node:18'
            }
        })
        expect(engine.getEnvironmentDefinition('node-dev')).toEqual(expect.objectContaining({
            id: 'node-dev'
        }))
        expect(engine.listCloudEnvironments()).toHaveLength(1)
        expect(engine.listCloudPreviews()).toEqual(expect.arrayContaining([
            expect.objectContaining({
                sessionId: 'session-a',
                previews: [preview]
            })
        ]))
    })

    it('derives environment and preview registries from session updates', () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as Server,
            {
                getSocketIdForMethod: () => null,
            } as unknown as RpcRegistry,
            { broadcast: mock(() => {}) } as unknown as SSEManager
        )

        const session = engine.getOrCreateSession(
            'session-cloud',
            {
                path: '/workspace/demo',
                host: 'cloudbox',
                machineId: 'machine-1',
                environmentId: 'node-dev',
                previewUrls: [
                    {
                        id: 'preview-1',
                        name: 'web',
                        port: 3000,
                        url: 'https://preview.example.com',
                        visibility: 'private'
                    }
                ]
            },
            { requests: {}, completedRequests: {} },
            'default'
        )

        expect(engine.listCloudEnvironments()).toEqual([
            expect.objectContaining({
                id: 'node-dev'
            })
        ])
        expect(engine.listCloudPreviews()).toEqual([
            expect.objectContaining({
                sessionId: session.id,
                machineId: 'machine-1',
                previews: [
                    expect.objectContaining({
                        id: 'preview-1',
                        port: 3000
                    })
                ]
            })
        ])
    })
})
