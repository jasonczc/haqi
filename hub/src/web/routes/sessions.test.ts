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
