import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { SSEManager } from '../../sse/sseManager'
import { Store } from '../../store'
import { FirePipeline, type SpawnCoordinatorLike } from '../../routines'
import { EventPublisher } from '../../sync/eventPublisher'
import { createRoutineAdminRoutes, createRoutineFireRoutes } from './routines'

function makeApp(): {
    app: Hono<any>
    store: Store
    pipeline: FirePipeline
    spawns: Array<{ request: unknown }>
} {
    const store = new Store(':memory:')
    const spawns: Array<{ request: unknown }> = []
    const coordinator: SpawnCoordinatorLike = {
        enqueue(_ns, _m, request) {
            spawns.push({ request })
            return { id: `sp-${spawns.length}` }
        }
    }
    const sse = { broadcast() {} } as unknown as SSEManager
    const publisher = new EventPublisher(sse, () => 'default')
    const pipeline = new FirePipeline(store, coordinator, publisher)

    const app = new Hono<any>()
    // Fire routes mount FIRST (pre-auth).
    app.route('/api', createRoutineFireRoutes({
        getStore: () => store,
        getFirePipeline: () => pipeline
    }))
    // Fake "auth middleware" — just stuffs namespace + userId onto ctx.
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        c.set('userId', 42 as unknown as any)
        await next()
    })
    app.route('/api', createRoutineAdminRoutes({ getStore: () => store }))

    return { app, store, pipeline, spawns }
}

async function jsonRequest<T>(app: Hono<any>, url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const res = await app.request(url, init)
    const body = (await res.json()) as T
    return { status: res.status, body }
}

async function createRoutineViaApi(app: Hono<any>): Promise<string> {
    const { status, body } = await jsonRequest<{ routine: { id: string } }>(app, 'http://x/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: 'daily',
            trigger: { kind: 'api' },
            spawn: { promptTemplate: 'hello' },
            concurrency: 'allow'
        })
    })
    expect(status).toBe(200)
    return body.routine.id
}

async function mintToken(app: Hono<any>, routineId: string): Promise<string> {
    const { status, body } = await jsonRequest<{ secret: string }>(app, `http://x/api/routines/${routineId}/tokens`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ci' })
    })
    expect(status).toBe(200)
    return body.secret
}

describe('Routines admin routes', () => {
    it('CRUD cycle: create → list → get → update → delete', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)

        const list = await jsonRequest<{ routines: Array<{ id: string }> }>(app, 'http://x/api/routines')
        expect(list.body.routines.map((r) => r.id)).toContain(id)

        const getRes = await jsonRequest<{ routine: { name: string; version: number } }>(app, `http://x/api/routines/${id}`)
        expect(getRes.body.routine.name).toBe('daily')
        expect(getRes.body.routine.version).toBe(1)

        const updated = await jsonRequest<{ routine: { name: string; version: number; concurrency: string } }>(app, `http://x/api/routines/${id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'renamed', concurrency: 'skip' })
        })
        expect(updated.body.routine.name).toBe('renamed')
        expect(updated.body.routine.version).toBe(2)
        expect(updated.body.routine.concurrency).toBe('skip')

        const del = await app.request(`http://x/api/routines/${id}`, { method: 'DELETE' })
        expect(del.status).toBe(200)
        const gone = await app.request(`http://x/api/routines/${id}`)
        expect(gone.status).toBe(404)
    })

    it('rejects invalid create body with 400 and issues', async () => {
        const { app } = makeApp()
        const res = await jsonRequest<{ error: string; issues?: unknown[] }>(app, 'http://x/api/routines', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ /* missing name + trigger + spawn */ })
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('invalid_body')
        expect(Array.isArray(res.body.issues)).toBe(true)
    })

    it('token mint returns secret once and list redacts it afterwards', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)
        const mint = await jsonRequest<{ token: { id: string; tokenPreview: string }; secret: string }>(app, `http://x/api/routines/${id}/tokens`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'ci' })
        })
        expect(mint.body.secret).toMatch(/^hrf_/)
        const list = await jsonRequest<{ tokens: Array<{ tokenPreview: string }> }>(app, `http://x/api/routines/${id}/tokens`)
        expect(list.body.tokens[0].tokenPreview).not.toContain(mint.body.secret)
    })

    it('token revoke blocks subsequent fires via that token', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)
        const secret = await mintToken(app, id)
        const list = await jsonRequest<{ tokens: Array<{ id: string }> }>(app, `http://x/api/routines/${id}/tokens`)
        const tokenId = list.body.tokens[0].id

        const ok = await app.request(`http://x/api/routines/${id}/fire`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }
        })
        expect(ok.status).toBe(200)

        const revokeRes = await app.request(`http://x/api/routines/${id}/tokens/${tokenId}/revoke`, { method: 'POST' })
        expect(revokeRes.status).toBe(200)

        const after = await app.request(`http://x/api/routines/${id}/fire`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }
        })
        expect(after.status).toBe(401)
    })
})

describe('Routines fire route', () => {
    it('missing bearer → 401 missing_bearer_token', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)
        const res = await jsonRequest<{ error: string }>(app, `http://x/api/routines/${id}/fire`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('missing_bearer_token')
    })

    it('valid bearer → pipeline runs → response includes fire + run', async () => {
        const { app, spawns } = makeApp()
        const id = await createRoutineViaApi(app)
        const secret = await mintToken(app, id)
        const res = await jsonRequest<{ ok: boolean; run?: { status: string }; fire?: { triggerKind: string } }>(app, `http://x/api/routines/${id}/fire`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
            body: JSON.stringify({ text: 'please review', dedupKey: 'client-abc' })
        })
        expect(res.status).toBe(200)
        expect(res.body.ok).toBe(true)
        expect(res.body.fire?.triggerKind).toBe('api')
        expect(spawns).toHaveLength(1)
    })

    it('same dedupKey twice → second request returns 409 duplicate_fire', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)
        const secret = await mintToken(app, id)
        const headers = { 'content-type': 'application/json', authorization: `Bearer ${secret}` }
        const body = JSON.stringify({ dedupKey: 'once' })
        const first = await app.request(`http://x/api/routines/${id}/fire`, { method: 'POST', headers, body })
        expect(first.status).toBe(200)
        const second = await jsonRequest<{ error: string }>(app, `http://x/api/routines/${id}/fire`, { method: 'POST', headers, body })
        expect(second.status).toBe(409)
        expect(second.body.error).toBe('duplicate_fire')
    })

    it('fires for a paused routine → 409 routine_inactive', async () => {
        const { app } = makeApp()
        const id = await createRoutineViaApi(app)
        const secret = await mintToken(app, id)
        await app.request(`http://x/api/routines/${id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'paused' })
        })
        const res = await jsonRequest<{ error: string }>(app, `http://x/api/routines/${id}/fire`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }
        })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('routine_inactive')
    })
})
