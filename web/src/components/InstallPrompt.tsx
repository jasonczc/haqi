import { useState } from 'react'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { usePlatform } from '@/hooks/usePlatform'
import { CloseIcon, ShareIcon, PlusCircleIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

export function InstallPrompt() {
    const { t } = useTranslation()
    const { canInstall, canInstallIOS, promptInstall, dismissInstall, isStandalone } = usePWAInstall()
    const { isTelegram, haptic } = usePlatform()
    const [showIOSGuide, setShowIOSGuide] = useState(false)

    if (isTelegram || isStandalone) {
        return null
    }

    // iOS Safari install guide
    if (canInstallIOS) {
        if (showIOSGuide) {
            return (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--bg-overlay)]">
                    <div className="w-full max-w-lg animate-slide-up space-y-4 rounded-t-2xl bg-[var(--bg-editor)] p-5 pb-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-[var(--text-primary)]">
                                {t('install.title')}
                            </h3>
                            <button
                                onClick={() => setShowIOSGuide(false)}
                                className="-mr-1 p-1 text-[var(--text-tertiary)] active:opacity-60"
                                aria-label="Close"
                            >
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-neutral)] text-sm font-medium text-[var(--bg-editor)]">
                                    1
                                </div>
                                <div className="flex-1 pt-1">
                                    <p className="text-sm text-[var(--text-primary)]">
                                        Tap the <ShareIcon className="inline w-5 h-5 align-text-bottom" /> Share button in the toolbar
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-neutral)] text-sm font-medium text-[var(--bg-editor)]">
                                    2
                                </div>
                                <div className="flex-1 pt-1">
                                    <p className="text-sm text-[var(--text-primary)]">
                                        Scroll down and tap <PlusCircleIcon className="inline w-5 h-5 align-text-bottom" /> <strong>Add to Home Screen</strong>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-neutral)] text-sm font-medium text-[var(--bg-editor)]">
                                    3
                                </div>
                                <div className="flex-1 pt-1">
                                    <p className="text-sm text-[var(--text-primary)]">
                                        Tap <strong>Add</strong> in the top right corner
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                setShowIOSGuide(false)
                                dismissInstall()
                            }}
                            className="w-full py-3 text-sm text-[var(--text-tertiary)] active:opacity-60"
                        >
                            {t('button.dismiss')}
                        </button>
                    </div>
                </div>
            )
        }

        return (
            <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-editor)] p-4 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            {t('install.title')}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                            {t('install.description')}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            haptic.impact('light')
                            setShowIOSGuide(true)
                        }}
                        className="shrink-0 rounded-lg bg-[var(--bg-neutral)] px-4 py-2 text-sm font-medium text-[var(--bg-editor)] active:opacity-80"
                    >
                        {t('install.button')}
                    </button>
                    <button
                        onClick={() => {
                            haptic.impact('light')
                            dismissInstall()
                        }}
                        className="shrink-0 p-2 text-[var(--text-tertiary)] active:opacity-60"
                        aria-label="Dismiss"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )
    }

    // Chrome/Edge install prompt
    if (!canInstall) {
        return null
    }

    const handleInstall = async () => {
        haptic.impact('light')
        const success = await promptInstall()
        if (success) {
            haptic.notification('success')
        }
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-editor)] p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                        {t('install.title')}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                        {t('install.description')}
                    </p>
                </div>
                <button
                    onClick={handleInstall}
                    className="shrink-0 rounded-lg bg-[var(--bg-neutral)] px-4 py-2 text-sm font-medium text-[var(--bg-editor)] active:opacity-80"
                >
                    {t('install.button')}
                </button>
                <button
                    onClick={() => {
                        haptic.impact('light')
                        dismissInstall()
                    }}
                    className="shrink-0 p-2 text-[var(--text-tertiary)] active:opacity-60"
                    aria-label="Dismiss"
                >
                    <CloseIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
