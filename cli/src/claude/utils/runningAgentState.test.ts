import { describe, expect, it } from 'vitest'
import type { AgentStateRunningAgent } from '@/api/types'
import {
    applyRunningAgentStateFromLogMessage,
    extractRunningAgentFromTaskInput,
    reconstructRunningAgentsFromLogMessages
} from './runningAgentState'

describe('runningAgentState helpers', () => {
    it('extracts a running agent from Task tool input', () => {
        expect(extractRunningAgentFromTaskInput({
            name: 'test-launcher',
            prompt: 'Write lifecycle tests'
        }, 'task-1')).toMatchObject({
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-1'
        })
    })

    it('reconstructs currently running task agents from transcript messages', () => {
        const runningAgents = reconstructRunningAgentsFromLogMessages([
            {
                type: 'assistant',
                uuid: 'assistant-1',
                message: {
                    role: 'assistant',
                    content: [{
                        type: 'tool_use',
                        id: 'task-1',
                        name: 'Task',
                        input: {
                            name: 'test-appserver',
                            prompt: 'Write converter tests'
                        }
                    }]
                }
            },
            {
                type: 'assistant',
                uuid: 'assistant-2',
                message: {
                    role: 'assistant',
                    content: [{
                        type: 'tool_use',
                        id: 'task-2',
                        name: 'Task',
                        input: {
                            name: 'test-launcher',
                            prompt: 'Write lifecycle tests'
                        }
                    }]
                }
            },
            {
                type: 'user',
                uuid: 'user-1',
                message: {
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: 'task-1',
                        content: 'done'
                    }]
                }
            }
        ])

        expect([...runningAgents.keys()]).toEqual(['task-2'])
        expect(runningAgents.get('task-2')).toMatchObject({
            name: 'test-launcher',
            task: 'Write lifecycle tests',
            toolUseId: 'task-2'
        })
    })

    it('applies incremental task completion updates', () => {
        const runningAgents = new Map<string, AgentStateRunningAgent>()

        const changed = applyRunningAgentStateFromLogMessage(runningAgents, {
            type: 'assistant',
            uuid: 'assistant-1',
            message: {
                role: 'assistant',
                content: [{
                    type: 'tool_use',
                    id: 'task-1',
                    name: 'Task',
                    input: {
                        name: 'test-appserver'
                    }
                }]
            }
        })
        expect(changed).toBe(true)
        expect(runningAgents.size).toBe(1)

        const cleared = applyRunningAgentStateFromLogMessage(runningAgents, {
            type: 'user',
            uuid: 'user-1',
            message: {
                role: 'user',
                content: [{
                    type: 'tool_result',
                    tool_use_id: 'task-1',
                    content: 'done'
                }]
            }
        })
        expect(cleared).toBe(true)
        expect(runningAgents.size).toBe(0)
    })
})
