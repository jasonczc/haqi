import { describe, expect, it } from 'bun:test'
import type { DecryptedMessage } from '@hapi/protocol/types'
import { buildSessionUsageOverview } from './sessionUsage'

function createMessage(
    seq: number,
    createdAt: number,
    content: unknown
): DecryptedMessage {
    return {
        id: `m-${seq}`,
        seq,
        localId: null,
        content,
        createdAt
    }
}

describe('buildSessionUsageOverview', () => {
    it('aggregates Claude assistant usage and Codex token_count deltas', () => {
        const messages: DecryptedMessage[] = [
            createMessage(1, 1_000, {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            usage: {
                                input_tokens: 100,
                                output_tokens: 20,
                                cache_read_input_tokens: 40,
                                cache_creation_input_tokens: 10
                            }
                        }
                    }
                }
            }),
            createMessage(2, 2_000, {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'token_count',
                        info: {
                            last_token_usage: {
                                input_tokens: 50,
                                cached_input_tokens: 10,
                                output_tokens: 5,
                                reasoning_output_tokens: 2,
                                total_tokens: 55
                            }
                        }
                    }
                }
            }),
            // Duplicate token_count event (same timestamp + delta) should be ignored.
            createMessage(3, 2_000, {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'token_count',
                        info: {
                            last_token_usage: {
                                input_tokens: 50,
                                cached_input_tokens: 10,
                                output_tokens: 5,
                                reasoning_output_tokens: 2,
                                total_tokens: 55
                            }
                        }
                    }
                }
            }),
            createMessage(4, 3_000, {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'token_count',
                        info: {
                            total_token_usage: {
                                input_tokens: 120,
                                cached_input_tokens: 20,
                                output_tokens: 15,
                                reasoning_output_tokens: 5,
                                total_tokens: 135
                            }
                        }
                    }
                }
            })
        ]

        const overview = buildSessionUsageOverview({
            sessionId: 'session-1',
            flavor: 'codex',
            messages,
            now: 9_999
        })

        expect(overview.sessionId).toBe('session-1')
        expect(overview.provider).toBe('codex')
        expect(overview.generatedAt).toBe(9_999)
        expect(overview.messageCount).toBe(4)
        expect(overview.usageEventCount).toBe(3)
        expect(overview.parseErrors).toBe(0)
        expect(overview.sourceCounts).toEqual({
            claudeAssistantMessages: 1,
            codexTokenEvents: 2
        })

        expect(overview.allTime).toEqual({
            inputTokens: 220,
            cachedInputTokens: 60,
            cacheReadTokens: 60,
            cacheCreationTokens: 10,
            outputTokens: 35,
            reasoningOutputTokens: 5,
            totalTokens: 305
        })

        expect(overview.latest).toEqual({
            inputTokens: 70,
            cachedInputTokens: 10,
            cacheReadTokens: 10,
            cacheCreationTokens: 0,
            outputTokens: 10,
            reasoningOutputTokens: 3,
            totalTokens: 80
        })
        expect(overview.lastUsageAt).toBe(3_000)
    })

    it('tracks parse errors for malformed usage payloads', () => {
        const messages: DecryptedMessage[] = [
            createMessage(1, 1_000, {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            usage: {
                                bad_field: true
                            }
                        }
                    }
                }
            }),
            createMessage(2, 2_000, {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'token_count',
                        info: {
                            unrelated: 'value'
                        }
                    }
                }
            })
        ]

        const overview = buildSessionUsageOverview({
            sessionId: 'session-2',
            flavor: 'claude',
            messages,
            now: 5_000
        })

        expect(overview.provider).toBe('claude')
        expect(overview.usageEventCount).toBe(0)
        expect(overview.parseErrors).toBe(2)
        expect(overview.latest).toBeNull()
        expect(overview.lastUsageAt).toBeNull()
        expect(overview.allTime.totalTokens).toBe(0)
    })
})
