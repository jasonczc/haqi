import { Spinner } from '@/components/Spinner'
import { CursorButton } from '@/components/settings/CursorSettingsPrimitives'
import { useTranslation } from '@/lib/use-translation'

export function ActionButtons(props: {
    isPending: boolean
    canCreate: boolean
    isDisabled: boolean
    onCancel: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex gap-2 px-3 py-3">
            <CursorButton
                type="button"
                variant="outline"
                onClick={props.onCancel}
                disabled={props.isDisabled}
            >
                {t('button.cancel')}
            </CursorButton>
            <CursorButton
                type="submit"
                disabled={!props.canCreate}
                aria-busy={props.isPending}
                className="gap-2"
            >
                {props.isPending ? (
                    <>
                        <Spinner size="sm" label={null} className="text-current" />
                        {t('newSession.creating')}
                    </>
                ) : (
                    t('newSession.create')
                )}
            </CursorButton>
        </div>
    )
}
