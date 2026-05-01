import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'

export function extractRepoShortName(url: string): string {
    const match = url.match(/([^/]+\/[^/.]+?)(?:\.git)?$/)
    return match ? match[1] : url
}

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

function CloudBranchIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
            aria-hidden="true"
        >
            <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 0 0 4.5 12.5" />
            <path d="M8 19h9" />
        </svg>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
            aria-hidden="true"
        >
            <polyline points="6 9 12 15 18 9" />
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
    onViewDesktop?: () => void
    onViewTerminal?: () => void
    onViewFiles?: () => void
    onViewMcpStatus?: () => void
    onToggleWorkbench?: () => void
    workbenchOpen?: boolean
    api: ApiClient | null
    onSessionDeleted?: () => void
}) {
    const { t } = useTranslation()
    const { session, api, onSessionDeleted } = props
    const title = useMemo(() => getSessionTitle(session), [session])

    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const menuId = useId()
    const menuAnchorRef = useRef<HTMLButtonElement | null>(null)
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const { addToast } = useToast()

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

    const handleShare = useCallback(() => {
        if (typeof window === 'undefined') return
        const url = window.location.href
        const finish = () => {
            addToast({ title: 'Link copied', body: url, sessionId: session.id, url })
        }
        try {
            if (navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(url).then(finish).catch(() => {
                    addToast({ title: 'Share', body: url, sessionId: session.id, url })
                })
                return
            }
        } catch {
            /* ignore */
        }
        addToast({ title: 'Share', body: url, sessionId: session.id, url })
    }, [addToast, session.id])

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
            <header className="main-header">
                {props.onToggleSidebar && props.sidebarVisible === false ? (
                    <button
                        type="button"
                        className="header-sidebar-toggle"
                        onClick={props.onToggleSidebar}
                        title={t('sessions.sidebar.showDesktop') || 'Show sidebar'}
                        aria-label="Expand sidebar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                ) : null}
                <div className="breadcrumb">
                    <span className="breadcrumb-icon text-[var(--cursor-text-secondary)]">
                        <CloudBranchIcon />
                    </span>
                    <button
                        type="button"
                        onClick={props.onBack}
                        className="breadcrumb-repo min-w-0 truncate hover:text-[var(--cursor-text-primary)] transition-colors"
                    >
                        Sessions
                    </button>
                    <span className="breadcrumb-sep shrink-0">/</span>
                    <span className="breadcrumb-title min-w-0 truncate text-[var(--cursor-text-primary)]" style={{ fontWeight: 600 }}>
                        &ldquo;{title}&rdquo;
                    </span>
                    <span className="shrink-0 opacity-60" style={{ marginLeft: '2px' }}>
                        <ChevronDownIcon />
                    </span>
                </div>

                <div className="header-actions">
                    <button type="button" onClick={handleShare} className="btn-share">
                        Share
                    </button>

                    <button
                        ref={menuAnchorRef}
                        type="button"
                        className="icon-action-btn header-more-btn"
                        onClick={handleMenuToggle}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={menuOpen ? menuId : undefined}
                        title={t('session.more')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="19" cy="12" r="1.6" />
                        </svg>
                    </button>

                    {props.onToggleWorkbench ? (
                        <button
                            type="button"
                            className="icon-action-btn header-workbench-toggle"
                            onClick={props.onToggleWorkbench}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-pressed={Boolean(props.workbenchOpen)}
                            title={props.workbenchOpen ? 'Hide workbench' : 'Show workbench'}
                            aria-label={props.workbenchOpen ? 'Hide workbench' : 'Show workbench'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="15" y1="3" x2="15" y2="21" />
                            </svg>
                        </button>
                    ) : null}
                </div>
            </header>

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
                align="end"
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
