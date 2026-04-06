import {
    forwardRef,
    useMemo,
    useState,
} from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { getSessionTitle } from '@/lib/session-title'
import { useTranslation } from '@/lib/use-translation'
import type { SessionListDensity } from '@/hooks/useSessionListDensity'

type SessionListRow =
    | {
        type: 'date-header'
        label: string
    }
    | {
        type: 'session'
        session: SessionSummary
        forceOffline: boolean
    }

export type NewSessionPreset = {
    directory?: string
    machineId?: string
}

function getDateGroup(updatedAt: number): string {
    const now = Date.now()
    const ms = updatedAt < 1_000_000_000_000 ? updatedAt * 1000 : updatedAt
    const delta = now - ms
    const days = delta / (1000 * 60 * 60 * 24)
    if (days < 1) return 'Today'
    if (days < 2) return 'Yesterday'
    if (days < 7) return 'This Week'
    if (days < 14) return 'Last Week'
    if (days < 30) return 'This Month'
    return 'Earlier'
}

function buildDateRows(sessions: SessionSummary[]): SessionListRow[] {
    // Sort all sessions by updatedAt descending (newest first)
    const sorted = [...sessions].sort((a, b) => {
        // Active thinking sessions first, then active, then by time
        const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
        const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
        if (rankA !== rankB) return rankA - rankB
        return b.updatedAt - a.updatedAt
    })

    const rows: SessionListRow[] = []
    let currentGroup = ''

    for (const session of sorted) {
        const group = getDateGroup(session.updatedAt)
        if (group !== currentGroup) {
            currentGroup = group
            rows.push({ type: 'date-header', label: group })
        }
        rows.push({ type: 'session', session, forceOffline: false })
    }

    return rows
}

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

const SessionListScroller = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    function SessionListScroller(props, ref) {
        return (
            <div
                {...props}
                ref={ref}
                className={`desktop-scrollbar-left app-scrollbar ${props.className ?? ''}`.trim()}
            />
        )
    }
)



function formatRelativeTime(value: number, t: (key: string, params?: Record<string, string | number>) => string): string | null {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return t('session.time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.time.daysAgo', { n: days })
    const weeks = Math.floor(days / 7)
    if (weeks < 52) return t('session.time.weeksAgo', { n: weeks })
    return new Date(ms).toLocaleDateString()
}

