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
        isFirst: boolean
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
    let isFirstGroup = true

    for (const session of sorted) {
        const group = getDateGroup(session.updatedAt)
        if (group !== currentGroup) {
            currentGroup = group
            rows.push({ type: 'date-header', label: group, isFirst: isFirstGroup })
            isFirstGroup = false
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

function SessionGitIcon(props: { status: 'branch' | 'merge' | 'pr' }) {
    const color =
        props.status === 'merge'
            ? 'var(--purple)'
            : props.status === 'pr'
                ? 'var(--green)'
                : 'var(--text-tertiary)'
    if (props.status === 'merge') {
        return (
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M6 21V9a9 9 0 0 0 9 9" />
            </svg>
        )
    }
    if (props.status === 'pr') {
        return (
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
        )
    }
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
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
    const { session: s, onSelect, api, selected = false } = props
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
                    {/* Git icon — 16px container (hardcoded to 'branch'; no PR status field on Session yet) */}
                    <div className="session-git-slot flex w-4 shrink-0 items-center justify-center">
                        <SessionGitIcon status="branch" />
                    </div>
                    {/* Title */}
                    <div className="min-w-0 flex-1 truncate text-[var(--font-size-base)] text-[var(--text-primary)]">
                        {sessionName}
                    </div>
                    {/* Diff-stats placeholder (reserved for aggregated linesAdded/linesRemoved when API provides it) */}
                    {(() => {
                        const meta = s.metadata as { prAdditions?: number; prDeletions?: number } | null | undefined
                        const additions = meta?.prAdditions
                        const deletions = meta?.prDeletions
                        if (!additions && !deletions) {
                            return (
                                <span
                                    className="history-stats shrink-0"
                                    style={{
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--text-secondary)',
                                    }}
                                    aria-hidden="true"
                                />
                            )
                        }
                        return (
                            <div className="flex shrink-0 items-center gap-1 text-[var(--text-tertiary)] tabular-nums">
                                {additions ? <span className="text-[var(--added)]">+{additions}</span> : null}
                                {deletions ? <span className="text-[var(--removed)]">-{deletions}</span> : null}
                            </div>
                        )
                    })()}
                    {/* Hover overlay: time + archive + delete */}
                    <div className="absolute right-0 inset-y-0 z-10 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-full w-4 shrink-0" style={{ background: 'linear-gradient(to right, transparent, var(--bg-chrome))' }} />
                        <div className="flex h-full items-center gap-0.5 bg-[var(--bg-chrome)] pr-1">
                            <span className="mr-1 text-[var(--font-size-base)] text-[var(--text-tertiary)] tabular-nums">
                                {formatRelativeTime(s.updatedAt, t)}
                            </span>
                            <button
                                type="button"
                                className="session-hover-action session-hover-action-archive flex h-6 w-6 items-center justify-center rounded-md"
                                onClick={(e) => { e.stopPropagation(); handleArchive(); }}
                                title="Archive"
                                aria-label="Archive session"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8"/><path d="M10 12h4"/></svg>
                            </button>
                            <button
                                type="button"
                                className="session-hover-action session-hover-action-delete flex h-6 w-6 items-center justify-center rounded-md"
                                onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
                                title="Delete"
                                aria-label="Delete session"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
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
                                <div
                                    className={`session-list-date-header section-title ${
                                        row.isFirst ? 'session-list-date-header-first' : ''
                                    }`}
                                    style={{
                                        padding: '12px 8px 4px',
                                        fontSize: 'var(--font-size-sm)',
                                        fontWeight: 'var(--font-weight-semibold)',
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    {row.label}
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
