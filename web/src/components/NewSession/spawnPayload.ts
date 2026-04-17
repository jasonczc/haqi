import type { NetworkMode } from '@hapi/protocol/schemas'
import type { AgentType, ServiceTier, SessionType, ThinkEffort } from './types'

export function resolveSpawnModel(
    agent: AgentType,
    model: string | undefined,
    customModel: string
): string | undefined {
    const customModelValue = customModel.trim()
    if (customModelValue) {
        return customModelValue
    }

    if (!model) {
        return undefined
    }

    const isAutoModel = model === 'auto'
        || model === 'auto-gemini-3'
        || model === 'auto-gemini-2.5'
    const isGeminiManualModel = agent === 'gemini' && model === 'manual'

    if (isAutoModel || isGeminiManualModel || agent === 'opencode') {
        return undefined
    }

    return model
}

export function resolveSpawnThinkEffort(
    agent: AgentType,
    thinkEffort: ThinkEffort | undefined
): ThinkEffort | undefined {
    if (!thinkEffort) {
        return undefined
    }

    if (agent === 'codex' && thinkEffort !== 'auto') {
        return thinkEffort
    }

    if (agent === 'claude' && thinkEffort !== 'auto') {
        return thinkEffort  // supports low, medium, high, max, xhigh
    }

    return undefined
}

export function resolveSpawnServiceTier(
    agent: AgentType,
    serviceTier: ServiceTier | undefined
): 'fast' | 'flex' | undefined {
    if (agent !== 'codex') {
        return undefined
    }
    if (!serviceTier || serviceTier === 'auto') {
        return undefined
    }
    return serviceTier
}

export function resolveSpawnSessionSettings(
    sessionType: SessionType,
    worktreeName: string,
    previewUrl: string
): {
    sessionType: SessionType
    worktreeName?: string
    previewUrl?: string
} {
    const trimmedWorktreeName = worktreeName.trim()
    const trimmedPreviewUrl = previewUrl.trim()

    return {
        sessionType,
        worktreeName: sessionType === 'worktree' ? (trimmedWorktreeName || undefined) : undefined,
        previewUrl: trimmedPreviewUrl || undefined
    }
}

export function parseListInput(raw: string): string[] | undefined {
    const values = raw
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean)

    return values.length > 0 ? Array.from(new Set(values)) : undefined
}

export function parsePreviewPortInput(raw: string): number | undefined {
    const trimmed = raw.trim()
    if (!trimmed) {
        return undefined
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        return undefined
    }

    return parsed
}

export function normalizeNetworkPolicyInput(value: string): NetworkMode | undefined {
    if (value === 'default' || value === 'restricted' || value === 'off') {
        return value
    }
    return undefined
}
