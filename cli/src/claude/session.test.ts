import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Session } from './session'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { AgentState } from '@/api/types'
import type { EnhancedMode } from './loop'

type FakeClient = {
    keepAlive: ReturnType<typeof vi.fn>
    updateMetadata: ReturnType<typeof vi.fn>
    updateAgentState: ReturnType<typeof vi.fn>
    updateTeamState: ReturnType<typeof vi.fn>
}

function createSession() {
    let agentState: AgentState = {}
    const client: FakeClient = {
        keepAlive: vi.fn(),
        updateMetadata: vi.fn((handler: (state: Record<string, unknown>) => Record<string, unknown>) => handler({})),
        updateAgentState: vi.fn((handler: (state: AgentState) => AgentState) => {
            agentState = handler(agentState)
            return agentState
        }),
        updateTeamState: vi.fn()
    }

    const session = new Session({
        api: {} as never,
        client: client as never,
        path: '/tmp/project',
        logPath: '/tmp/project.log',
        sessionId: null,
        mcpServers: {},
        messageQueue: new MessageQueue2<EnhancedMode>(() => 'mode'),
        onModeChange: () => {},
        startedBy: 'terminal',
        startingMode: 'remote',
        hookSettingsPath: '/tmp/hook-settings.json'
    })

    return {
        session,
        client,
        getAgentState: () => agentState
    }
}

afterEach(() => {
    vi.useRealTimers()
    delete process.env.CLAUDE_CONFIG_DIR
})

