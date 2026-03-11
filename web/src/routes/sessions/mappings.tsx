import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSession } from '@/hooks/queries/useSession'
import { LoadingState } from '@/components/LoadingState'
import { MachineMappingsPanel } from '@/components/MachineMappingsPanel'

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

export default function MappingsPage() {
    const { sessionId } = useParams({ from: '/sessions/$sessionId/mappings' })
    const { api } = useAppContext()
    const goBack = useAppGoBack()
    const { session, isLoading, error } = useSession(api, sessionId)
    const machineId = session?.metadata?.machineId?.trim() || null

    const sessionTitle = useMemo(() => {
        if (session?.metadata?.name) return session.metadata.name
        if (session?.metadata?.path) {
            const parts = session.metadata.path.split('/').filter(Boolean)
            return parts[parts.length - 1] || 'Mappings'
        }
        return 'Mappings'
    }, [session])

    if (isLoading && !session) {
        return (
            <div className="flex h-full items-center justify-center p-4">
                <LoadingState label="Loading mappings…" className="text-sm" />
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
                        <div className="truncate font-semibold">Mappings</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{sessionTitle}</div>
                    </div>
                </div>
            </div>

            <div className="mx-auto w-full max-w-content flex-1 overflow-y-auto p-3">
                {error ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                ) : null}
                {!machineId ? (
                    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                        This session is not attached to a machine.
                    </div>
                ) : (
                    <MachineMappingsPanel
                        api={api}
                        machineId={machineId}
                        sessionIdForInvalidation={sessionId}
                        editable
                    />
                )}
            </div>
        </div>
    )
}
