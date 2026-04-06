import { useTranslation } from '@/lib/use-translation'
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
            <label className="text-xs font-medium text-[var(--cursor-text-secondary)]">
                {t('newSession.serviceTier')}{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </label>
            <select
                value={props.serviceTier}
                onChange={(e) => props.onServiceTierChange(e.target.value as ServiceTier)}
                disabled={props.isDisabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)] text-[var(--cursor-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)] disabled:opacity-50"
            >
                {CODEX_SERVICE_TIER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    )
}
