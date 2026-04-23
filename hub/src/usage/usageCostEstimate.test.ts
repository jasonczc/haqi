import { afterEach, describe, expect, it } from 'bun:test'
import { estimateProviderCost, withUsageCostEstimate } from './usageCostEstimate'
import type { UsageProviderOverview, UsageOverview, UsageTotals } from './usageScanner'

function createProvider(provider: 'claude' | 'codex', totalTokens: number, last30DaysTokens: number): UsageProviderOverview {
    return createProviderWithTotals(
        provider,
        {
            inputTokens: totalTokens,
            totalTokens
        },
        {
            inputTokens: last30DaysTokens,
            totalTokens: last30DaysTokens
        }
    )
}

function createTotals(overrides: Partial<UsageTotals>): UsageTotals {
    const inputTokens = overrides.inputTokens ?? 0
    const cachedInputTokens = overrides.cachedInputTokens ?? 0
    const cacheReadTokens = overrides.cacheReadTokens ?? 0
    const cacheCreationTokens = overrides.cacheCreationTokens ?? 0
    const outputTokens = overrides.outputTokens ?? 0
    const reasoningOutputTokens = overrides.reasoningOutputTokens ?? 0
    const totalTokens = overrides.totalTokens
        ?? (inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens + reasoningOutputTokens)

    return {
        inputTokens,
        cachedInputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens
    }
}

function createProviderWithTotals(
    provider: 'claude' | 'codex',
    allTimeOverrides: Partial<UsageTotals>,
    last30DaysOverrides: Partial<UsageTotals>,
    model = provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-5-codex'
): UsageProviderOverview {
    const allTime = createTotals(allTimeOverrides)
    const last30Days = createTotals(last30DaysOverrides)

    return {
        provider,
        available: true,
        roots: [],
        filesScanned: 1,
        parseErrors: 0,
        eventCount: 2,
        last30DaysEventCount: 1,
        allTime,
        last30Days,
        models: [
            {
                model,
                eventCount: 2,
                last30DaysEventCount: 1,
                allTime,
                last30Days
            }
        ]
    }
}

const MOCK_LITELLM_PRICING = {
    'anthropic/claude-sonnet-4-20250514': {
        input_cost_per_token: 3e-6,
        output_cost_per_token: 15e-6,
        cache_read_input_token_cost: 3e-7
    },
    'anthropic/claude-opus-4-20250514': {
        input_cost_per_token: 15e-6,
        output_cost_per_token: 75e-6
    },
    'openai/gpt-5.5': {
        input_cost_per_token: 12e-6,
        output_cost_per_token: 36e-6,
        cache_read_input_token_cost: 1.2e-6
    },
    'openai/gpt-5.4': {
        input_cost_per_token: 11e-6,
        output_cost_per_token: 33e-6,
        cache_read_input_token_cost: 1.1e-6
    },
    'openai/gpt-5-codex': {
        input_cost_per_token: 10e-6,
        output_cost_per_token: 30e-6,
        cache_read_input_token_cost: 1e-6
    }
}

function mockLiteLLMPricingFetch(): void {
    globalThis.fetch = (async () =>
        new Response(JSON.stringify(MOCK_LITELLM_PRICING), { status: 200 })) as unknown as typeof fetch
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

    it('prefers gpt-5.5 as codex fallback model when pricing exists', async () => {
        mockLiteLLMPricingFetch()
        const provider = createProvider('codex', 1_000_000, 250_000)
        provider.models = []

        const estimate = await estimateProviderCost(provider)

        expect(estimate.rateSource).toBe('litelm')
        expect(estimate.pricingModel).toBe('openai/gpt-5.5')
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

    it('applies cached-input discount with cache read rate', async () => {
        mockLiteLLMPricingFetch()
        const provider = createProviderWithTotals(
            'codex',
            {
                inputTokens: 1_000_000,
                cachedInputTokens: 400_000,
                totalTokens: 1_000_000
            },
            {
                inputTokens: 500_000,
                cachedInputTokens: 300_000,
                totalTokens: 500_000
            }
        )

        const estimate = await estimateProviderCost(provider)
        expect(estimate.rateSource).toBe('litelm')
        expect(estimate.allTimeUsd).toBeCloseTo(6.4, 6)
        expect(estimate.last30DaysUsd).toBeCloseTo(2.3, 6)
    })

    it('does not bill reasoning output tokens twice', async () => {
        process.env.HAPI_USAGE_ESTIMATE_CODEX_USD_PER_MTOK = '5'
        const provider = createProviderWithTotals(
            'codex',
            {
                outputTokens: 1_000_000,
                reasoningOutputTokens: 800_000,
                totalTokens: 1_800_000
            },
            {
                outputTokens: 200_000,
                reasoningOutputTokens: 100_000,
                totalTokens: 300_000
            }
        )

        const estimate = await estimateProviderCost(provider)
        expect(estimate.rateSource).toBe('env')
        expect(estimate.allTimeUsd).toBeCloseTo(5, 6)
        expect(estimate.last30DaysUsd).toBeCloseTo(1, 6)
    })

    it('does not double bill when cacheReadTokens and cachedInputTokens coexist', async () => {
        process.env.HAPI_USAGE_ESTIMATE_CODEX_USD_PER_MTOK = '1'
        const provider = createProviderWithTotals(
            'codex',
            {
                inputTokens: 1_000_000,
                cachedInputTokens: 200_000,
                cacheReadTokens: 200_000,
                totalTokens: 1_000_000
            },
            {
                inputTokens: 400_000,
                cachedInputTokens: 100_000,
                cacheReadTokens: 100_000,
                totalTokens: 400_000
            }
        )

        const estimate = await estimateProviderCost(provider)
        expect(estimate.rateSource).toBe('env')
        expect(estimate.allTimeUsd).toBeCloseTo(1, 6)
        expect(estimate.last30DaysUsd).toBeCloseTo(0.4, 6)
    })

    it('uses model buckets when LiteLLM pricing is available', async () => {
        mockLiteLLMPricingFetch()

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
