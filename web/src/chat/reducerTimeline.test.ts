import { describe, expect, it } from 'vitest'
import { reduceTimeline } from '@/chat/reducerTimeline'

describe('reduceTimeline', () => {
    it('renders plan-update events as visible assistant markdown text', () => {
        const result = reduceTimeline([
            {
                id: 'msg-plan',
                localId: null,
                createdAt: 1,
                role: 'event',
                content: {
                    type: 'plan-update',
                    explanation: 'Implementation plan',
                    plan: [
                        { step: 'Inspect current flow', status: 'in_progress' },
                        { step: 'Patch approval handling', status: 'pending' }
                    ]
                },
                isSidechain: false
            }
        ], {
            permissionsById: new Map(),
            groups: new Map(),
            consumedGroupIds: new Set(),
            titleChangesByToolUseId: new Map(),
            emittedTitleChangeToolUseIds: new Set()
        })

        expect(result.blocks).toEqual([
            expect.objectContaining({
                kind: 'agent-text',
                text: 'Implementation plan\n- [in_progress] Inspect current flow\n- [pending] Patch approval handling'
            })
        ])
    })
})
