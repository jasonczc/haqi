import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'

function extractRepoShortName(url: string): string {
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
    const [checkpointDialogOpen, setCheckpointDialogOpen] = useState(false)
    const [checkpointName, setCheckpointName] = useState('')
    const [checkpointSaving, setCheckpointSaving] = useState(false)
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

    const handleSaveCheckpoint = useCallback(async () => {
        const name = checkpointName.trim()
        if (!name || !api) return
        setCheckpointSaving(true)
        try {
            const result = await api.saveCheckpoint(session.id, name)
            addToast({ title: 'Checkpoint Saved', body: `ID: ${result.checkpointId}`, sessionId: session.id, url: '' })
            setCheckpointDialogOpen(false)
            setCheckpointName('')
        } catch (err) {
            addToast({ title: 'Error', body: err instanceof Error ? err.message : 'Failed to save checkpoint', sessionId: session.id, url: '' })
        } finally {
            setCheckpointSaving(false)
        }
    }, [api, session.id, checkpointName, addToast])



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
            <div className="chat-header bg-[var(--bg-editor)] pt-[env(safe-area-inset-top)]">
                <div className="flex min-h-[60px] items-center gap-2 px-4 border-b border-[var(--border-quaternary)]">
                    {/* Back button */}
                    <button
                        type="button"
                        onClick={props.onBack}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    >
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
                    </button>

                    {/* Single-line title area */}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[var(--font-size-base)] font-[var(--font-weight-semibold)] text-[var(--text-primary)]">
                            {title}
                        </div>
                        {session.metadata?.repositoryUrl ? (
                            <div className="truncate text-[12px] text-[var(--text-tertiary)]">
                                {extractRepoShortName(session.metadata.repositoryUrl)}
                            </div>
                        ) : null}
                    </div>

                    {props.onToggleWorkbench ? (
                        <button
                            type="button"
                            onClick={props.onToggleWorkbench}
                            className={`flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[var(--font-size-base)] transition-colors ${
                                props.workbenchOpen
                                    ? 'bg-[var(--bg-neutral)] text-[var(--bg-editor)]'
                                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                            }`}
                            title="Toggle workbench"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
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
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title={t('session.more')}
                    >
                        <MoreVerticalIcon />
                    </button>
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

            <Dialog open={checkpointDialogOpen} onOpenChange={setCheckpointDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Checkpoint</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 pt-2">
                        <input
                            type="text"
                            placeholder="Checkpoint name"
                            value={checkpointName}
                            onChange={(e) => setCheckpointName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && checkpointName.trim()) {
                                    void handleSaveCheckpoint()
                                }
                            }}
                            disabled={checkpointSaving}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-60"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setCheckpointDialogOpen(false)
                                    setCheckpointName('')
                                }}
                                disabled={checkpointSaving}
                                className="rounded-md px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSaveCheckpoint()}
                                disabled={checkpointSaving || !checkpointName.trim()}
                                className="rounded-md bg-[var(--app-link)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
                            >
                                {checkpointSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
