import { describe, expect, it } from 'vitest'
import { normalizeAgentRecord } from './normalizeAgent'

describe('normalizeAgentRecord codex token_count usage', () => {
    it('extracts usage from snake_case last_token_usage payload', () => {
        const normalized = normalizeAgentRecord(
            'message-1',
            null,
            1_700_000_000_000,
            {
                type: 'codex',
                data: {
                    type: 'token_count',
                    info: {
                        last_token_usage: {
                            input_tokens: 100_000,
                            output_tokens: 800,
                            cached_input_tokens: 12_000
                        }
                    }
                }
            }
        )

        expect(normalized).toMatchObject({
            role: 'agent',
            usage: {
                input_tokens: 100_000,
                output_tokens: 800,
                cache_read_input_tokens: 12_000
            }
        })
        expect(normalized?.role === 'agent' ? normalized.content : null).toEqual([])
    })

    it('extracts usage from camelCase token usage payload', () => {
        const normalized = normalizeAgentRecord(
            'message-2',
            null,
            1_700_000_000_001,
            {
                type: 'codex',
                data: {
                    type: 'token_count',
                    info: {
                        lastTokenUsage: {
                            inputTokens: 88_000,
                            outputTokens: 640,
                            cacheReadInputTokens: 4_000,
                            serviceTier: 'default'
                        }
                    }
                }
            }
        )

        expect(normalized).toMatchObject({
            role: 'agent',
            usage: {
                input_tokens: 88_000,
                output_tokens: 640,
                cache_read_input_tokens: 4_000,
                service_tier: 'default'
            }
        })
    })

    it('returns null when token_count payload has no usable usage', () => {
        const normalized = normalizeAgentRecord(
            'message-3',
            null,
            1_700_000_000_002,
            {
                type: 'codex',
                data: {
                    type: 'token_count',
                    info: {}
                }
            }
        )

        expect(normalized).toBeNull()
    })

    it('extracts usage from total_token_usage payload', () => {
        const normalized = normalizeAgentRecord(
            'message-4',
            null,
            1_700_000_000_003,
            {
                type: 'codex',
                data: {
                    type: 'token_count',
                    info: {
                        total_token_usage: {
                            input_tokens: 120_000,
                            output_tokens: 2_000,
                            cached_input_tokens: 20_000
                        }
                    }
                }
            }
        )

        expect(normalized).toMatchObject({
            role: 'agent',
            usage: {
                input_tokens: 120_000,
                output_tokens: 2_000,
                cache_read_input_tokens: 20_000
            }
        })
    })
})
