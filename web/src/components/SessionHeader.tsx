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

function DesktopIcon(props: { className?: string }) {
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
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    )
}

function TerminalIcon(props: { className?: string }) {
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
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    )
}

function SaveIcon(props: { className?: string }) {
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
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
        </svg>
    )
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
    onViewDesktop?: () => void
    onViewTerminal?: () => void
    onViewFiles?: () => void
    onViewMcpStatus?: () => void
    api: ApiClient | null
    onSessionDeleted?: () => void
}) {
    const { t } = useTranslation()
    const { session, api, onSessionDeleted } = props
    const title = useMemo(() => getSessionTitle(session), [session])
    const worktreeBranch = session.metadata?.worktree?.branch
    const executionBackend = session.metadata?.executionBackend
    const runtimeKind = session.metadata?.runtimeKind
    const workspaceId = session.metadata?.workspaceId
    const spawnRequestId = session.metadata?.spawnRequestId
    const checkpointId = session.metadata?.checkpointId
    const launchMode = session.metadata?.launchMode
    const repoSyncStatus = session.metadata?.repoSyncStatus
    const workspaceBranch = session.metadata?.workspaceBranch
    const containerId = session.metadata?.containerId
    const workspaceMode = session.metadata?.workspaceMode
    const workerId = session.metadata?.workerId
    const environmentId = session.metadata?.environmentId
    const environmentVersion = session.metadata?.environmentVersion
    const repositoryRef = session.metadata?.repositoryRef
    const repositoryProvider = session.metadata?.repositoryProvider
    const terminalDescriptorCount = session.metadata?.terminalDescriptors?.length ?? 0
    const languageServerCount = session.metadata?.languageServers?.length ?? 0
    const setupStatus = session.metadata?.setupStatus
    const serviceEndpointCount = session.metadata?.serviceEndpoints?.length ?? 0
    const previewCount = session.metadata?.previewUrls?.length ?? 0
    const displayModel = session.metadata?.model?.trim() || session.modelMode || 'default'
    const displayThinkEffort = session.metadata?.thinkEffort?.trim()
    const displayServiceTier = session.metadata?.serviceTier?.trim()
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

    const showSaveCheckpoint = session.active && Boolean(containerId)

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
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3">
                    <div className="flex items-center gap-1">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={props.onBack}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
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

                        {props.onToggleSidebar ? (
                            <button
                                type="button"
                                onClick={props.onToggleSidebar}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                title={sidebarToggleLabel}
                                aria-label={sidebarToggleLabel}
                            >
                                <SidebarIcon />
                            </button>
                        ) : null}
                    </div>

                    {/* Session info - two lines: title and path */}
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                            {title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--app-hint)]">
                            <span className="inline-flex items-center gap-1">
                                <span aria-hidden="true">❖</span>
                                {session.metadata?.flavor?.trim() || 'unknown'}
                            </span>
                            <span>
                                {t('session.item.model')}: {displayModel}
                                {displayThinkEffort ? ` · ${t('session.item.thinkLevel')}: ${displayThinkEffort}` : ''}
                                {displayServiceTier ? ` · ${t('newSession.serviceTier')}: ${displayServiceTier}` : ''}
                            </span>
                            {executionBackend ? (
                                <span>{executionBackend}{runtimeKind ? ` · ${runtimeKind}` : ''}</span>
                            ) : null}
                            {containerId ? (
                                <span>container-backed</span>
                            ) : null}
                            {workerId ? (
                                <span>worker: {workerId}</span>
                            ) : null}
                            {checkpointId ? (
                                <span>checkpoint: {checkpointId}</span>
                            ) : null}
                            {environmentId ? (
                                <span>env: {environmentId}{environmentVersion ? ` @ ${environmentVersion}` : ''}</span>
                            ) : null}
                            {launchMode ? (
                                <span>launch: {launchMode}</span>
                            ) : null}
                            {workspaceMode ? (
                                <span>workspace: {workspaceMode}</span>
                            ) : null}
                            {repositoryProvider ? (
                                <span>repo: {repositoryProvider}</span>
                            ) : null}
                            {repositoryRef?.branch ? (
                                <span>branch: {repositoryRef.branch}</span>
                            ) : null}
                            {workspaceBranch ? (
                                <span>ws-branch: {workspaceBranch}</span>
                            ) : null}
                            {repositoryRef?.commit ? (
                                <span>commit: {repositoryRef.commit.slice(0, 12)}</span>
                            ) : null}
                            {repoSyncStatus ? (
                                <span>repo: {repoSyncStatus}</span>
                            ) : null}
                            {spawnRequestId ? (
                                <span>
                                    request:{' '}
                                    <a href={`/cloud/requests/${encodeURIComponent(spawnRequestId)}`} className="text-[var(--app-link)] hover:underline">
                                        {spawnRequestId}
                                    </a>
                                </span>
                            ) : null}
                            {workspaceId ? (
                                <span>
                                    workspace:{' '}
                                    <a href={`/cloud/workspaces/${encodeURIComponent(workspaceId)}`} className="text-[var(--app-link)] hover:underline">
                                        {workspaceId}
                                    </a>
                                </span>
                            ) : null}
                            {serviceEndpointCount > 0 ? (
                                <span>services: {serviceEndpointCount}</span>
                            ) : null}
                            {languageServerCount > 0 ? (
                                <span>lsp: {languageServerCount}</span>
                            ) : null}
                            {terminalDescriptorCount > 0 ? (
                                <span>terminals: {terminalDescriptorCount}</span>
                            ) : null}
                            {setupStatus ? (
                                <span>setup: {setupStatus.phase}</span>
                            ) : null}
                            {worktreeBranch ? (
                                <span>{t('session.item.worktree')}: {worktreeBranch}</span>
                            ) : null}
                            {previewCount > 0 ? (
                                <span>previews: {previewCount}</span>
                            ) : null}
                        </div>
                    </div>

                    {props.onViewPreview ? (
                        <button
                            type="button"
                            onClick={props.onViewPreview}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title="Preview"
                            aria-label="Preview"
                        >
                            <BrowserIcon />
                        </button>
                    ) : null}

                    {props.onViewDesktop ? (
                        <button
                            type="button"
                            onClick={props.onViewDesktop}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title="Remote Desktop"
                            aria-label="Remote Desktop"
                        >
                            <DesktopIcon />
                        </button>
                    ) : null}

                    {props.onViewTerminal ? (
                        <button
                            type="button"
                            onClick={props.onViewTerminal}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title="Terminal"
                            aria-label="Terminal"
                        >
                            <TerminalIcon />
                        </button>
                    ) : null}

                    {props.onViewFiles ? (
                        <button
                            type="button"
                            onClick={props.onViewFiles}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title={t('session.title')}
                        >
                            <FilesIcon />
                        </button>
                    ) : null}

                    {showSaveCheckpoint ? (
                        <button
                            type="button"
                            onClick={() => setCheckpointDialogOpen(true)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title="Save Checkpoint"
                            aria-label="Save Checkpoint"
                        >
                            <SaveIcon />
                        </button>
                    ) : null}

                    {props.onViewMcpStatus ? (
                        <button
                            type="button"
                            onClick={props.onViewMcpStatus}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            title={t('session.mcpStatus')}
                            aria-label={t('session.mcpStatus')}
                        >
                            <PlugIcon />
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
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
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
