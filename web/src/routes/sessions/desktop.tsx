import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { inferRemoteDesktopMetadata } from '@hapi/protocol/remoteDesktop'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSession } from '@/hooks/queries/useSession'
import { LoadingState } from '@/components/LoadingState'
import { useTranslation } from '@/lib/use-translation'

function BackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

export default function DesktopPage() {
    const { sessionId } = useParams({ from: '/sessions/$sessionId/desktop' })
    const { api } = useAppContext()
    const goBack = useAppGoBack()
    const { t } = useTranslation()
    const { session, isLoading, error } = useSession(api, sessionId)

    const desktop = useMemo(() => {
        if (!session?.metadata) {
            return undefined
        }
        return session.metadata.remoteDesktop
            ?? inferRemoteDesktopMetadata(session.metadata.previewUrls)
    }, [session?.metadata])

    const sessionTitle = useMemo(() => {
        if (session?.metadata?.name) {
            return session.metadata.name
        }
        if (session?.metadata?.path) {
            const parts = session.metadata.path.split('/').filter(Boolean)
            return parts[parts.length - 1] || t('session.desktop.title')
        }
        return t('session.desktop.title')
    }, [session?.metadata?.name, session?.metadata?.path, t])

    const frameUrl = desktop?.novncUrl ?? null
    const canEmbed = Boolean(frameUrl && !desktop?.warnHttpUrl && desktop?.kind === 'novnc')

    if (isLoading && !session) {
        return (
            <div className="flex h-full items-center justify-center p-4">
                <LoadingState label={t('session.desktop.loading')} className="text-sm" />
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full max-w-content items-center gap-2 p-3">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        aria-label="Back"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{t('session.desktop.title')}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{sessionTitle}</div>
                    </div>
                    {frameUrl ? (
                        <a
                            href={frameUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                        >
                            {t('session.desktop.openExternal')}
                        </a>
                    ) : null}
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-content flex-1 min-h-0 flex-col gap-3 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {error ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
                ) : null}

                {!desktop ? (
                    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-4 text-sm text-[var(--app-hint)]">
                        {t('session.desktop.empty')}
                    </div>
                ) : null}

                {desktop?.warnHttpUrl ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        {t('session.desktop.vncRawWarning')}
                    </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--app-border)] bg-black">
                    {canEmbed && frameUrl ? (
                        <iframe
                            src={frameUrl}
                            title={`${t('session.desktop.title')} ${sessionId}`}
                            className="h-full w-full border-0"
                            allow="clipboard-read; clipboard-write"
                        />
                    ) : desktop && frameUrl && !canEmbed ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--app-hint)]">
                            <p>{t('session.desktop.cannotEmbed')}</p>
                            <a
                                href={frameUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md bg-[var(--app-link)] px-4 py-2 text-sm font-medium text-white"
                            >
                                {t('session.desktop.openExternal')}
                            </a>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center p-4 text-sm text-[var(--app-hint)]">
                            {t('session.desktop.noFrame')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
