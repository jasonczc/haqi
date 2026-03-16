import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import type { AgentStateRunningAgent } from '@/types/api'
import {
    formatRunningAgentNames,
    formatTaskChildStateSummary,
    getRunningAgentsForTaskBlock,
    getTaskChildStateSummary
} from './taskSummary'

function childTool(id: string, state: ToolCallBlock['tool']['state']): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        tool: {
            id,
            name: 'Bash',
            state,
            input: {},
            createdAt: 1,
            startedAt: 1,
            completedAt: null,
            description: null
        },
        children: []
    }
}

describe('taskSummary', () => {
    it('counts child tool states for Task blocks', () => {
        const block: ToolCallBlock = {
            kind: 'tool-call',
            id: 'task-root',
            localId: null,
            createdAt: 1,
            tool: {
                id: 'task-root',
                name: 'Task',
                state: 'running',
                input: {},
                createdAt: 1,
                startedAt: 1,
                completedAt: null,
                description: null
            },
            children: [
                childTool('c1', 'running'),
                childTool('c2', 'pending'),
                childTool('c3', 'completed'),
                childTool('c4', 'error')
            ]
        }

        expect(getTaskChildStateSummary(block)).toEqual({
            running: 1,
            pending: 1,
            completed: 1,
            error: 1,
            total: 4
        })
        expect(formatTaskChildStateSummary(getTaskChildStateSummary(block))).toBe('1 running · 1 waiting · 1 done · 1 failed')
    })

    it('maps running agents to the exact Task block by toolUseId', () => {
        const block: ToolCallBlock = {
            kind: 'tool-call',
            id: 'task-root',
            localId: null,
            createdAt: 1,
            tool: {
                id: 'task-root',
                name: 'Task',
                state: 'running',
                input: {},
                createdAt: 1,
                startedAt: 1,
                completedAt: null,
                description: null
            },
            children: []
        }
        const runningAgents: AgentStateRunningAgent[] = [
            { name: 'test-appserver', toolUseId: 'task-root', startedAt: 1 },
            { name: 'test-launcher', toolUseId: 'task-root', startedAt: 2 },
            { name: 'other-agent', toolUseId: 'task-other', startedAt: 3 }
        ]

        const mapped = getRunningAgentsForTaskBlock(block, runningAgents)
        expect(mapped.map((agent) => agent.name)).toEqual(['test-appserver', 'test-launcher'])
        expect(formatRunningAgentNames(mapped)).toBe('test-appserver · test-launcher')
    })
})
