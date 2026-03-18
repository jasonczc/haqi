import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTeamControlRoutes, buildTeamControlPrompt } from './teamControl'

function createAuthedApp(getSyncEngine: () => unknown) {
    const app = new Hono<{ Variables: { namespace: string } }>()
    app.use('/api/*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createTeamControlRoutes(getSyncEngine as never))
    return app
}

describe('buildTeamControlPrompt', () => {
    const teamState = {
        teamName: 'demo-team',
        members: [{ name: 'researcher' }],
        tasks: [{ id: 'task-1', title: 'Trace auth bug' }]
    }

    it('builds an assignment prompt with task title and teammate', () => {
        const prompt = buildTeamControlPrompt({
            request: {
                action: 'assign_task',
                memberName: 'researcher',
                taskId: 'task-1',
                message: 'Focus on the auth middleware first.'
            },
            teamState,
            task: teamState.tasks[0]
        })

        expect(prompt).toContain('Assign task "task-1"')
        expect(prompt).toContain('researcher')
        expect(prompt).toContain('Trace auth bug')
        expect(prompt).toContain('Focus on the auth middleware first.')
    })
})

describe('createTeamControlRoutes', () => {
    it('validates member lookup before sending', async () => {
        const sendMessage = mock(async () => {})
        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: {
                    id: 'session-1',
                    active: true,
                    metadata: { flavor: 'claude' },
                    teamState: {
                        teamName: 'demo-team',
                        members: [{ name: 'builder' }],
                        tasks: []
                    }
                }
            }),
            sendMessage
        }))

        const response = await app.request('http://localhost/api/sessions/session-1/team/control', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'shutdown_member',
                memberName: 'missing'
            })
        })

        expect(response.status).toBe(404)
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('enqueues a lead prompt for valid message actions', async () => {
        const sendMessage = mock(async () => {})
        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: {
                    id: 'session-1',
                    active: true,
                    metadata: { flavor: 'claude' },
                    teamState: {
                        teamName: 'demo-team',
                        members: [{ name: 'researcher' }],
                        tasks: []
                    }
                }
            }),
            sendMessage
        }))

        const response = await app.request('http://localhost/api/sessions/session-1/team/control', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'message',
                memberName: 'researcher',
                message: 'Please review the failing tests.'
            })
        })

        expect(response.status).toBe(200)
        expect(sendMessage).toHaveBeenCalledTimes(1)
        const firstCall = sendMessage.mock.calls.at(0)
        if (!firstCall) {
            throw new Error('Expected sendMessage to be called')
        }
        const [sessionId, payload] = firstCall as unknown as [string, { text: string; meta?: { teamControl?: unknown } }]
        expect(sessionId).toBe('session-1')
        expect(payload.text).toContain('Please review the failing tests.')
        expect(payload.meta?.teamControl).toEqual({
            action: 'message',
            memberName: 'researcher',
            taskId: undefined,
            teamName: 'demo-team'
        })
    })

    it('rejects non-claude sessions', async () => {
        const sendMessage = mock(async () => {})
        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: {
                    id: 'session-1',
                    active: true,
                    metadata: { flavor: 'codex' },
                    teamState: {
                        teamName: 'demo-team',
                        members: [{ name: 'researcher' }],
                        tasks: []
                    }
                }
            }),
            sendMessage
        }))

        const response = await app.request('http://localhost/api/sessions/session-1/team/control', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'cleanup_team'
            })
        })

        expect(response.status).toBe(400)
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('rejects missing task id for assignment', async () => {
        const sendMessage = mock(async () => {})
        const app = createAuthedApp(() => ({
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: {
                    id: 'session-1',
                    active: true,
                    metadata: { flavor: 'claude' },
                    teamState: {
                        teamName: 'demo-team',
                        members: [{ name: 'researcher' }],
                        tasks: [{ id: 'task-1', title: 'Trace auth bug' }]
                    }
                }
            }),
            sendMessage
        }))

        const response = await app.request('http://localhost/api/sessions/session-1/team/control', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'assign_task',
                memberName: 'researcher'
            })
        })

        expect(response.status).toBe(400)
        expect(sendMessage).not.toHaveBeenCalled()
    })
})
