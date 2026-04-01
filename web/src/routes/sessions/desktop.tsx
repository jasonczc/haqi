import { useParams } from '@tanstack/react-router'
import { useAppGoBack } from '@/hooks/useAppGoBack'

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
    const goBack = useAppGoBack()

    const desktopUrl = `/desktop/${sessionId}`

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
                        <div className="truncate font-semibold">Desktop</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{sessionId.slice(0, 8)}...</div>
                    </div>
                </div>
            </div>
            <iframe
                src={desktopUrl}
                className="min-h-0 flex-1 border-0"
                title="Remote Desktop"
            />
        </div>
    )
}
