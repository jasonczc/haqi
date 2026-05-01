import { describe, it, expect } from 'vitest'
import { request } from 'node:http'
import { startHookServer, type SessionHookData } from './startHookServer'
import { CLAUDE_HOOK_EVENTS } from '@/claude/hooks'

const sendHookRequest = async (port: number, body: string, token?: string): Promise<{ statusCode?: number; body: string }> => {
    return await new Promise((resolve, reject) => {
        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
        if (token) {
            headers['x-hapi-hook-token'] = token
        }

        const req = request({
            host: '127.0.0.1',
            port,
            path: '/hook/claude',
            method: 'POST',
            headers
        }, (res) => {
            const chunks: Buffer[] = []
            res.on('data', (chunk) => chunks.push(chunk as Buffer))
            res.on('error', reject)
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf-8')
                })
            })
        })

        req.on('error', reject)
        req.end(body)
    })
}

describe('startHookServer', () => {
    it('forwards session hook payload to callback', async () => {
        let received: { sessionId?: string; data?: SessionHookData } = {}
        const server = await startHookServer({
            onClaudeHook: (sessionId, data) => {
                received = { sessionId, data }
            }
        })

        try {
            const body = JSON.stringify({ session_id: 'session-123', hook_event_name: 'SessionStart', source: 'startup' })
            const response = await sendHookRequest(server.port, body, server.token)
            expect(response.statusCode).toBe(200)
            expect(response.body).toBe(JSON.stringify({ exit_code: 0 }))
        } finally {
            server.stop()
        }

        expect(received.sessionId).toBe('session-123')
        expect(received.data?.session_id).toBe('session-123')
    })


    it('serializes hook callback responses for the forwarder', async () => {
        const server = await startHookServer({
            onClaudeHook: () => ({
                exit_code: 2,
                stdout: JSON.stringify({ continue: false }),
                stderr: 'blocked by HAQI'
            })
        })

        try {
            const body = JSON.stringify({ session_id: 'session-123', hook_event_name: 'Notification', message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
            const response = await sendHookRequest(server.port, body, server.token)
            expect(response.statusCode).toBe(200)
            expect(JSON.parse(response.body)).toEqual({
                exit_code: 2,
                stdout: JSON.stringify({ continue: false }),
                stderr: 'blocked by HAQI'
            })
        } finally {
            server.stop()
        }
    })



    it('accepts every Claude Code hook event shape HAQI registers', async () => {
        const receivedEvents: string[] = []
        const server = await startHookServer({
            onClaudeHook: (_sessionId, data) => {
                receivedEvents.push(data.hook_event_name)
            }
        })

        const base = { session_id: 'session-123' }
        const payloads: Record<string, Record<string, unknown>> = {
            PreToolUse: { tool_name: 'Bash', tool_input: {}, tool_use_id: 'tool-1' },
            PostToolUse: { tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'tool-1' },
            PostToolUseFailure: { tool_name: 'Bash', tool_input: {}, tool_use_id: 'tool-1', error: 'failed' },
            Notification: { message: 'Claude is waiting for your input', notification_type: 'idle_prompt' },
            UserPromptSubmit: { prompt: 'hello' },
            SessionStart: { source: 'startup' },
            SessionEnd: { reason: 'other' },
            Stop: { stop_hook_active: false },
            StopFailure: { error: 'unknown' },
            SubagentStart: { agent_id: 'agent-1', agent_type: 'general-purpose' },
            SubagentStop: { agent_id: 'agent-1', agent_type: 'general-purpose', agent_transcript_path: '/tmp/agent.jsonl', stop_hook_active: false },
            PreCompact: { trigger: 'manual', custom_instructions: null },
            PostCompact: { trigger: 'manual', compact_summary: 'summary' },
            PermissionRequest: { tool_name: 'Bash', tool_input: {} },
            PermissionDenied: { tool_name: 'Bash', tool_input: {}, tool_use_id: 'tool-1', reason: 'denied' },
            Setup: { trigger: 'init' },
            TeammateIdle: { teammate_name: 'reviewer', team_name: 'team' },
            TaskCreated: { task_id: 'task-1', task_subject: 'review', team_name: 'team' },
            TaskCompleted: { task_id: 'task-1', task_subject: 'review', team_name: 'team' },
            Elicitation: { mcp_server_name: 'server', message: 'choose', mode: 'form' },
            ElicitationResult: { mcp_server_name: 'server', action: 'accept', content: {} },
            ConfigChange: { source: 'user_settings' },
            WorktreeCreate: { name: 'feature' },
            WorktreeRemove: { worktree_path: '/tmp/worktree' },
            InstructionsLoaded: { file_path: '/tmp/AGENTS.md', memory_type: 'Project', load_reason: 'session_start' },
            CwdChanged: { old_cwd: '/tmp/a', new_cwd: '/tmp/b' },
            FileChanged: { file_path: '/tmp/file.ts', event: 'change' }
        }

        try {
            for (const eventName of CLAUDE_HOOK_EVENTS) {
                const response = await sendHookRequest(
                    server.port,
                    JSON.stringify({ ...base, hook_event_name: eventName, ...payloads[eventName] }),
                    server.token
                )
                expect(response.statusCode, eventName).toBe(200)
            }
        } finally {
            server.stop()
        }

        expect(receivedEvents).toEqual([...CLAUDE_HOOK_EVENTS])
    })

    it('returns 400 for invalid JSON payloads', async () => {
        let hookCalled = false
        const server = await startHookServer({
            onClaudeHook: () => {
                hookCalled = true
            }
        })

        try {
            const response = await sendHookRequest(server.port, '{"session_id":', server.token)
            expect(response.statusCode).toBe(400)
            expect(response.body).toBe('invalid json')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })

    it('returns 422 when session_id is missing', async () => {
        let hookCalled = false
        const server = await startHookServer({
            onClaudeHook: () => {
                hookCalled = true
            }
        })

        try {
            const body = JSON.stringify({ extra: 'ok' })
            const response = await sendHookRequest(server.port, body, server.token)
            expect(response.statusCode).toBe(422)
            expect(response.body).toBe('invalid hook payload')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })

    it('returns 401 when hook token is missing', async () => {
        let hookCalled = false
        const server = await startHookServer({
            onClaudeHook: () => {
                hookCalled = true
            }
        })

        try {
            const body = JSON.stringify({ session_id: 'session-123', hook_event_name: 'SessionStart', source: 'startup' })
            const response = await sendHookRequest(server.port, body)
            expect(response.statusCode).toBe(401)
            expect(response.body).toBe('unauthorized')
        } finally {
            server.stop()
        }

        expect(hookCalled).toBe(false)
    })
})
