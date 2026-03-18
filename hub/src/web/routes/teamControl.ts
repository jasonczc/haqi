import { Hono, type Context } from 'hono'
import {
    TeamControlRequestSchema,
    TeamStateSchema,
    type TeamControlRequest,
    type TeamState,
    type TeamTask
} from '@hapi/protocol/schemas'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

type TeamControlPromptOptions = {
    request: TeamControlRequest
    teamState: TeamState
    task?: TeamTask
}

function wrapQuoted(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`
}

export function buildTeamControlPrompt(options: TeamControlPromptOptions): string {
    const { request, teamState, task } = options
    const teamName = teamState.teamName

    switch (request.action) {
        case 'message':
            return [
                `You are coordinating the Claude agent team ${wrapQuoted(teamName)}.`,
                `Send a direct message to teammate ${wrapQuoted(request.memberName!)}.`,
                request.message
                    ? `Message content: ${wrapQuoted(request.message)}.`
                    : 'Ask them to acknowledge and continue.',
                'After sending it, continue coordinating the team and summarize the action briefly.'
            ].join(' ')
        case 'nudge_member':
            return [
                `You are coordinating the Claude agent team ${wrapQuoted(teamName)}.`,
                `Check teammate ${wrapQuoted(request.memberName!)} and nudge them.`,
                request.message
                    ? `Guidance to send: ${wrapQuoted(request.message)}.`
                    : 'If they are idle or stuck, give them a concrete next step. If they already completed the work, summarize the result.',
                'Continue coordinating the rest of the team after that.'
            ].join(' ')
        case 'shutdown_member':
            return [
                `You are coordinating the Claude agent team ${wrapQuoted(teamName)}.`,
                `Ask teammate ${wrapQuoted(request.memberName!)} to shut down gracefully.`,
                'Before shutting down, have them summarize their current status and any unfinished work.'
            ].join(' ')
        case 'assign_task':
            return [
                `You are coordinating the Claude agent team ${wrapQuoted(teamName)}.`,
                `Assign task ${wrapQuoted(request.taskId!)} (${wrapQuoted(task?.title ?? 'Untitled task')}) to teammate ${wrapQuoted(request.memberName!)}.`,
                request.message
                    ? `Additional task guidance: ${wrapQuoted(request.message)}.`
                    : 'If the task is blocked, explain what dependency is missing before reassigning it.',
                'Confirm the assignment in your response.'
            ].join(' ')
        case 'cleanup_team':
            return [
                `You are coordinating the Claude agent team ${wrapQuoted(teamName)}.`,
                'Clean up the team now.',
                'If any teammates are still active, stop them gracefully first, then clean up shared team resources.',
                'Report any teammate that could not be stopped.'
            ].join(' ')
    }

    throw new Error(`Unsupported team control action: ${String(request.action)}`)
}

function invalidActionResponse(c: Context<WebAppEnv>, error: string) {
    return c.json({ ok: false, error, code: 'invalid_action' as const }, 400)
}

export function createTeamControlRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/sessions/:id/team/control', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            const status = sessionResult.status
            if (status === 409) {
                return c.json({
                    ok: false,
                    error: 'Session is inactive',
                    code: 'session_not_active'
                }, 409)
            }
            return sessionResult
        }

        const flavor = sessionResult.session.metadata?.flavor
        if (flavor !== 'claude') {
            return c.json({
                ok: false,
                error: 'Team control is only available for Claude sessions',
                code: 'not_claude_session'
            }, 400)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = TeamControlRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ ok: false, error: 'Invalid body', code: 'invalid_action' }, 400)
        }

        const teamStateResult = TeamStateSchema.safeParse(sessionResult.session.teamState)
        if (!teamStateResult.success) {
            return c.json({
                ok: false,
                error: 'No Claude team is currently available for this session',
                code: 'team_not_found'
            }, 409)
        }

        const teamState = teamStateResult.data
        const request = parsed.data

        const memberNameRequired = request.action === 'message'
            || request.action === 'shutdown_member'
            || request.action === 'assign_task'
            || request.action === 'nudge_member'

        if (memberNameRequired && !request.memberName) {
            return invalidActionResponse(c, 'memberName is required for this action')
        }

        const taskIdRequired = request.action === 'assign_task'
        if (taskIdRequired && !request.taskId) {
            return invalidActionResponse(c, 'taskId is required for assign_task')
        }

        if ((request.action === 'message' || request.action === 'nudge_member') && !request.message) {
            return invalidActionResponse(c, 'message is required for this action')
        }

        const member = request.memberName
            ? (teamState.members ?? []).find((candidate) => candidate.name === request.memberName)
            : null
        if (memberNameRequired && !member) {
            return c.json({ ok: false, error: 'Teammate not found', code: 'member_not_found' }, 404)
        }

        const task = request.taskId
            ? (teamState.tasks ?? []).find((candidate) => candidate.id === request.taskId)
            : undefined
        if (taskIdRequired && !task) {
            return c.json({ ok: false, error: 'Task not found', code: 'task_not_found' }, 404)
        }

        const prompt = buildTeamControlPrompt({
            request,
            teamState,
            task
        })

        await engine.sendMessage(sessionResult.sessionId, {
            text: prompt,
            sentFrom: 'webapp',
            meta: {
                teamControl: {
                    action: request.action,
                    memberName: request.memberName,
                    taskId: request.taskId,
                    teamName: teamState.teamName
                }
            }
        })

        return c.json({
            ok: true,
            accepted: true,
            mode: 'lead_prompt',
            enqueuedPrompt: prompt
        })
    })

    return app
}
