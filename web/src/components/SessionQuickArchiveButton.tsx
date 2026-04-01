import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

export function SessionQuickArchiveButton(props: {
    enabled: boolean
    visible: boolean
    isPending: boolean
    compact: boolean
    onArchive: () => Promise<void>
}) {
    const { enabled, visible, isPending, compact, onArchive } = props
    const { t } = useTranslation()
    const [confirming, setConfirming] = useState(false)

    if (!enabled || !visible) {
        return null
    }

    const handleClick = () => {
        if (isPending) {
            return
        }
        if (!confirming) {
            setConfirming(true)
            return
        }

        void onArchive()
            .catch((error) => {
                console.error('Failed to archive session', error)
            })
    }

    return (
        <button
            type="button"
            onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleClick()
            }}
            onMouseLeave={() => {
                if (!isPending) {
                    setConfirming(false)
                }
            }}
            onBlur={() => {
                if (!isPending) {
                    setConfirming(false)
                }
            }}
            disabled={isPending}
            className={`absolute z-10 rounded-md border border-[var(--app-divider)] bg-[var(--app-bg)] px-2 py-1 font-medium text-[var(--app-danger,#ef4444)] shadow-sm transition-all disabled:cursor-not-allowed ${compact ? 'right-2.5 top-1 text-[11px]' : 'right-3 top-2 text-xs'}`}
            aria-label={confirming ? t('session.action.confirmArchive') : t('session.action.archive')}
            title={confirming ? t('session.action.confirmArchive') : t('session.action.archive')}
        >
            {isPending
                ? t('dialog.archive.confirming')
                : confirming
                    ? t('session.action.confirmArchive')
                    : t('session.action.archive')}
        </button>
    )
}
