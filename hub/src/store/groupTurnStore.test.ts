import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('Group turn projection', () => {
    it('groups initiator message with subsequent responder updates', () => {
        const store = new Store(':memory:')
        const group = store.groups.createGroup({
            namespace: 'default',
            name: 'Group turn test'
        })

        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'command',
            source: 'user:web',
            payload: { text: '@all run task' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'session:agent-1',
            actorSessionId: 'agent-1',
            payload: { text: 'step-1' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'session:agent-1',
            actorSessionId: 'agent-1',
            payload: { text: 'step-2' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'session:agent-1',
            actorSessionId: 'agent-1',
            payload: { text: 'step-3' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'user:web',
            payload: { text: 'next command' }
        })

        const turns = store.groups.getConversationTurns(group.id, 'default', 20)
        expect(turns).toHaveLength(2)

        const first = turns[0]
        expect(first.turnIndex).toBe(1)
        expect(first.status).toBe('closed')
        expect(first.initiatorSeq).toBe(1)
        expect(first.responderStartSeq).toBe(2)
        expect(first.responderEndSeq).toBe(4)
        expect(first.messageCount).toBe(4)
        expect(first.initiatorPreview).toContain('@all run task')
        expect(first.responderPreview).toContain('step-1')
        expect(first.responderPreview).toContain('step-2')
        expect(first.responderPreview).toContain('step-3')

        const second = turns[1]
        expect(second.turnIndex).toBe(2)
        expect(second.status).toBe('open')
        expect(second.initiatorSeq).toBe(5)
        expect(second.responderStartSeq).toBeNull()
        expect(second.responderEndSeq).toBeNull()
    })

    it('returns messages page for a group turn', () => {
        const store = new Store(':memory:')
        const group = store.groups.createGroup({
            namespace: 'default',
            name: 'Group turn messages'
        })

        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'user:web',
            payload: { text: 'question' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'session:agent-1',
            actorSessionId: 'agent-1',
            payload: { text: 'answer-1' }
        })
        store.groups.addGroupMessage({
            groupId: group.id,
            namespace: 'default',
            type: 'chat',
            source: 'session:agent-1',
            actorSessionId: 'agent-1',
            payload: { text: 'answer-2' }
        })

        const turn = store.groups.getConversationTurns(group.id, 'default', 1)[0]
        const page = store.groups.getConversationTurnMessagesPage(group.id, 'default', turn.id, {
            limit: 50,
            beforeSeq: null
        })

        expect(page).not.toBeNull()
        expect(page?.messages.map((message) => message.seq)).toEqual([1, 2, 3])
        expect(page?.page.startSeq).toBe(1)
        expect(page?.page.endSeq).toBe(3)
        expect(page?.page.hasMore).toBe(false)
    })
})
