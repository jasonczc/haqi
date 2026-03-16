import { describe, expect, it } from 'vitest'
import { traceMessages } from './tracer'
import type { NormalizedMessage } from './types'

describe('traceMessages', () => {
    it('attaches sidechain roots by stable Task tool-use id before prompt matching', () => {
        const messages: NormalizedMessage[] = [
            {
                id: 'task-msg',
                localId: null,
                createdAt: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'task-tool-1',
                    name: 'Task',
                    input: { prompt: 'Original prompt text' },
                    description: null,
                    uuid: 'assistant-1',
                    parentUUID: null
                }]
            },
            {
                id: 'sidechain-root',
                localId: null,
                createdAt: 2,
                role: 'agent',
                isSidechain: true,
                content: [{
                    type: 'sidechain',
                    uuid: 'sidechain-uuid',
                    prompt: 'Mutated prompt text',
                    toolUseId: 'task-tool-1'
                }]
            }
        ]

        const traced = traceMessages(messages)
        const sidechainRoot = traced.find((message) => message.id === 'sidechain-root')
        expect(sidechainRoot?.sidechainId).toBe('task-msg')
    })
})
