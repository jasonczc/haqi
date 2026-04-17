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
import { StatusDot } from '@/components/ui/StatusDot'
import { Button } from '@/components/ui/button'
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
            <div className="chat-header bg-[var(--chrome)] pt-[env(safe-area-inset-top)]">
                <div
                    className="flex items-center border-b border-[var(--border-tertiary)] px-4"
                    style={{ height: 'var(--navbar-height)', gap: 'var(--context-tab-gap)' }}
                >
                    {/* Back button — 28x28 icon-btn */}
                    <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        onClick={props.onBack}
                        aria-label="Back"
                        leadingIcon={
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        }
                    />

                    <StatusDot
                        tone={session.metadata?.containerId ? 'success' : 'idle'}
                        size={8}
                        title={session.metadata?.containerId ? 'Running' : 'Idle'}
                    />

                    {/* Title row: session title + repo in a single baseline-aligned line */}
                    <div className="chat-title flex min-w-0 flex-1 items-baseline gap-2">
                        <h2
                            className="truncate text-[length:var(--font-size-base)] text-[var(--text-primary)]"
                            style={{ fontWeight: 'var(--font-weight-semibold)' }}
                        >
                            {title}
                        </h2>
                        {session.metadata?.repositoryUrl ? (
                            <span className="chat-repo truncate text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                                {extractRepoShortName(session.metadata.repositoryUrl)}
                            </span>
                        ) : null}
                    </div>

                    {/* Right-side icon cluster */}
                    <div className="chat-header-controls flex items-center gap-1">
                        {session.metadata?.containerId ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                onClick={() => setCheckpointDialogOpen(true)}
                                title="Save checkpoint"
                                leadingIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l7-3 7 3z"/></svg>}
                            />
                        ) : null}

                        {props.onToggleWorkbench ? (
                            <Button
                                variant={props.workbenchOpen ? 'default' : 'ghost'}
                                size="sm"
                                iconOnly
                                onClick={props.onToggleWorkbench}
                                title="Toggle workbench"
                                aria-label="Toggle workbench"
                                leadingIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>}
                            />
                        ) : null}

                        <Button
                            ref={menuAnchorRef}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            onClick={handleMenuToggle}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-controls={menuOpen ? menuId : undefined}
                            title={t('session.more')}
                            leadingIcon={<MoreVerticalIcon />}
                        />
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
                onSaveCheckpoint={session.metadata?.containerId ? () => setCheckpointDialogOpen(true) : undefined}
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
                            className="w-full rounded-md border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
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
                                className="rounded-md px-3 py-1.5 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSaveCheckpoint()}
                                disabled={checkpointSaving || !checkpointName.trim()}
                                className="rounded-md bg-[var(--bg-neutral)] px-3 py-1.5 text-sm text-[var(--bg-editor)] hover:opacity-90 disabled:opacity-60"
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
