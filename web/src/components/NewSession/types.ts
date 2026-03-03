export type AgentType = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'
export type ThinkEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
export type ModelOption = { value: string; label: string }
export type CodexThinkEffort = ThinkEffort
export type ServiceTier = 'auto' | 'fast' | 'flex'

export const CLAUDE_THINK_EFFORT_OPTIONS: { value: ThinkEffort; label: string }[] = [
    { value: 'high', label: 'High' },
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
]

export const CODEX_THINK_EFFORT_OPTIONS: { value: ThinkEffort; label: string }[] = [
    { value: 'xhigh', label: 'XHigh' },
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
]

export const CODEX_SERVICE_TIER_OPTIONS: { value: ServiceTier; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'fast', label: 'Fast' },
    { value: 'flex', label: 'Flex' },
]

export function getThinkEffortOptions(agent: AgentType): { value: ThinkEffort; label: string }[] {
    if (agent === 'claude') {
        return CLAUDE_THINK_EFFORT_OPTIONS
    }
    if (agent === 'codex') {
        return CODEX_THINK_EFFORT_OPTIONS
    }
    return []
}

export const MODEL_OPTIONS: Record<AgentType, ModelOption[]> = {
    claude: [
        { value: 'us.anthropic.claude-sonnet-4-6[1m]', label: 'Sonnet (1M context)' },
        { value: 'global.anthropic.claude-opus-4-6-v1[1m]', label: 'Opus (1M context)' },
        { value: 'auto', label: 'Default (recommended)' },
        { value: 'us.anthropic.claude-sonnet-4-6', label: 'Sonnet 4.6' },
        { value: 'global.anthropic.claude-opus-4-6-v1', label: 'Opus 4.6' },
        { value: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Haiku' },
    ],
    codex: [
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { value: 'auto', label: 'Auto' },
        { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { value: 'gpt-5.2', label: 'GPT-5.2' },
        { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
        { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
        { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
        { value: 'gpt-5.1', label: 'GPT-5.1' },
        { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
        { value: 'gpt-5-codex-mini', label: 'GPT-5 Codex Mini' },
        { value: 'gpt-5', label: 'GPT-5' },
    ],
    cursor: [],
    gemini: [
        { value: 'auto-gemini-3', label: 'Auto (Gemini 3)' },
        { value: 'auto-gemini-2.5', label: 'Auto (Gemini 2.5)' },
        { value: 'manual', label: 'Manual' },
    ],
    opencode: [],
}
