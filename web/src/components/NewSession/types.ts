export type AgentType = 'claude' | 'codex' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'
export type ThinkEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
export type CodexThinkEffort = ThinkEffort

export const CODEX_THINK_EFFORT_OPTIONS: { value: ThinkEffort; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' }
]

export const CLAUDE_THINK_EFFORT_OPTIONS: { value: ThinkEffort; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' }
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

export const MODEL_OPTIONS: Record<AgentType, { value: string; label: string }[]> = {
    claude: [
        { value: 'auto', label: 'Auto' },
        { value: 'opus', label: 'Opus' },
        { value: 'sonnet', label: 'Sonnet' },
    ],
    codex: [
        { value: 'auto', label: 'Auto' },
        { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
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
    gemini: [
        { value: 'auto', label: 'Auto' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    opencode: [],
}
