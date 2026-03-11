import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { Hono } from 'hono'

import { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSwarmsRoutes } from './swarms'

function closeStore(store: Store): void {
    const db = (store as unknown as { db: Database }).db
    db.close()
}

function createTestApp(store: Store, getSyncEngine: () => SyncEngine | null = () => null) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/', createSwarmsRoutes(store, getSyncEngine))
    return app
}

describe('swarm routes', () => {
    it('records first-class effects and exposes them in detail payload', async () => {
        const store = new Store(':memory:')
        const app = createTestApp(store)
        const createResponse = await app.request('http://localhost/swarms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Effects Test' })
        })
        const createPayload = await createResponse.json() as { swarm: { swarm: { id: string } } }
        const swarmId = createPayload.swarm.swarm.id

        const response = await app.request(`http://localhost/swarms/${swarmId}/effects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                kind: 'file_change',
                summary: 'Updated src/a.ts',
                data: { path: 'src/a.ts' }
            })
        })
        expect(response.status).toBe(201)
        const created = await response.json() as { effect: { id: string }, event: { type: string } }
        expect(created.effect.id).toBeTruthy()
        expect(created.event.type).toBe('tool-effect:file_change')

        const detailResponse = await app.request(`http://localhost/swarms/${swarmId}`)
        expect(detailResponse.status).toBe(200)
        const detail = await detailResponse.json() as { swarm: { effects: Array<{ kind: string }>, activities: Array<{ kind: string }> } }
        expect(detail.swarm.effects.some((item) => item.kind === 'file_change')).toBe(true)
        expect(detail.swarm.activities.some((item) => item.kind === 'implement')).toBe(true)

        closeStore(store)
    })

    it('projects permission effects into question outcomes', async () => {
        const store = new Store(':memory:')
        const app = createTestApp(store)
        const createResponse = await app.request('http://localhost/swarms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Permission Test' })
        })
        const createPayload = await createResponse.json() as { swarm: { swarm: { id: string } } }
        const swarmId = createPayload.swarm.swarm.id

        const response = await app.request(`http://localhost/swarms/${swarmId}/effects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                kind: 'permission',
                summary: 'Need approval to run tests',
                data: { tool: 'run_tests' }
            })
        })
        expect(response.status).toBe(201)

        const detailResponse = await app.request(`http://localhost/swarms/${swarmId}`)
        const detail = await detailResponse.json() as { swarm: { outcomes: Array<{ kind: string, content: unknown }> } }
        expect(detail.swarm.outcomes.some((item) => item.kind === 'question')).toBe(true)

        closeStore(store)
    })

    it('applies role profile tool guidance in detail payload without mutating stored data', async () => {
        const store = new Store(':memory:')
        const app = createTestApp(store)
        const createResponse = await app.request('http://localhost/swarms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Role Upgrade Test' })
        })
        const createPayload = await createResponse.json() as { swarm: { swarm: { id: string } } }
        const swarmId = createPayload.swarm.swarm.id
        const planner = store.swarms.getSwarmRoleProfiles(swarmId, 'default').find((item) => item.role === 'planner')
        expect(planner).toBeTruthy()
        store.swarms.updateSwarmRoleProfile({
            swarmId,
            namespace: 'default',
            roleProfileId: planner!.id,
            instructionText: 'Clarify goal only.'
        })

        const response = await app.request(`http://localhost/swarms/${swarmId}`)
        expect(response.status).toBe(200)
        const detail = await response.json() as { swarm: { roleProfiles: Array<{ role: string, instructionText: string | null }> } }
        const updatedPlanner = detail.swarm.roleProfiles.find((item) => item.role === 'planner')
        expect(updatedPlanner?.instructionText).toContain('record_outcome')
        const storedPlanner = store.swarms.getSwarmRoleProfiles(swarmId, 'default').find((item) => item.role === 'planner')
        expect(storedPlanner?.instructionText).toBe('Clarify goal only.')

        closeStore(store)
    })

    it('serializes concurrent auto-plan requests and avoids duplicate work items', async () => {
        const store = new Store(':memory:')
        const fakeEngine = {
            async listSkills() {
                await new Promise((resolve) => setTimeout(resolve, 10))
                return {
                    success: true as const,
                    skills: [{ name: 'implement-change', description: 'Implement code changes' }]
                }
            }
        } as unknown as SyncEngine
        const app = createTestApp(store, () => fakeEngine)
        const createResponse = await app.request('http://localhost/swarms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                title: 'Concurrent Plan Test',
                subject: {
                    summary: '- split api layer\n- add tests'
                }
            })
        })
        const createPayload = await createResponse.json() as { swarm: { swarm: { id: string } } }
        const swarmId = createPayload.swarm.swarm.id

        const participantResponse = await app.request(`http://localhost/swarms/${swarmId}/participants`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                kind: 'agent',
                refId: 'session-1',
                availability: 'active',
                capabilities: ['coding', 'testing']
            })
        })
        expect(participantResponse.status).toBe(201)

        const [first, second] = await Promise.all([
            app.request(`http://localhost/swarms/${swarmId}/plan`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ dispatch: false })
            }),
            app.request(`http://localhost/swarms/${swarmId}/plan`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ dispatch: false })
            })
        ])
        expect(first.status).toBe(201)
        expect(second.status).toBe(201)

        const detailResponse = await app.request(`http://localhost/swarms/${swarmId}`)
        expect(detailResponse.status).toBe(200)
        const detail = await detailResponse.json() as {
            swarm: {
                workItems: Array<unknown>
                activities: Array<{ kind: string }>
                threadEntries: Array<{ kind: string }>
            }
        }
        expect(detail.swarm.workItems).toHaveLength(2)
        expect(detail.swarm.activities.filter((item) => item.kind === 'plan')).toHaveLength(1)
        expect(detail.swarm.threadEntries.filter((item) => item.kind === 'proposal')).toHaveLength(2)

        closeStore(store)
    })

    it('keeps policy-triggered blocker escalation idempotent across repeated runs', async () => {
        const store = new Store(':memory:')
        const app = createTestApp(store)
        const createResponse = await app.request('http://localhost/swarms', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                title: 'Policy Idempotency Test',
                subject: {
                    summary: 'Unblock one stuck work item'
                }
            })
        })
        const createPayload = await createResponse.json() as { swarm: { swarm: { id: string } } }
        const swarmId = createPayload.swarm.swarm.id

        const workItemResponse = await app.request(`http://localhost/swarms/${swarmId}/work-items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                title: 'Reviewed change',
                intent: 'Recover blocked execution',
                status: 'blocked'
            })
        })
        expect(workItemResponse.status).toBe(201)

        const firstRun = await app.request(`http://localhost/swarms/${swarmId}/policies/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })
        const secondRun = await app.request(`http://localhost/swarms/${swarmId}/policies/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })
        expect(firstRun.status).toBe(200)
        expect(secondRun.status).toBe(200)

        const detailResponse = await app.request(`http://localhost/swarms/${swarmId}`)
        expect(detailResponse.status).toBe(200)
        const detail = await detailResponse.json() as {
            swarm: {
                threadEntries: Array<{ kind: string }>
                threads: Array<{ kind: string }>
            }
        }
        expect(detail.swarm.threadEntries.filter((item) => item.kind === 'blocker')).toHaveLength(1)
        expect(detail.swarm.threads.filter((item) => item.kind === 'blocker')).toHaveLength(1)

        closeStore(store)
    })
})
