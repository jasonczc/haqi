import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSessionsRoutes } from './sessions'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createSessionsRoutes(getSyncEngine as never))
    return app
}

describe('session abort route', () => {
    it('stops inactive cloud daemon setup sessions through container rpc', async () => {
        const rpcContainerStopSession = mock(async () => {})
        const handleSessionEnd = mock(() => {})
        const archiveSession = mock(async () => {})

        const session = {
            id: 's1',
            namespace: 'default',
            active: false,
            metadata: {
                executionBackend: 'cloud-self-hosted',
                runtimeKind: 'daemon-session',
                sessionType: 'setup',
                spawnRequestId: 'req-1',
                containerId: 'ctr-1'
            }
        }

        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            getCloudRequestByNamespace: () => ({ selectedMachineId: 'machine-1' }),
            rpcContainerStopSession,
            handleSessionEnd,
            archiveSession
        }))

        const res = await app.request('http://localhost/api/sessions/s1/abort', {
            method: 'POST'
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(rpcContainerStopSession).toHaveBeenCalledWith('machine-1', 'ctr-1')
        expect(handleSessionEnd).toHaveBeenCalled()
        expect(archiveSession).not.toHaveBeenCalled()
    })

    it('returns 409 for inactive non-cloud sessions', async () => {
        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 's1',
                session: {
                    id: 's1',
                    namespace: 'default',
                    active: false,
                    metadata: null
                }
            })
        }))

        const res = await app.request('http://localhost/api/sessions/s1/abort', {
            method: 'POST'
        })

        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: 'Session is inactive' })
    })
})

describe('session delete route', () => {
    it('runs container cleanup before dropping the session row', async () => {
        const cleanupSessionContainer = mock(async () => ({ cleaned: true }))
        const deleteSession = mock(async () => {})
        const order: string[] = []

        cleanupSessionContainer.mockImplementation(async () => {
            order.push('cleanup')
            return { cleaned: true }
        })
        deleteSession.mockImplementation(async () => {
            order.push('delete')
        })

        const session = {
            id: 's1',
            namespace: 'default',
            active: false,
            metadata: { containerId: 'ctr-1' }
        }

        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            cleanupSessionContainer,
            deleteSession
        }))

        const res = await app.request('http://localhost/api/sessions/s1', {
            method: 'DELETE'
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, containerCleanup: { cleaned: true } })
        expect(cleanupSessionContainer).toHaveBeenCalledWith('s1', 'default')
        expect(deleteSession).toHaveBeenCalledWith('s1')
        expect(order).toEqual(['cleanup', 'delete'])
    })

    it('still deletes the session when container cleanup fails', async () => {
        const cleanupSessionContainer = mock(async () => ({ cleaned: false, error: 'worker offline' }))
        const deleteSession = mock(async () => {})

        const session = {
            id: 's1',
            namespace: 'default',
            active: false,
            metadata: { containerId: 'ctr-1' }
        }

        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            cleanupSessionContainer,
            deleteSession
        }))

        const res = await app.request('http://localhost/api/sessions/s1', {
            method: 'DELETE'
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            ok: true,
            containerCleanup: { cleaned: false, error: 'worker offline' }
        })
        expect(deleteSession).toHaveBeenCalledWith('s1')
    })

    it('refuses to delete active sessions', async () => {
        const cleanupSessionContainer = mock(async () => ({ cleaned: false }))
        const deleteSession = mock(async () => {})

        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 's1',
                session: { id: 's1', namespace: 'default', active: true, metadata: null }
            }),
            cleanupSessionContainer,
            deleteSession
        }))

        const res = await app.request('http://localhost/api/sessions/s1', {
            method: 'DELETE'
        })

        expect(res.status).toBe(409)
        expect(cleanupSessionContainer).not.toHaveBeenCalled()
        expect(deleteSession).not.toHaveBeenCalled()
    })
})
