import type { AgentType } from './types'
import { CursorChoiceRow, CursorFieldLabel } from '@/components/settings/CursorSettingsPrimitives'
import { useTranslation } from '@/lib/use-translation'

export function AgentSelector(props: {
    agent: AgentType
    isDisabled: boolean
    onAgentChange: (value: AgentType) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>{t('newSession.agent')}</CursorFieldLabel>
            <div className="flex gap-3">
                {(['claude', 'codex', 'cursor', 'gemini', 'opencode'] as const).map((agentType) => (
                    <CursorChoiceRow
                        key={agentType}
                        name="agent"
                        value={agentType}
                        checked={props.agent === agentType}
                        onChange={() => props.onAgentChange(agentType)}
                        disabled={props.isDisabled}
                        label={<span className="capitalize">{agentType}</span>}
                        controlClassName="gap-1.5"
                    />
                ))}
            </div>
        </div>
    )
}
