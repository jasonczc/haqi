import type { Machine } from '@/types/api'
import { CursorFieldLabel, CursorSelect } from '@/components/settings/CursorSettingsPrimitives'
import { useTranslation } from '@/lib/use-translation'

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

export function MachineSelector(props: {
    machines: Machine[]
    machineId: string | null
    showAutoOption?: boolean
    isLoading?: boolean
    isDisabled: boolean
    onChange: (machineId: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>{t('newSession.machine')}</CursorFieldLabel>
            <CursorSelect
                value={props.machineId ?? ''}
                onChange={(e) => props.onChange(e.target.value)}
                disabled={props.isDisabled}
                className="min-w-0"
            >
                {props.showAutoOption ? (
                    <option value="auto">
                        {t('newSession.machine.auto')}
                    </option>
                ) : null}
                {props.isLoading && (
                    <option value="">{t('loading.machines')}</option>
                )}
                {!props.isLoading && props.machines.length === 0 && !props.showAutoOption && (
                    <option value="">{t('misc.noMachines')}</option>
                )}
                {props.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                        {getMachineTitle(m)}
                        {m.metadata?.platform ? ` (${m.metadata.platform})` : ''}
                    </option>
                ))}
            </CursorSelect>
        </div>
    )
}
