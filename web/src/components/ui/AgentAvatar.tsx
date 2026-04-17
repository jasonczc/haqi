import type { AgentType } from '@/components/NewSession/types'

/**
 * Per-agent brand avatar — 1 letter / symbol on a colored tile.
 *
 * Colors are static and intentionally abstract (not real brand logos).
 * Used in: model chip, agent popover, will-run summary, session list.
 */
const AGENT_AVATAR_CONFIG: Record<AgentType, { letter: string; bg: string; fg: string }> = {
    claude:   { letter: 'C', bg: '#E27C52', fg: '#ffffff' },
    codex:    { letter: 'X', bg: '#171717', fg: '#ffffff' },
    cursor:   { letter: '⌘', bg: '#6366f1', fg: '#ffffff' },
    gemini:   { letter: 'G', bg: '#4285f4', fg: '#ffffff' },
    opencode: { letter: 'O', bg: '#14b8a6', fg: '#ffffff' },
}

export function AgentAvatar(props: { agent: AgentType; size?: number; className?: string }) {
    const cfg = AGENT_AVATAR_CONFIG[props.agent]
    const size = props.size ?? 18
    return (
        <span
            className={['agent-avatar', props.className].filter(Boolean).join(' ')}
            style={{ width: size, height: size, background: cfg.bg, color: cfg.fg }}
            aria-hidden
        >
            {cfg.letter}
        </span>
    )
}
