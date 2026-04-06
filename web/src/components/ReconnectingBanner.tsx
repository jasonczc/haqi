import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useTranslation } from '@/lib/use-translation'

function getReasonLabel(reason: string, t: (key: string) => string): string {
    if (reason === 'heartbeat-timeout') {
        return t('reconnecting.reason.heartbeatTimeout')
    }
    if (reason === 'closed') {
        return t('reconnecting.reason.closed')
    }
    if (reason === 'error') {
        return t('reconnecting.reason.error')
    }
    return reason
}

export function ReconnectingBanner({
    isReconnecting,
    reason
}: {
    isReconnecting: boolean
    reason?: string | null
}) {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()
    const reasonLabel = reason ? getReasonLabel(reason, t) : null

    // Don't show if offline (OfflineBanner takes precedence) or if not reconnecting
    if (!isReconnecting || !isOnline) {
        return null
    }

    return (
        <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-[var(--warn)]/20 bg-[var(--warn)]/12 py-2 text-center text-sm font-medium text-[var(--warn)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t('reconnecting.message')}
            {reasonLabel ? <span className="opacity-90">({reasonLabel})</span> : null}
        </div>
    )
}
