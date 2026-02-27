import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from './reducer'
import type { NormalizedMessage } from './types'

function createUsageMessage(usage: NonNullable<NormalizedMessage['usage']>): NormalizedMessage {
    return {
        id: 'm1',
        localId: null,
        createdAt: 1_700_000_000_000,
        role: 'agent',
        isSidechain: false,
        content: [],
        usage
    }
}

describe('reduceChatBlocks usage context size', () => {
    it('uses input tokens as codex context size (no cached double count)', () => {
        const normalized = [
            createUsageMessage({
                input_tokens: 120_000,
                output_tokens: 1_000,
                cache_read_input_tokens: 119_000,
                context_window_tokens: 258_400
            })
        ]

        const reduced = reduceChatBlocks(normalized, null, 'codex')
        expect(reduced.latestUsage?.contextSize).toBe(120_000)
        expect(reduced.latestUsage?.contextWindowTokens).toBe(258_400)
    })

    it('keeps legacy context size strategy for non-codex', () => {
        const normalized = [
            createUsageMessage({
                input_tokens: 10_000,
                output_tokens: 500,
                cache_read_input_tokens: 4_000,
                cache_creation_input_tokens: 3_000
            })
        ]

        const reduced = reduceChatBlocks(normalized, null, 'claude')
        expect(reduced.latestUsage?.contextSize).toBe(17_000)
    })
})
