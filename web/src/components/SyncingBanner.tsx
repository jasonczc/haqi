import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'

export function SyncingBanner({ isSyncing }: { isSyncing: boolean }) {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()

    // Don't show syncing banner when offline (OfflineBanner takes precedence)
    if (!isSyncing || !isOnline) {
        return null
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 border-b border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] py-2 text-center text-sm font-medium text-[var(--cursor-text-primary)]">
            <Spinner size="sm" label={null} className="text-[var(--cursor-text-primary)]" />
            {t('syncing.title')}
        </div>
    )
}
