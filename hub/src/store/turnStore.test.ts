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

function makeAgentThinkingAndTextMessage(thinking: string, text: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [
                        { type: 'thinking', thinking },
                        { type: 'text', text }
                    ]
                }
            }
        }
    }
}

function makeAgentThinkingOnlyMessage(thinking: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [
                        { type: 'thinking', thinking }
                    ]
                }
            }
        }
    }
}

function makeAgentToolUseMessage(name: string, input: Record<string, unknown>): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [
                        { type: 'tool_use', id: 'tool_1', name, input }
                    ]
                }
            }
        }
    }
}

// Claude tool results arrive as raw JSONL `type: 'user'` records that the CLI
// wraps in an agent `output` envelope; their content is tool output, not
// assistant text.
function makeToolResultMessage(text: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'user',
                message: {
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: 'tool_1',
                            content: text
                        }
                    ]
                },
                toolUseResult: text,
                isSidechain: false
            }
        }
    }
}

function makeSidechainAgentTextMessage(text: string): unknown {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: {
                type: 'assistant',
                isSidechain: true,
                message: {
                    role: 'assistant',
                    content: [
                        { type: 'text', text }
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
        // Each assistant message is a complete final response; brief preview keeps
        // only the latest segment instead of concatenating intermediate narration.
        expect(first.assistantPreview).toBe('assistant chunk #4')

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

    it('keeps brief preview on the latest claude text message instead of intermediate narration', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-preview', {}, null, 'default')

        // Real Claude turn shape: narration text, a tool call, then the final answer
        // are each stored as their own complete assistant message.
        store.messages.addMessage(session.id, makeUserMessage('list the files'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Let me check the directory.'))
        store.messages.addMessage(session.id, makeAgentToolUseMessage('LS', { path: '.' }))
        store.messages.addMessage(session.id, makeAgentTextMessage('Here are the files:\nreadme.md'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Here are the files:\nreadme.md')
        expect(turns[0]?.assistantPreview).not.toContain('Let me check the directory.')
    })

    it('rebuild keeps brief preview on the latest claude text message', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-rebuild', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('list the files'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Let me check the directory.'))
        store.messages.addMessage(session.id, makeAgentToolUseMessage('LS', { path: '.' }))
        store.messages.addMessage(session.id, makeAgentTextMessage('Here are the files:\nreadme.md'))

        store.turns.rebuildSessionTurns(session.id)

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Here are the files:\nreadme.md')
    })

    it('does not leak claude tool_result content into assistant preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-tool-result', {}, null, 'default')

        const toolOutput = "351 message: 'execute approved plan',\n>>>>>>> Stashed changes"
        store.messages.addMessage(session.id, makeUserMessage('fix the test'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Let me read the file.'))
        store.messages.addMessage(session.id, makeToolResultMessage(toolOutput))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Let me read the file.')
        expect(turns[0]?.assistantPreview).not.toContain('Stashed changes')
    })

    it('rebuild does not leak claude tool_result content into assistant preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-tool-result-rebuild', {}, null, 'default')

        const toolOutput = "351 message: 'execute approved plan',\n>>>>>>> Stashed changes"
        store.messages.addMessage(session.id, makeUserMessage('fix the test'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Let me read the file.'))
        store.messages.addMessage(session.id, makeToolResultMessage(toolOutput))
        store.messages.addMessage(session.id, makeAgentTextMessage('Done, fixed the test.'))

        store.turns.rebuildSessionTurns(session.id)

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Done, fixed the test.')
        expect(turns[0]?.assistantPreview).not.toContain('Stashed changes')
    })

    it('does not surface sidechain assistant text as the turn preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-sidechain', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('research this'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Spawning a sub-agent.'))
        store.messages.addMessage(session.id, makeSidechainAgentTextMessage('Sub-agent internal result dump'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Spawning a sub-agent.')
        expect(turns[0]?.assistantPreview).not.toContain('Sub-agent internal')
    })

    it('keeps previous claude preview when the final message is a tool call only', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-claude-trailing-tool', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('do work'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Final summary of the work.'))
        store.messages.addMessage(session.id, makeAgentToolUseMessage('LS', { path: '.' }))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Final summary of the work.')
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

    it('preserves nested markdown list indentation within the final assistant message', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-preserve-list-indent', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('show steps'))
        store.messages.addMessage(session.id, makeAgentTextMessage('1. Parent\n   - Child\n2. Next'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('1. Parent\n   - Child\n2. Next')
    })

    it('rebuild preserves nested markdown list indentation within the final assistant message', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-rebuild-list-indent', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('show steps'))
        store.messages.addMessage(session.id, makeAgentTextMessage('1. Parent\n   - Child\n2. Next'))

        store.turns.rebuildAllTurns()

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('1. Parent\n   - Child\n2. Next')
    })

    it('excludes reasoning blocks from assistant preview when text is also present', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-reasoning-with-text', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('explain something'))
        store.messages.addMessage(session.id, makeAgentThinkingAndTextMessage(
            'Let me think about this step by step...',
            'Here is the actual answer.'
        ))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Here is the actual answer.')
        expect(turns[0]?.assistantPreview).not.toContain('step by step')
    })

    it('does not add reasoning-only messages to assistant preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-reasoning-only', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('think about it'))
        store.messages.addMessage(session.id, makeAgentThinkingOnlyMessage('Internal reasoning only'))
        store.messages.addMessage(session.id, makeAgentTextMessage('Final response'))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Final response')
        expect(turns[0]?.assistantPreview).not.toContain('Internal reasoning')
    })

    it('excludes codex reasoning messages from assistant preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-codex-reasoning', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('do something'))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'reasoning',
            message: 'Codex internal reasoning'
        }))
        store.messages.addMessage(session.id, makeCodexMessage({
            type: 'message',
            message: 'Codex final answer'
        }))

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('Codex final answer')
        expect(turns[0]?.assistantPreview).not.toContain('internal reasoning')
    })

    it('rebuild excludes reasoning blocks from assistant preview', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('turn-rebuild-reasoning', {}, null, 'default')

        store.messages.addMessage(session.id, makeUserMessage('explain'))
        store.messages.addMessage(session.id, makeAgentThinkingAndTextMessage(
            'Deep reasoning here...',
            'The answer is 42.'
        ))

        store.turns.rebuildAllTurns()

        const turns = store.turns.getTurns(session.id, 20)
        expect(turns).toHaveLength(1)
        expect(turns[0]?.assistantPreview).toBe('The answer is 42.')
        expect(turns[0]?.assistantPreview).not.toContain('Deep reasoning')
    })
})
