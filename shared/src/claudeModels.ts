const DEPRECATED_CLAUDE_MODEL_VALUE_MAP: Record<string, string> = {
    // Bedrock-format IDs → official Anthropic model IDs
    'us.anthropic.claude-sonnet-4-6': 'claude-sonnet-4-6',
    'us.anthropic.claude-sonnet-4-6[1m]': 'claude-sonnet-4-6',
    'global.anthropic.claude-opus-4-6-v1': 'claude-opus-4-6',
    'global.anthropic.claude-opus-4-6-v1[1m]': 'claude-opus-4-6',
    'global.anthropic.claude-haiku-4-5-20251001-v1:0': 'claude-haiku-4-5-20251001'
}

export function normalizeClaudeModelValue(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const trimmed = value.trim()
    if (!trimmed) {
        return undefined
    }

    return DEPRECATED_CLAUDE_MODEL_VALUE_MAP[trimmed.toLowerCase()] ?? trimmed
}
