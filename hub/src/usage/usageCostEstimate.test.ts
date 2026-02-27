import { afterEach, describe, expect, it } from 'bun:test'
import { estimateProviderCost, withUsageCostEstimate } from './usageCostEstimate'
import type { UsageProviderOverview, UsageOverview } from './usageScanner'

function createProvider(provider: 'claude' | 'codex', totalTokens: number, last30DaysTokens: number): UsageProviderOverview {
    return {
        provider,
        available: true,
        roots: [],
        filesScanned: 1,
        parseErrors: 0,
        eventCount: 2,
        last30DaysEventCount: 1,
        allTime: {
            inputTokens: totalTokens,
            cachedInputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens
        },
        last30Days: {
            inputTokens: last30DaysTokens,
            cachedInputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: last30DaysTokens
        },
        models: [
            {
                model: provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-5-codex',
                eventCount: 2,
                last30DaysEventCount: 1,
                allTime: {
                    inputTokens: totalTokens,
                    cachedInputTokens: 0,
                    cacheReadTokens: 0,
                    cacheCreationTokens: 0,
                    outputTokens: 0,
                    reasoningOutputTokens: 0,
                    totalTokens
                },
                last30Days: {
                    inputTokens: last30DaysTokens,
                    cachedInputTokens: 0,
                    cacheReadTokens: 0,
                    cacheCreationTokens: 0,
                    outputTokens: 0,
                    reasoningOutputTokens: 0,
                    totalTokens: last30DaysTokens
                }
            }
        ]
    }
}

describe('usageCostEstimate', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        delete process.env.HAPI_USAGE_ESTIMATE_CLAUDE_USD_PER_MTOK
        delete process.env.HAPI_USAGE_ESTIMATE_CODEX_USD_PER_MTOK
        delete process.env.HAPI_USAGE_ESTIMATE_CLAUDE_MODEL
        delete process.env.HAPI_USAGE_ESTIMATE_CODEX_MODEL
        globalThis.fetch = originalFetch
    })

    it('estimates provider cost from total tokens', async () => {
        process.env.HAPI_USAGE_ESTIMATE_CLAUDE_USD_PER_MTOK = '5'
        const provider = createProvider('claude', 3_000_000, 500_000)
        const estimate = await estimateProviderCost(provider)

        expect(estimate.usdPerMillionTokens).toBeCloseTo(5, 6)
        expect(estimate.allTimeUsd).toBeCloseTo(15, 6)
        expect(estimate.last30DaysUsd).toBeCloseTo(2.5, 6)
        expect(estimate.rateSource).toBe('env')
    })

    it('attaches estimate to both providers', async () => {
        process.env.HAPI_USAGE_ESTIMATE_CLAUDE_USD_PER_MTOK = '5'
        process.env.HAPI_USAGE_ESTIMATE_CODEX_USD_PER_MTOK = '5'
        const overview: UsageOverview = {
            generatedAt: Date.parse('2026-02-27T00:00:00.000Z'),
            windowDays: 30,
            claude: createProvider('claude', 1_000_000, 100_000),
            codex: createProvider('codex', 2_000_000, 250_000)
        }

        const withEstimate = await withUsageCostEstimate(overview)

        expect(withEstimate.claude.estimatedCost.allTimeUsd).toBe(5)
        expect(withEstimate.codex.estimatedCost.allTimeUsd).toBe(10)
    })

    it('uses model buckets when LiteLLM pricing is available', async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({
                'anthropic/claude-sonnet-4-20250514': {
                    input_cost_per_token: 3e-6,
                    output_cost_per_token: 15e-6
                },
                'anthropic/claude-opus-4-20250514': {
                    input_cost_per_token: 15e-6,
                    output_cost_per_token: 75e-6
                }
            }), { status: 200 })) as unknown as typeof fetch

        const provider: UsageProviderOverview = {
            provider: 'claude',
            available: true,
            roots: [],
            filesScanned: 1,
            parseErrors: 0,
            eventCount: 2,
            last30DaysEventCount: 2,
            allTime: {
                inputTokens: 1_000_000,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 1_000_000,
                reasoningOutputTokens: 0,
                totalTokens: 2_000_000
            },
            last30Days: {
                inputTokens: 1_000_000,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 1_000_000,
                reasoningOutputTokens: 0,
                totalTokens: 2_000_000
            },
            models: [
                {
                    model: 'claude-sonnet-4-20250514',
                    eventCount: 1,
                    last30DaysEventCount: 1,
                    allTime: {
                        inputTokens: 1_000_000,
                        cachedInputTokens: 0,
                        cacheReadTokens: 0,
                        cacheCreationTokens: 0,
                        outputTokens: 0,
                        reasoningOutputTokens: 0,
                        totalTokens: 1_000_000
                    },
                    last30Days: {
                        inputTokens: 1_000_000,
                        cachedInputTokens: 0,
                        cacheReadTokens: 0,
                        cacheCreationTokens: 0,
                        outputTokens: 0,
                        reasoningOutputTokens: 0,
                        totalTokens: 1_000_000
                    }
                },
                {
                    model: 'claude-opus-4-20250514',
                    eventCount: 1,
                    last30DaysEventCount: 1,
                    allTime: {
                        inputTokens: 0,
                        cachedInputTokens: 0,
                        cacheReadTokens: 0,
                        cacheCreationTokens: 0,
                        outputTokens: 1_000_000,
                        reasoningOutputTokens: 0,
                        totalTokens: 1_000_000
                    },
                    last30Days: {
                        inputTokens: 0,
                        cachedInputTokens: 0,
                        cacheReadTokens: 0,
                        cacheCreationTokens: 0,
                        outputTokens: 1_000_000,
                        reasoningOutputTokens: 0,
                        totalTokens: 1_000_000
                    }
                }
            ]
        }

        const estimate = await estimateProviderCost(provider)
        expect(estimate.rateSource).toBe('litelm')
        expect(estimate.allTimeUsd).toBeCloseTo(78, 6)
        expect(estimate.usdPerMillionTokens).toBeCloseTo(39, 6)
        expect(estimate.pricingModel).toBe('mixed(2)')
    })
})
