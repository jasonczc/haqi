import { createReadStream } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const JSONL_SUFFIX = '.jsonl'
const USAGE_WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000
const UNKNOWN_MODEL = 'unknown'

export type UsageTotals = {
    inputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export type UsageProviderOverview = {
    provider: 'claude' | 'codex'
    available: boolean
    roots: string[]
    filesScanned: number
    parseErrors: number
    eventCount: number
    last30DaysEventCount: number
    allTime: UsageTotals
    last30Days: UsageTotals
    models: UsageModelOverview[]
}

export type UsageModelOverview = {
    model: string
    eventCount: number
    last30DaysEventCount: number
    allTime: UsageTotals
    last30Days: UsageTotals
}

export type UsageOverview = {
    generatedAt: number
    windowDays: number
    claude: UsageProviderOverview
    codex: UsageProviderOverview
}

export type UsageScanOptions = {
    now?: number
    claudeProjectsDirs?: string[]
    codexSessionsDirs?: string[]
}

type CodexRawUsage = {
    input_tokens: number
    cached_input_tokens: number
    output_tokens: number
    reasoning_output_tokens: number
    total_tokens: number
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

function createProviderOverview(
    provider: 'claude' | 'codex',
    roots: string[],
    available: boolean
): UsageProviderOverview {
    return {
        provider,
        available,
        roots,
        filesScanned: 0,
        parseErrors: 0,
        eventCount: 0,
        last30DaysEventCount: 0,
        allTime: createEmptyTotals(),
        last30Days: createEmptyTotals(),
        models: []
    }
}

function createModelOverview(model: string): UsageModelOverview {
    return {
        model,
        eventCount: 0,
        last30DaysEventCount: 0,
        allTime: createEmptyTotals(),
        last30Days: createEmptyTotals()
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

function normalizeIsoTimestamp(value: unknown): number | null {
    if (typeof value !== 'string') {
        return null
    }
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
}

function normalizeModelName(value: unknown): string {
    if (typeof value !== 'string') {
        return UNKNOWN_MODEL
    }
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : UNKNOWN_MODEL
}

function getOrCreateModelOverview(
    map: Map<string, UsageModelOverview>,
    model: string
): UsageModelOverview {
    const existing = map.get(model)
    if (existing) {
        return existing
    }
    const created = createModelOverview(model)
    map.set(model, created)
    return created
}

function sortedModelOverviews(map: Map<string, UsageModelOverview>): UsageModelOverview[] {
    return Array.from(map.values()).sort((a, b) => {
        if (b.allTime.totalTokens !== a.allTime.totalTokens) {
            return b.allTime.totalTokens - a.allTime.totalTokens
        }
        return a.model.localeCompare(b.model)
    })
}

function addClaudeUsage(totals: UsageTotals, usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}): void {
    totals.inputTokens += usage.input_tokens
    totals.outputTokens += usage.output_tokens
    totals.cacheReadTokens += usage.cache_read_input_tokens
    totals.cachedInputTokens += usage.cache_read_input_tokens
    totals.cacheCreationTokens += usage.cache_creation_input_tokens
    totals.totalTokens += usage.input_tokens
        + usage.output_tokens
        + usage.cache_read_input_tokens
        + usage.cache_creation_input_tokens
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

function addCodexUsage(totals: UsageTotals, usage: CodexRawUsage): void {
    totals.inputTokens += usage.input_tokens
    totals.cachedInputTokens += usage.cached_input_tokens
    totals.cacheReadTokens += usage.cached_input_tokens
    totals.outputTokens += usage.output_tokens
    totals.reasoningOutputTokens += usage.reasoning_output_tokens
    totals.totalTokens += usage.total_tokens > 0
        ? usage.total_tokens
        : usage.input_tokens + usage.output_tokens
}

function isJsonlFile(path: string): boolean {
    return path.endsWith(JSONL_SUFFIX)
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

async function collectJsonlFiles(root: string): Promise<string[]> {
    const result: string[] = []
    const stack = [root]

    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue

        let entries
        try {
            entries = await readdir(current, { withFileTypes: true })
        } catch {
            continue
        }

        for (const entry of entries) {
            const fullPath = join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(fullPath)
                continue
            }
            if (entry.isFile() && isJsonlFile(fullPath)) {
                result.push(fullPath)
            }
        }
    }

    return result
}

function resolveClaudeProjectsDirs(override?: string[]): string[] {
    if (override && override.length > 0) {
        return Array.from(new Set(override))
    }

    const fromEnv = process.env.CLAUDE_CONFIG_DIR
    const home = homedir()
    const dirs = [
        fromEnv ? join(fromEnv, 'projects') : null,
        join(home, '.claude', 'projects'),
        join(home, '.config', 'claude', 'projects')
    ].filter((value): value is string => Boolean(value))

    return Array.from(new Set(dirs))
}

function resolveCodexSessionsDirs(override?: string[]): string[] {
    if (override && override.length > 0) {
        return Array.from(new Set(override))
    }
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
    return [join(codexHome, 'sessions')]
}

function shouldCountInLastWindow(timestampMs: number | null, nowMs: number): boolean {
    if (timestampMs === null) {
        return false
    }
    return timestampMs >= nowMs - USAGE_WINDOW_DAYS * MS_PER_DAY
}

async function scanClaudeUsage(
    roots: string[],
    nowMs: number
): Promise<UsageProviderOverview> {
    const existingRoots: string[] = []
    for (const root of roots) {
        if (await exists(root)) {
            existingRoots.push(root)
        }
    }

    const provider = createProviderOverview('claude', existingRoots, existingRoots.length > 0)
    if (existingRoots.length === 0) {
        return provider
    }

    const models = new Map<string, UsageModelOverview>()

    for (const root of existingRoots) {
        const files = await collectJsonlFiles(root)
        provider.filesScanned += files.length

        for (const file of files) {
            const rl = createInterface({
                input: createReadStream(file),
                crlfDelay: Infinity
            })

            try {
                for await (const line of rl) {
                    const trimmed = line.trim()
                    if (!trimmed) continue

                    let parsed: unknown
                    try {
                        parsed = JSON.parse(trimmed)
                    } catch {
                        provider.parseErrors += 1
                        continue
                    }

                    const entry = toRecord(parsed)
                    if (!entry || entry.type !== 'assistant') {
                        continue
                    }

                    const message = toRecord(entry.message)
                    if (!message || message.role !== 'assistant') {
                        continue
                    }

                    const usageRaw = toRecord(message.usage)
                    if (!usageRaw) {
                        continue
                    }

                    const modelName = normalizeModelName(message.model)
                    const modelOverview = getOrCreateModelOverview(models, modelName)

                    const inputTokens = toFiniteNumber(usageRaw.input_tokens)
                    const outputTokens = toFiniteNumber(usageRaw.output_tokens)
                    const cacheReadTokens = toFiniteNumber(usageRaw.cache_read_input_tokens)
                    const cacheCreationTokens = toFiniteNumber(usageRaw.cache_creation_input_tokens)

                    if (inputTokens === 0
                        && outputTokens === 0
                        && cacheReadTokens === 0
                        && cacheCreationTokens === 0) {
                        continue
                    }

                    const timestampMs = normalizeIsoTimestamp(entry.timestamp)

                    addClaudeUsage(provider.allTime, {
                        input_tokens: inputTokens,
                        output_tokens: outputTokens,
                        cache_read_input_tokens: cacheReadTokens,
                        cache_creation_input_tokens: cacheCreationTokens
                    })
                    provider.eventCount += 1
                    addClaudeUsage(modelOverview.allTime, {
                        input_tokens: inputTokens,
                        output_tokens: outputTokens,
                        cache_read_input_tokens: cacheReadTokens,
                        cache_creation_input_tokens: cacheCreationTokens
                    })
                    modelOverview.eventCount += 1

                    if (shouldCountInLastWindow(timestampMs, nowMs)) {
                        addClaudeUsage(provider.last30Days, {
                            input_tokens: inputTokens,
                            output_tokens: outputTokens,
                            cache_read_input_tokens: cacheReadTokens,
                            cache_creation_input_tokens: cacheCreationTokens
                        })
                        provider.last30DaysEventCount += 1
                        addClaudeUsage(modelOverview.last30Days, {
                            input_tokens: inputTokens,
                            output_tokens: outputTokens,
                            cache_read_input_tokens: cacheReadTokens,
                            cache_creation_input_tokens: cacheCreationTokens
                        })
                        modelOverview.last30DaysEventCount += 1
                    }
                }
            } finally {
                rl.close()
            }
        }
    }

    provider.models = sortedModelOverviews(models)

    return provider
}

async function scanCodexUsage(
    roots: string[],
    nowMs: number
): Promise<UsageProviderOverview> {
    const existingRoots: string[] = []
    for (const root of roots) {
        if (await exists(root)) {
            existingRoots.push(root)
        }
    }

    const provider = createProviderOverview('codex', existingRoots, existingRoots.length > 0)
    if (existingRoots.length === 0) {
        return provider
    }

    const models = new Map<string, UsageModelOverview>()

    for (const root of existingRoots) {
        const files = await collectJsonlFiles(root)
        provider.filesScanned += files.length

        for (const file of files) {
            const rl = createInterface({
                input: createReadStream(file),
                crlfDelay: Infinity
            })

            let previousTotals: CodexRawUsage | null = null
            const seenDeltaFingerprints = new Set<string>()
            let currentModel = UNKNOWN_MODEL

            try {
                for await (const line of rl) {
                    const trimmed = line.trim()
                    if (!trimmed) continue

                    let parsed: unknown
                    try {
                        parsed = JSON.parse(trimmed)
                    } catch {
                        provider.parseErrors += 1
                        continue
                    }

                    const entry = toRecord(parsed)
                    if (!entry) {
                        continue
                    }

                    if (entry.type === 'turn_context') {
                        const payload = toRecord(entry.payload)
                        const modelFromPayload = payload?.model
                        if (typeof modelFromPayload === 'string' && modelFromPayload.trim().length > 0) {
                            currentModel = normalizeModelName(modelFromPayload)
                        }
                        continue
                    }

                    if (entry.type !== 'event_msg') {
                        continue
                    }

                    const payload = toRecord(entry.payload)
                    if (!payload || payload.type !== 'token_count') {
                        continue
                    }

                    const info = toRecord(payload.info)
                    const lastUsage = normalizeCodexRawUsage(info?.last_token_usage)
                    const totalUsage = normalizeCodexRawUsage(info?.total_token_usage)
                    let raw = lastUsage
                    if (!raw && totalUsage) {
                        raw = subtractCodexRawUsage(totalUsage, previousTotals)
                    }
                    if (!raw) {
                        continue
                    }

                    if (raw.input_tokens === 0
                        && raw.cached_input_tokens === 0
                        && raw.output_tokens === 0
                        && raw.reasoning_output_tokens === 0) {
                        continue
                    }

                    const modelName = normalizeModelName(
                        info?.model
                            ?? info?.model_name
                            ?? payload.model
                            ?? currentModel
                    )
                    const modelOverview = getOrCreateModelOverview(models, modelName)
                    const timestampMs = normalizeIsoTimestamp(entry.timestamp)
                    const fingerprint = [
                        modelName,
                        timestampMs ?? -1,
                        raw.input_tokens,
                        raw.cached_input_tokens,
                        raw.output_tokens,
                        raw.reasoning_output_tokens,
                        raw.total_tokens
                    ].join(':')

                    if (seenDeltaFingerprints.has(fingerprint)) {
                        continue
                    }
                    seenDeltaFingerprints.add(fingerprint)

                    if (totalUsage) {
                        previousTotals = totalUsage
                    } else if (lastUsage) {
                        previousTotals = addCodexRawUsage(previousTotals, lastUsage)
                    }

                    addCodexUsage(provider.allTime, raw)
                    provider.eventCount += 1
                    addCodexUsage(modelOverview.allTime, raw)
                    modelOverview.eventCount += 1

                    if (shouldCountInLastWindow(timestampMs, nowMs)) {
                        addCodexUsage(provider.last30Days, raw)
                        provider.last30DaysEventCount += 1
                        addCodexUsage(modelOverview.last30Days, raw)
                        modelOverview.last30DaysEventCount += 1
                    }
                }
            } finally {
                rl.close()
            }
        }
    }

    provider.models = sortedModelOverviews(models)

    return provider
}

export async function scanUsageOverview(options: UsageScanOptions = {}): Promise<UsageOverview> {
    const nowMs = options.now ?? Date.now()
    const claudeRoots = resolveClaudeProjectsDirs(options.claudeProjectsDirs)
    const codexRoots = resolveCodexSessionsDirs(options.codexSessionsDirs)

    const [claude, codex] = await Promise.all([
        scanClaudeUsage(claudeRoots, nowMs),
        scanCodexUsage(codexRoots, nowMs)
    ])

    return {
        generatedAt: nowMs,
        windowDays: USAGE_WINDOW_DAYS,
        claude,
        codex
    }
}
