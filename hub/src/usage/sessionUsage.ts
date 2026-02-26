import type { DecryptedMessage } from '@hapi/protocol/types'
import type { UsageTotals } from './usageScanner'

export type SessionUsageProvider = 'claude' | 'codex' | 'unknown'

export type SessionUsageSourceCounts = {
    claudeAssistantMessages: number
    codexTokenEvents: number
}

export type SessionUsageOverview = {
    sessionId: string
    provider: SessionUsageProvider
    generatedAt: number
    messageCount: number
    usageEventCount: number
    parseErrors: number
    allTime: UsageTotals
    latest: UsageTotals | null
    lastUsageAt: number | null
    sourceCounts: SessionUsageSourceCounts
}

type CodexRawUsage = {
    input_tokens: number
    cached_input_tokens: number
    output_tokens: number
    reasoning_output_tokens: number
    total_tokens: number
}

type CodexUsageParseState = {
    previousTotals: CodexRawUsage | null
    seenDeltaFingerprints: Set<string>
}

function createEmptyTotals(): UsageTotals {
    return {
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0
    }
}

function cloneTotals(value: UsageTotals): UsageTotals {
    return {
        inputTokens: value.inputTokens,
        cachedInputTokens: value.cachedInputTokens,
        cacheReadTokens: value.cacheReadTokens,
        cacheCreationTokens: value.cacheCreationTokens,
        outputTokens: value.outputTokens,
        reasoningOutputTokens: value.reasoningOutputTokens,
        totalTokens: value.totalTokens
    }
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

function toFiniteNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function addTotals(target: UsageTotals, value: UsageTotals): void {
    target.inputTokens += value.inputTokens
    target.cachedInputTokens += value.cachedInputTokens
    target.cacheReadTokens += value.cacheReadTokens
    target.cacheCreationTokens += value.cacheCreationTokens
    target.outputTokens += value.outputTokens
    target.reasoningOutputTokens += value.reasoningOutputTokens
    target.totalTokens += value.totalTokens
}

function normalizeCodexRawUsage(value: unknown): CodexRawUsage | null {
    const record = toRecord(value)
    if (!record) {
        return null
    }

    const input = toFiniteNumber(record.input_tokens)
    const cachedInput = toFiniteNumber(record.cached_input_tokens ?? record.cache_read_input_tokens)
    const output = toFiniteNumber(record.output_tokens)
    const reasoning = toFiniteNumber(record.reasoning_output_tokens)
    const total = toFiniteNumber(record.total_tokens)

    return {
        input_tokens: input,
        cached_input_tokens: cachedInput,
        output_tokens: output,
        reasoning_output_tokens: reasoning,
        total_tokens: total > 0 ? total : input + output
    }
}

function subtractCodexRawUsage(current: CodexRawUsage, previous: CodexRawUsage | null): CodexRawUsage {
    return {
        input_tokens: Math.max(current.input_tokens - (previous?.input_tokens ?? 0), 0),
        cached_input_tokens: Math.max(current.cached_input_tokens - (previous?.cached_input_tokens ?? 0), 0),
        output_tokens: Math.max(current.output_tokens - (previous?.output_tokens ?? 0), 0),
        reasoning_output_tokens: Math.max(current.reasoning_output_tokens - (previous?.reasoning_output_tokens ?? 0), 0),
        total_tokens: Math.max(current.total_tokens - (previous?.total_tokens ?? 0), 0)
    }
}

function addCodexRawUsage(previous: CodexRawUsage | null, delta: CodexRawUsage): CodexRawUsage {
    return {
        input_tokens: (previous?.input_tokens ?? 0) + delta.input_tokens,
        cached_input_tokens: (previous?.cached_input_tokens ?? 0) + delta.cached_input_tokens,
        output_tokens: (previous?.output_tokens ?? 0) + delta.output_tokens,
        reasoning_output_tokens: (previous?.reasoning_output_tokens ?? 0) + delta.reasoning_output_tokens,
        total_tokens: (previous?.total_tokens ?? 0) + delta.total_tokens
    }
}

function hasClaudeUsageKeys(usageRaw: Record<string, unknown>): boolean {
    return 'input_tokens' in usageRaw
        || 'output_tokens' in usageRaw
        || 'cache_read_input_tokens' in usageRaw
        || 'cache_creation_input_tokens' in usageRaw
}

function parseClaudeUsage(message: DecryptedMessage): { totals: UsageTotals } | { parseError: true } | null {
    const root = toRecord(message.content)
    if (!root || root.role !== 'agent') {
        return null
    }

    const content = toRecord(root.content)
    if (!content || content.type !== 'output') {
        return null
    }

    const data = toRecord(content.data)
    if (!data || data.type !== 'assistant') {
        return null
    }

    const assistantMessage = toRecord(data.message)
    if (!assistantMessage) {
        return { parseError: true }
    }

    const usageRaw = toRecord(assistantMessage.usage)
    if (!usageRaw) {
        return null
    }

    if (!hasClaudeUsageKeys(usageRaw)) {
        return { parseError: true }
    }

    const inputTokens = toFiniteNumber(usageRaw.input_tokens)
    const outputTokens = toFiniteNumber(usageRaw.output_tokens)
    const cacheReadTokens = toFiniteNumber(usageRaw.cache_read_input_tokens)
    const cacheCreationTokens = toFiniteNumber(usageRaw.cache_creation_input_tokens)

    if (inputTokens === 0
        && outputTokens === 0
        && cacheReadTokens === 0
        && cacheCreationTokens === 0) {
        return null
    }

    const totals = createEmptyTotals()
    totals.inputTokens = inputTokens
    totals.cachedInputTokens = cacheReadTokens
    totals.cacheReadTokens = cacheReadTokens
    totals.cacheCreationTokens = cacheCreationTokens
    totals.outputTokens = outputTokens
    totals.reasoningOutputTokens = 0
    totals.totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens

    return { totals }
}

function hasCodexUsagePayload(info: Record<string, unknown>): boolean {
    return 'last_token_usage' in info || 'total_token_usage' in info
}

function convertCodexRawUsageToTotals(raw: CodexRawUsage): UsageTotals {
    const totals = createEmptyTotals()
    totals.inputTokens = raw.input_tokens
    totals.cachedInputTokens = raw.cached_input_tokens
    totals.cacheReadTokens = raw.cached_input_tokens
    totals.cacheCreationTokens = 0
    totals.outputTokens = raw.output_tokens
    totals.reasoningOutputTokens = raw.reasoning_output_tokens
    totals.totalTokens = raw.total_tokens > 0
        ? raw.total_tokens
        : raw.input_tokens + raw.output_tokens
    return totals
}

function parseCodexUsage(
    message: DecryptedMessage,
    state: CodexUsageParseState
): { totals: UsageTotals } | { parseError: true } | null {
    const root = toRecord(message.content)
    if (!root || root.role !== 'agent') {
        return null
    }

    const content = toRecord(root.content)
    if (!content || content.type !== 'codex') {
        return null
    }

    const data = toRecord(content.data)
    if (!data || data.type !== 'token_count') {
        return null
    }

    const info = toRecord(data.info)
    if (!info) {
        return { parseError: true }
    }

    if (!hasCodexUsagePayload(info)) {
        return { parseError: true }
    }

    const lastUsage = normalizeCodexRawUsage(info.last_token_usage)
    const totalUsage = normalizeCodexRawUsage(info.total_token_usage)

    let raw = lastUsage
    if (!raw && totalUsage) {
        raw = subtractCodexRawUsage(totalUsage, state.previousTotals)
    }

    if (!raw) {
        return { parseError: true }
    }

    if (raw.input_tokens === 0
        && raw.cached_input_tokens === 0
        && raw.output_tokens === 0
        && raw.reasoning_output_tokens === 0) {
        if (totalUsage) {
            state.previousTotals = totalUsage
        }
        return null
    }

    const fingerprint = [
        message.createdAt,
        raw.input_tokens,
        raw.cached_input_tokens,
        raw.output_tokens,
        raw.reasoning_output_tokens,
        raw.total_tokens
    ].join(':')

    if (state.seenDeltaFingerprints.has(fingerprint)) {
        return null
    }

    state.seenDeltaFingerprints.add(fingerprint)

    if (totalUsage) {
        state.previousTotals = totalUsage
    } else if (lastUsage) {
        state.previousTotals = addCodexRawUsage(state.previousTotals, lastUsage)
    }

    return {
        totals: convertCodexRawUsageToTotals(raw)
    }
}

function resolveProvider(flavor?: string | null): SessionUsageProvider {
    if (flavor === 'claude') return 'claude'
    if (flavor === 'codex') return 'codex'
    return 'unknown'
}

function compareMessages(a: DecryptedMessage, b: DecryptedMessage): number {
    if (typeof a.seq === 'number' && typeof b.seq === 'number') {
        return a.seq - b.seq
    }
    if (typeof a.seq === 'number') return -1
    if (typeof b.seq === 'number') return 1
    return a.createdAt - b.createdAt
}

export function buildSessionUsageOverview(input: {
    sessionId: string
    flavor?: string | null
    messages: DecryptedMessage[]
    now?: number
}): SessionUsageOverview {
    const nowMs = input.now ?? Date.now()
    const orderedMessages = [...input.messages].sort(compareMessages)

    const allTime = createEmptyTotals()
    let latest: UsageTotals | null = null
    let lastUsageAt: number | null = null
    let usageEventCount = 0
    let parseErrors = 0

    const sourceCounts: SessionUsageSourceCounts = {
        claudeAssistantMessages: 0,
        codexTokenEvents: 0
    }

    const codexState: CodexUsageParseState = {
        previousTotals: null,
        seenDeltaFingerprints: new Set<string>()
    }

    for (const message of orderedMessages) {
        const claudeUsage = parseClaudeUsage(message)
        if (claudeUsage && 'parseError' in claudeUsage) {
            parseErrors += 1
            continue
        }
        if (claudeUsage && 'totals' in claudeUsage) {
            addTotals(allTime, claudeUsage.totals)
            latest = cloneTotals(claudeUsage.totals)
            lastUsageAt = message.createdAt
            usageEventCount += 1
            sourceCounts.claudeAssistantMessages += 1
            continue
        }

        const codexUsage = parseCodexUsage(message, codexState)
        if (codexUsage && 'parseError' in codexUsage) {
            parseErrors += 1
            continue
        }
        if (codexUsage && 'totals' in codexUsage) {
            addTotals(allTime, codexUsage.totals)
            latest = cloneTotals(codexUsage.totals)
            lastUsageAt = message.createdAt
            usageEventCount += 1
            sourceCounts.codexTokenEvents += 1
        }
    }

    return {
        sessionId: input.sessionId,
        provider: resolveProvider(input.flavor),
        generatedAt: nowMs,
        messageCount: orderedMessages.length,
        usageEventCount,
        parseErrors,
        allTime,
        latest,
        lastUsageAt,
        sourceCounts
    }
}
