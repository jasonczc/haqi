import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '@/chat/types'
import { findLatestPendingPlanApprovalTool, isExitPlanToolName } from '@/components/ToolCard/exitPlanMode'

describe('exitPlanMode helpers', () => {
    it('matches exit plan tool names', () => {
        expect(isExitPlanToolName('ExitPlanMode')).toBe(true)
        expect(isExitPlanToolName('exit_plan_mode')).toBe(true)
        expect(isExitPlanToolName('request_user_input')).toBe(false)
    })

    it('finds latest pending plan approval tool', () => {
        const blocks: ChatBlock[] = [
            {
                kind: 'tool-call',
                id: 'a',
                localId: null,
                createdAt: 1,
                tool: {
                    id: 'a',
                    name: 'ExitPlanMode',
                    state: 'pending',
                    input: {},
                    createdAt: 1,
                    startedAt: null,
                    completedAt: null,
                    description: null,
                    permission: { id: 'pa', status: 'pending' }
                },
                children: []
            },
            {
                kind: 'tool-call',
                id: 'b',
                localId: null,
                createdAt: 2,
                tool: {
                    id: 'b',
                    name: 'ExitPlanMode',
                    state: 'pending',
                    input: {},
                    createdAt: 2,
                    startedAt: null,
                    completedAt: null,
                    description: null,
                    permission: { id: 'pb', status: 'pending' }
                },
                children: []
            }
        ]

        expect(findLatestPendingPlanApprovalTool(blocks)?.id).toBe('b')
    })
})