describe('Claude Session running agent state', () => {
    it('keeps the session thinking while a background task agent is running', () => {
        vi.useFakeTimers()
        const { session, client } = createSession()

        client.keepAlive.mockClear()

        session.onThinkingChange(false)
        session.setRunningAgent('task-1', {
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            startedAt: 123
        })

        expect(session.thinking).toBe(true)
        expect(client.keepAlive).toHaveBeenLastCalledWith(true, 'local', undefined)

        session.setRunningAgent('task-1', null)

        expect(session.thinking).toBe(false)
        expect(client.keepAlive).toHaveBeenLastCalledWith(false, 'local', undefined)
        session.stopKeepAlive()
    })

    it('stores the first running agent in agentState', () => {
        const { session, getAgentState } = createSession()

        session.setRunningAgent('task-1', {
            name: 'test-appserver',
            task: 'Write appServer tests',
            toolUseId: 'task-1',
            startedAt: 111
        })

        expect(getAgentState().runningAgent).toEqual({
            name: 'test-appserver',
            task: 'Write appServer tests',
            toolUseId: 'task-1',
            startedAt: 111
        })
        expect(getAgentState().runningAgents).toEqual([{
            name: 'test-appserver',
            task: 'Write appServer tests',
            toolUseId: 'task-1',
            startedAt: 111
        }])

        session.setRunningAgent('task-2', {
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-2',
            startedAt: 222
        })
        expect(getAgentState().runningAgent).toEqual({
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-2',
            startedAt: 222
        })
        expect(getAgentState().runningAgents).toEqual([
            {
                name: 'test-appserver',
                task: 'Write appServer tests',
                toolUseId: 'task-1',
                startedAt: 111
            },
            {
                name: 'test-launcher',
                task: 'Write lifecycle tests',
                toolUseId: 'task-2',
                startedAt: 222
            }
        ])

        session.setRunningAgent('task-1', null)
        expect(getAgentState().runningAgent).toEqual({
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-2',
            startedAt: 222
        })
        expect(getAgentState().runningAgents).toEqual([{
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-2',
            startedAt: 222
        }])

        session.setRunningAgent('task-2', null)
        expect(getAgentState().runningAgent).toBeUndefined()
        expect(getAgentState().runningAgents).toBeUndefined()
        session.stopKeepAlive()
    })

    it('tracks Claude subagents from hooks and clears them on stop', () => {
        const { session, getAgentState, client } = createSession()

        client.keepAlive.mockClear()

        session.applyClaudeHookEvent({
            hook_event_name: 'SubagentStart',
            session_id: 'claude-session-1',
            agent_id: 'agent-1',
            agent_name: 'shared-reviewer',
            task_title: 'Review shared schema changes'
        })

        expect(session.thinking).toBe(true)
        expect(getAgentState().runningAgent).toEqual({
            name: 'shared-reviewer',
            task: 'Review shared schema changes',
            startedAt: expect.any(Number)
        })
        expect(client.updateTeamState).toHaveBeenLastCalledWith({
            teamName: 'Claude Team',
            members: [{
                name: 'shared-reviewer',
                status: 'active'
            }],
            tasks: [],
            updatedAt: expect.any(Number)
        })

        session.applyClaudeHookEvent({
            hook_event_name: 'SubagentStop',
            session_id: 'claude-session-1',
            agent_id: 'agent-1'
        })

        expect(session.thinking).toBe(false)
        expect(getAgentState().runningAgent).toBeUndefined()
        expect(getAgentState().runningAgents).toBeUndefined()
        session.stopKeepAlive()
    })

    it('syncs hook task completion into team state', () => {
        const { session, client } = createSession()

        session.applyClaudeHookEvent({
            hook_event_name: 'SubagentStart',
            session_id: 'claude-session-1',
            agent_id: 'agent-2',
            agent_name: 'cli-reviewer',
            task_id: 'task-7',
            task_title: 'Review cli session hooks'
        })

        session.applyClaudeHookEvent({
            hook_event_name: 'TaskCompleted',
            session_id: 'claude-session-1',
            agent_id: 'agent-2',
            agent_name: 'cli-reviewer',
            task_id: 'task-7',
            task_title: 'Review cli session hooks'
        })

        expect(client.updateTeamState).toHaveBeenLastCalledWith({
            teamName: 'Claude Team',
            members: [{
                name: 'cli-reviewer',
                status: 'idle'
            }],
            tasks: [{
                id: 'task-7',
                title: 'Review cli session hooks',
                owner: 'cli-reviewer',
                status: 'completed'
            }],
            updatedAt: expect.any(Number)
        })
        session.stopKeepAlive()
    })

    it('updates Claude session id from SessionStart hooks', () => {
        const { session, client } = createSession()

        session.applyClaudeHookEvent({
            hook_event_name: 'SessionStart',
            session_id: 'claude-session-42'
        })

        expect(session.sessionId).toBe('claude-session-42')
        expect(client.updateMetadata).toHaveBeenCalled()
        session.stopKeepAlive()
    })

    it('keeps thinking from Claude team snapshot while tasks are in progress', () => {
        const rootDir = mkdtempSync(join(tmpdir(), 'claude-session-snapshot-'))
        process.env.CLAUDE_CONFIG_DIR = rootDir

        mkdirSync(join(rootDir, 'teams', 'demo-team'), { recursive: true })
        mkdirSync(join(rootDir, 'tasks', 'demo-team'), { recursive: true })
        writeFileSync(join(rootDir, 'teams', 'demo-team', 'config.json'), JSON.stringify({
            name: 'demo-team',
            leadSessionId: 'claude-session-99'
        }))
        writeFileSync(join(rootDir, 'tasks', 'demo-team', '1.json'), JSON.stringify({
            id: '1',
            subject: 'web-reviewer',
            description: 'Review web UI',
            status: 'in_progress'
        }))

        try {
            const { session, client } = createSession()
            client.keepAlive.mockClear()

            session.applyClaudeHookEvent({
                hook_event_name: 'SessionStart',
                session_id: 'claude-session-99'
            })

            expect(session.thinking).toBe(true)
            expect(client.updateTeamState).toHaveBeenCalledWith(expect.objectContaining({
                teamName: 'demo-team',
                tasks: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'demo-team:1',
                        status: 'in_progress'
                    })
                ])
            }))
            session.stopKeepAlive()
        } finally {
            rmSync(rootDir, { recursive: true, force: true })
        }
    })
})
