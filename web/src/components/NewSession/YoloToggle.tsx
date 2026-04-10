import { useTranslation } from '@/lib/use-translation'
import { CursorFieldLabel, CursorToggleRow } from '@/components/settings/CursorSettingsPrimitives'

export function YoloToggle(props: {
    yoloMode: boolean
    isDisabled: boolean
    onToggle: (value: boolean) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>{t('newSession.yolo')}</CursorFieldLabel>
            <CursorToggleRow
                label={t('newSession.yolo.title')}
                description={t('newSession.yolo.desc')}
                checked={props.yoloMode}
                onCheckedChange={props.onToggle}
                disabled={props.isDisabled}
                className="border-0 bg-transparent px-0 py-0"
            />
        </div>
    )
}
