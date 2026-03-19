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

    if (agent === 'claude' && thinkEffort !== 'auto' && thinkEffort !== 'xhigh') {
        return thinkEffort  // supports low, medium, high, max
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
