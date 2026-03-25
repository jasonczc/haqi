import { useId, useMemo, useRef, useState } from 'react'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslation } from '@/lib/use-translation'

function getSessionTitle(session: Session): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

function FilesIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
        </svg>
    )
}

function BrowserIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18" />
            <path d="M7 6.5h.01" />
            <path d="M10 6.5h.01" />
        </svg>
    )
}

function SidebarIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
        </svg>
    )
}

function PlugIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M12 2v7" />
            <path d="M9 5h6" />
            <path d="M6 9h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6z" />
            <path d="M12 17v5" />
        </svg>
    )
}

function MoreVerticalIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={props.className}
        >
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
        </svg>
    )
}

export function SessionHeader(props: {
    session: Session
    onBack: () => void
    onOpenSession?: (sessionId: string) => void
    onToggleSidebar?: () => void
    sidebarVisible?: boolean
    onViewPreview?: () => void
    onViewFiles?: () => void
    onViewMcpStatus?: () => void
    api: ApiClient | null
    onSessionDeleted?: () => void
    viewMode?: 'normal' | 'brief' | 'cli'
    onViewModeChange?: (mode: 'normal' | 'brief' | 'cli') => void
}) {
    const { t } = useTranslation()
    const { session, api, onSessionDeleted } = props
    const title = useMemo(() => getSessionTitle(session), [session])
    const displayFlavor = session.metadata?.flavor?.trim() || 'unknown'
    const sidebarToggleLabel = props.sidebarVisible
        ? t('sessions.sidebar.hideDesktop')
        : t('sessions.sidebar.showDesktop')

    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const menuId = useId()
    const menuAnchorRef = useRef<HTMLButtonElement | null>(null)
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    const {
        archiveSession,
        renameSession,
        deleteSession,
        spawnSameConfigSession,
        duplicateSession,
        isPending
    } = useSessionActions(
        api,
        session.id,
        session.metadata?.flavor ?? null
    )
    const { skipArchiveConfirmation } = useArchiveConfirmation()

    const handleDelete = async () => {
        await deleteSession()
        onSessionDeleted?.()
    }

    const handleMenuToggle = () => {
        if (!menuOpen && menuAnchorRef.current) {
            const rect = menuAnchorRef.current.getBoundingClientRect()
            setMenuAnchorPoint({ x: rect.right, y: rect.bottom })
        }
        setMenuOpen((open) => !open)
    }

    const handleArchive = () => {
        if (!skipArchiveConfirmation) {
            setArchiveOpen(true)
            return
        }

        void archiveSession().catch((error) => {
            console.error('Failed to archive session', error)
        })
    }

    const handleSpawnSameConfig = () => {
        void spawnSameConfigSession()
            .then((newSessionId) => {
                props.onOpenSession?.(newSessionId)
            })
            .catch((error) => {
                console.error('Failed to create same-config session', error)
            })
    }

    const handleDuplicate = () => {
        void duplicateSession()
            .then((newSessionId) => {
                props.onOpenSession?.(newSessionId)
            })
            .catch((error) => {
                console.error('Failed to duplicate session', error)
            })
    }

    // In Telegram, don't render header (Telegram provides its own)
    if (isTelegramApp()) {
        return null
    }

    return (
        <>
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full max-w-content items-center gap-1.5 px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={props.onBack}
                            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            aria-label="Back"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>

                        {props.onToggleSidebar ? (
                            <button
                                type="button"
                                onClick={props.onToggleSidebar}
                                className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                title={sidebarToggleLabel}
                                aria-label={sidebarToggleLabel}
                            >
                                <SidebarIcon className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>

                    <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="truncate font-mono text-sm font-semibold leading-none text-[var(--app-fg)]" title={title}>
                            {title}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-[var(--app-hint)]" title={displayFlavor}>
                            {displayFlavor}
                        </div>
                    </div>

                    {props.viewMode && props.onViewModeChange ? (
                        <div className="flex shrink-0 items-center rounded-sm border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/40 p-0.5">
                            {([
                                ['normal', 'N'],
                                ['brief', 'B'],
                                ['cli', 'CLI']
                            ] as const).map(([mode, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    className={`rounded-sm px-1.5 py-0.5 text-[10px] leading-none transition-colors ${props.viewMode === mode
                                        ? 'bg-[var(--app-bg)] text-[var(--app-fg)]'
                                        : 'text-[var(--app-hint)] hover:text-[var(--app-fg)]'} ${mode === 'cli' ? 'font-mono' : ''}`}
                                    onClick={() => props.onViewModeChange!(mode)}
                                    aria-label={mode}
                                    title={mode === 'normal' ? 'Normal' : mode === 'brief' ? 'Brief' : 'CLI'}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <div className="flex shrink-0 items-center gap-0.5">
                        {props.onViewPreview ? (
                            <button
                                type="button"
                                onClick={props.onViewPreview}
                                className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                title="Preview"
                                aria-label="Preview"
                            >
                                <BrowserIcon className="h-4 w-4" />
                            </button>
                        ) : null}

                        {props.onViewFiles ? (
                            <button
                                type="button"
                                onClick={props.onViewFiles}
                                className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                title={t('session.title')}
                                aria-label={t('session.title')}
                            >
                                <FilesIcon className="h-4 w-4" />
                            </button>
                        ) : null}

                        {props.onViewMcpStatus ? (
                            <button
                                type="button"
                                onClick={props.onViewMcpStatus}
                                className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                title={t('session.mcpStatus')}
                                aria-label={t('session.mcpStatus')}
                            >
                                <PlugIcon className="h-4 w-4" />
                            </button>
                        ) : null}

                        <button
                            type="button"
                            onClick={handleMenuToggle}
                            onPointerDown={(e) => e.stopPropagation()}
                            ref={menuAnchorRef}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-controls={menuOpen ? menuId : undefined}
                            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title={t('session.more')}
                        >
                            <MoreVerticalIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={session.active}
                onRename={() => setRenameOpen(true)}
                onSpawnSameConfig={handleSpawnSameConfig}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onDelete={() => setDeleteOpen(true)}
                anchorPoint={menuAnchorPoint}
                menuId={menuId}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={title}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: title })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={t('dialog.delete.description', { name: title })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={handleDelete}
                isPending={isPending}
                destructive
            />
        </>
    )
}
