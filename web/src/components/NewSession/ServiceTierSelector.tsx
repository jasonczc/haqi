import { useTranslation } from '@/lib/use-translation'
import { CursorFieldLabel, CursorSelect } from '@/components/settings/CursorSettingsPrimitives'
import { CODEX_SERVICE_TIER_OPTIONS, type AgentType, type ServiceTier } from './types'

export function ServiceTierSelector(props: {
    agent: AgentType
    serviceTier: ServiceTier
    isDisabled: boolean
    onServiceTierChange: (value: ServiceTier) => void
}) {
    const { t } = useTranslation()
    if (props.agent !== 'codex') {
        return null
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>
                {t('newSession.serviceTier')}{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </CursorFieldLabel>
            <CursorSelect
                value={props.serviceTier}
                onChange={(e) => props.onServiceTierChange(e.target.value as ServiceTier)}
                disabled={props.isDisabled}
                className="min-w-0"
            >
                {CODEX_SERVICE_TIER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </CursorSelect>
        </div>
    )
}
