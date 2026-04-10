import type { AgentType, ModelOption } from './types'
import { getModelOptionsForAgent } from './types'
import { CursorFieldHint, CursorFieldLabel, CursorSelect, CursorTextField } from '@/components/settings/CursorSettingsPrimitives'
import { useTranslation } from '@/lib/use-translation'

export function ModelSelector(props: {
    agent: AgentType
    model: string
    customModel: string
    isDisabled: boolean
    onModelChange: (value: string) => void
    onCustomModelChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const options: ModelOption[] = getModelOptionsForAgent(props.agent)
    if (options.length === 0) {
        return null
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>
                {t('newSession.model')}{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </CursorFieldLabel>
            <CursorSelect
                value={props.model}
                onChange={(e) => props.onModelChange(e.target.value)}
                disabled={props.isDisabled}
                className="min-w-0"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </CursorSelect>
            <CursorTextField
                type="text"
                value={props.customModel}
                onChange={(e) => props.onCustomModelChange(e.target.value)}
                disabled={props.isDisabled}
                placeholder={t('newSession.model.customPlaceholder')}
            />
            <CursorFieldHint className="pt-0">
                {t('newSession.model.customHint')}
            </CursorFieldHint>
        </div>
    )
}