function RunStatusIcon(props: { active: boolean; thinking: boolean }) {
    if (props.thinking) {
        return (
            <svg width="12" height="12" viewBox="0 0 16 16" className="animate-spin text-[var(--accent)]">
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28 12" />
            </svg>
        )
    }
    if (props.active) {
        return (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-[var(--success)]">
                <circle cx="4" cy="4" r="2" fill="currentColor" />
                <circle cx="4" cy="12" r="2" fill="currentColor" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M4 6v4M8 12h2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        )
    }
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" className="text-[var(--text-quaternary)]">
            <circle cx="5" cy="3.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="5" cy="12.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 5.5v5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    )
}

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    showPath?: boolean
    api: ApiClient | null
    selected?: boolean
    density: SessionListDensity
    forceOffline?: boolean
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, api, selected = false, forceOffline = false } = props
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
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
        s.id,
        s.metadata?.flavor ?? null
    )
    const { skipArchiveConfirmation } = useArchiveConfirmation()

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        onClick: () => {
            if (!menuOpen) {
                onSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const effectiveActive = forceOffline ? false : s.active
    const effectiveThinking = forceOffline ? false : s.thinking

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
            .then((newSessionId) => onSelect(newSessionId))
            .catch((error) => {
                console.error('Failed to create same-config session', error)
            })
    }

    const handleDuplicate = () => {
        void duplicateSession()
            .then((newSessionId) => onSelect(newSessionId))
            .catch((error) => {
                console.error('Failed to duplicate session', error)
            })
    }

    return (
        <>
            <button
                type="button"
                {...longPressHandlers}
                className={`group relative flex w-full items-center rounded-md text-left transition-colors select-none h-8 px-1.5 ${
                    selected ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-quaternary)]'
                }`}
                style={{ WebkitTouchCallout: 'none' }}
                aria-current={selected ? 'page' : undefined}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {/* PR status icon — 16px container */}
                    <div className="flex w-4 shrink-0 items-center justify-center">
                        <RunStatusIcon active={effectiveActive} thinking={effectiveThinking} />
                    </div>
                    {/* Title */}
                    <div className="min-w-0 flex-1 truncate text-[var(--font-size-base)] text-[var(--text-primary)]">
                        {sessionName}
                    </div>
                    {/* Line counts (if available) */}
                    {(() => {
                        const meta = s.metadata as any
                        const additions = meta?.prAdditions as number | undefined
                        const deletions = meta?.prDeletions as number | undefined
                        if (!additions && !deletions) return null
                        return (
                            <div className="flex shrink-0 items-center gap-1 text-[var(--text-tertiary)]">
                                {additions ? <span className="text-[var(--added)]">+{additions}</span> : null}
                                {deletions ? <span className="text-[var(--removed)]">-{deletions}</span> : null}
                            </div>
                        )
                    })()}
                    {/* Hover overlay: time + archive */}
                    <div className="absolute right-0 inset-y-0 z-10 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-full w-4 shrink-0" style={{ background: 'linear-gradient(to right, transparent, var(--bg-chrome))' }} />
                        <div className="flex h-full items-center gap-1 bg-[var(--bg-chrome)] pr-1">
                            <span className="text-[var(--font-size-base)] text-[var(--text-tertiary)]">
                                {formatRelativeTime(s.updatedAt, t)}
                            </span>
                            <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                onClick={(e) => { e.stopPropagation(); handleArchive(); }}
                                title="Archive"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8"/><path d="M10 12h4"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </button>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={s.active}
                onRename={() => setRenameOpen(true)}
                onSpawnSameConfig={handleSpawnSameConfig}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onDelete={() => setDeleteOpen(true)}
                anchorPoint={menuAnchorPoint}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={sessionName}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: sessionName })}
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
                description={t('dialog.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={deleteSession}
                isPending={isPending}
                destructive
            />
        </>
    )
}

export function SessionList(props: {
    sessions: SessionSummary[]
    onSelect: (sessionId: string) => void
    onNewSession: (preset?: NewSessionPreset) => void
    onQuickCreateInProject?: (preset?: NewSessionPreset) => void
    onRefresh: () => void
    isLoading: boolean
    renderHeader?: boolean
    api: ApiClient | null
    selectedSessionId?: string | null
    density?: SessionListDensity
}) {
    const { t } = useTranslation()
    const { renderHeader = true, api, selectedSessionId, density = 'comfortable' } = props

    const rows = useMemo(
        () => buildDateRows(props.sessions),
        [props.sessions]
    )

    return (
        <div className="mx-auto flex h-full w-full max-w-content min-h-0 flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-1">
                    <div className="text-xs text-[var(--text-tertiary)]">
                        {t('sessions.count', { n: props.sessions.length, m: 0 })}
                    </div>
                    <button
                        type="button"
                        onClick={() => props.onNewSession()}
                        className="session-list-new-button rounded-full p-1.5 text-[var(--accent)] transition-colors"
                        title={t('sessions.new')}
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            ) : null}

            <div className="flex-1 min-h-0">
                <Virtuoso
                    data={rows}
                    style={{ height: '100%' }}
                    defaultItemHeight={32}
                    increaseViewportBy={360}
                    initialItemCount={Math.min(rows.length, 24)}
                    components={{
                        Scroller: SessionListScroller
                    }}
                    computeItemKey={(_, row) => (
                        row.type === 'date-header'
                            ? `date:${row.label}`
                            : `session:${row.session.id}`
                    )}
                    itemContent={(_, row) => {
                        if (row.type === 'date-header') {
                            return (
                                <div className="px-3 pt-4 pb-1">
                                    <span className="text-[var(--font-size-sm)] text-[var(--text-tertiary)]">
                                        {row.label}
                                    </span>
                                </div>
                            )
                        }

                        return (
                            <SessionItem
                                session={row.session}
                                onSelect={props.onSelect}
                                showPath={false}
                                api={api}
                                selected={row.session.id === selectedSessionId}
                                density={density}
                                forceOffline={row.forceOffline}
                            />
                        )
                    }}
                />
            </div>
        </div>
    )
}
