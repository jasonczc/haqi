import { useTranslation } from '@/lib/use-translation'
import type { AgentType, ThinkEffort } from './types'
import { CLAUDE_THINK_EFFORT_OPTIONS, CODEX_THINK_EFFORT_OPTIONS } from './types'

export function ThinkEffortSelector(props: {
    agent: AgentType
    thinkEffort: ThinkEffort
    isDisabled: boolean
    onThinkEffortChange: (value: ThinkEffort) => void
}) {
    const { t } = useTranslation()
    if (props.agent !== 'claude' && props.agent !== 'codex') {
        return null
    }
    const options = props.agent === 'claude'
        ? CLAUDE_THINK_EFFORT_OPTIONS
        : CODEX_THINK_EFFORT_OPTIONS

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.think')}{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </label>
            <select
                value={props.thinkEffort}
                onChange={(e) => props.onThinkEffortChange(e.target.value as ThinkEffort)}
                disabled={props.isDisabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    )
}
