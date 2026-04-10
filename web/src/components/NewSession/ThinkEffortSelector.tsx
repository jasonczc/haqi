import { useTranslation } from '@/lib/use-translation'
import { CursorFieldLabel, CursorSelect } from '@/components/settings/CursorSettingsPrimitives'
import type { AgentType, ThinkEffort } from './types'
import { getThinkEffortOptions } from './types'

export function ThinkEffortSelector(props: {
    agent: AgentType
    thinkEffort: ThinkEffort
    isDisabled: boolean
    onThinkEffortChange: (value: ThinkEffort) => void
}) {
    const { t } = useTranslation()
    const options = getThinkEffortOptions(props.agent)
    if (options.length === 0) {
        return null
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>
                {t('newSession.think')}{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </CursorFieldLabel>
            <CursorSelect
                value={props.thinkEffort}
                onChange={(e) => props.onThinkEffortChange(e.target.value as ThinkEffort)}
                disabled={props.isDisabled}
                className="min-w-0"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </CursorSelect>
        </div>
    )
}
