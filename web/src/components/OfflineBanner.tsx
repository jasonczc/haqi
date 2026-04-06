import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useTranslation } from '@/lib/use-translation'

export function OfflineBanner() {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()

    if (isOnline) {
        return null
    }

    return (
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--warn)]/20 bg-[var(--warn)]/12 py-2 text-center text-sm font-medium text-[var(--warn)]">
            {t('offline.message')}
        </div>
    )
}
