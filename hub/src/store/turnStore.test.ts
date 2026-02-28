import { describe, expect, it } from 'bun:test'

import { Store } from './index'

function makeUserMessage(text: string): unknown {
    return {
        role: 'user',
        content: {
            type: 'text',
            text
        }
    }
}

function makeAgentTextMessage(text: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [
                        {
                            type: 'text',
                            text
                        }
                    ]
                }
            }
        }
    }
}

function makeCodexMessage(data: Record<string, unknown>): unknown {
    return {
        role: 'agent',
        content: {
            type: 'codex',
            data
        }
    }
}

describe('TurnStore projection', () => {
    it('groups multiple agent chunks into one turn and opens a new turn on next user message', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-test', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('user prompt #1'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #1'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #2'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #3'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #4'))
        store.messages.addMessage(session.id, makeUserMessage('user prompt #2'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(2)

        const first = turns[0]
        expect(first.turnIndex).toBe(1)
        expect(first.status).toBe('closed')
        expect(first.userSeq).toBe(1)
        expect(first.agentStartSeq).toBe(2)
        expect(first.agentEndSeq).toBe(5)
        expect(first.messageCount).toBe(5)
        expect(first.userPreview).toContain('user prompt #1')
        expect(first.assistantPreview).toContain('assistant chunk #1')
        expect(first.assistantPreview).toContain('assistant chunk #2')
        expect(first.assistantPreview).toContain('assistant chunk #3')
        expect(first.assistantPreview).toContain('assistant chunk #4')

        const second = turns[1]
        expect(second.turnIndex).toBe(2)
        expect(second.status).toBe('open')
        expect(second.userSeq).toBe(6)
        expect(second.agentStartSeq).toBeNull()
        expect(second.agentEndSeq).toBeNull()
        expect(second.messageCount).toBe(1)
        expect(second.userPreview).toContain('user prompt #2')
    })

    it('supports agent-only turn before first user turn', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-agent-first', {}, null, 'default')

        store.messages.addMessage(session.id, makeAgentTextMessage('assistant first'))
        store.messages.addMessage(session.id, makeUserMessage('hello user'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(2)

        const first = turns[0]
        expect(first.status).toBe('closed')
        expect(first.userSeq).toBeNull()
        expect(first.agentStartSeq).toBe(1)
        expect(first.agentEndSeq).toBe(1)

        const second = turns[1]
        expect(second.status).toBe('open')
        expect(second.userSeq).toBe(2)
    })

    it('returns raw turn messages by turn id', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-messages', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('user prompt'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #1'))
        store.messages.addMessage(session.id, makeAgentTextMessage('assistant chunk #2'))

        const turns = store.turns.getTurns(session.id, 20)
        const turn = turns[0]
        const page = store.turns.getTurnMessagesPage(session.id, turn.id, { limit: 50, beforeSeq: null })

        expect(page).not.toBeNull()
        expect(page?.messages.map((message) => message.seq)).toEqual([1, 2, 3])
        expect(page?.page.startSeq).toBe(1)
        expect(page?.page.endSeq).toBe(3)
        expect(page?.page.hasMore).toBe(false)
    })

    it('keeps brief preview on the latest codex final message instead of intermediate events', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-codex-preview', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('summarize changes'))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'tool-call',
            name: 'exec_command',
            callId: 'call_1',
            input: {
                command: 'git status'
            }
        }))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'tool-call-result',
            callId: 'call_1',
            output: {
                stdout: 'M src/file.ts'
            }
        }))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'message',
            message: 'First draft response'
        }))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'message',
            message: 'Final answer from Codex'
        }))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Final answer from Codex')
        expect(turns[0]?.assistantPreview).not.toContain('git status')
        expect(turns[0]?.assistantPreview).not.toContain('First draft response')
    })

    it('rebuild preserves latest codex final preview behavior', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-codex-rebuild', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('check formatting'))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'message',
            message: 'intermediate summary'
        }))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'message',
            message: 'final polished output'
        }))

        store.turns.rebuildSessionTurns(session.id)

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('final polished output')
    })

    it('keeps line breaks in brief previews', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-preserve-newline', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('line-1\nline-2'))
        store.messages.addMessage(session.id, makeAgentTextMessage('answer-1\nanswer-2'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.userPreview).toBe('line-1\nline-2')
        expect(turns[0]?.assistantPreview).toContain('answer-1\nanswer-2')
    })
})
