import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import type { RoutineRunStatus, RoutineRunSummary, RoutineSummary, RoutineTriggerKind } from '@/types/api'

// ── Icons ──────────────────────────────────────────────────────────

function ArrowLeftIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}
function PencilIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
    )
}
function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
        </svg>
    )
}
function PlayIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
    )
}
function ClockIconSmall() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    )
}
function CheckCircleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 11 15 16 9" />
        </svg>
    )
}
function InProgressCircleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        </svg>
    )
}
function AlertCircleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    )
}
function DashCircleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
        </svg>
    )
}

// ── Helpers ────────────────────────────────────────────────────────

function getGmtOffsetLabel(): string {
    try {
        const offset = -new Date().getTimezoneOffset() / 60
        const sign = offset >= 0 ? '+' : '-'
        const abs = Math.abs(offset)
        return `GMT${sign}${abs % 1 === 0 ? abs : abs.toFixed(1)}`
    } catch {
        return 'UTC'
    }
}

function formatHour12(hour: number, minute: number): string {
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    const ampm = hour < 12 ? 'AM' : 'PM'
    return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatRelativeDateTime(ts: number): string {
    const d = new Date(ts)
    const now = new Date()
    const timeStr = formatHour12(d.getHours(), d.getMinutes())
    if (d.toDateString() === now.toDateString()) return `Today at ${timeStr}`
    const y = new Date(now); y.setDate(y.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return `Yesterday at ${timeStr}`
    return `${MONTHS[d.getMonth()]} ${d.getDate()} at ${timeStr}`
}

function describeRepeats(trigger: RoutineSummary['trigger']): string {
    if (trigger.kind === 'schedule') {
        const every = trigger.every as 'hour' | 'day' | undefined
        const hour = (trigger.hour as number | undefined) ?? 0
        const minute = (trigger.minute as number | undefined) ?? 0
        if (every === 'hour') return `Runs hourly at :${String(minute).padStart(2, '0')}`
        return `Runs daily at ${formatHour12(hour, minute)} ${getGmtOffsetLabel()}`
    }
    if (trigger.kind === 'api') return 'Runs when triggered via API'
    if (trigger.kind === 'github') return 'Runs on GitHub webhook events'
    return trigger.kind
}

function computeNextRun(trigger: RoutineSummary['trigger']): string | null {
    if (trigger.kind !== 'schedule') return null
    const every = trigger.every as 'hour' | 'day' | undefined
    const minute = (trigger.minute as number | undefined) ?? 0
    const hour = (trigger.hour as number | undefined) ?? 0
    const now = new Date()
    const next = new Date(now)
    if (every === 'hour') {
        next.setMinutes(minute, 0, 0)
        if (next <= now) next.setHours(next.getHours() + 1)
    } else {
        next.setHours(hour, minute, 0, 0)
        if (next <= now) next.setDate(next.getDate() + 1)
    }
    const timeStr = formatHour12(next.getHours(), next.getMinutes())
    if (next.toDateString() === now.toDateString()) return `Today at ${timeStr}`
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
    if (next.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${timeStr}`
    return `${MONTHS[next.getMonth()]} ${next.getDate()} at ${timeStr}`
}

function triggerBadgeLabel(kind: RoutineTriggerKind): string {
    switch (kind) {
        case 'schedule': return 'SCHEDULED'
        case 'api': return 'API'
        case 'github': return 'WEBHOOK'
    }
}

type RunFilter = 'all' | 'scheduled' | 'api' | 'webhook' | 'manual'

function matchesFilter(kind: RoutineTriggerKind, filter: RunFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'scheduled') return kind === 'schedule'
    if (filter === 'api') return kind === 'api'
    if (filter === 'webhook') return kind === 'github'
    return false // manual
}

function RunStatusIcon(props: { status: RoutineRunStatus }) {
    const { status } = props
    if (status === 'running' || status === 'spawning' || status === 'queued') {
        return <span className="routine-run-status-icon running"><InProgressCircleIcon /></span>
    }
    if (status === 'succeeded') {
        return <span className="routine-run-status-icon ok"><CheckCircleIcon /></span>
    }
    if (status === 'failed' || status === 'timeout') {
        return <span className="routine-run-status-icon bad"><AlertCircleIcon /></span>
    }
    return <span className="routine-run-status-icon muted"><DashCircleIcon /></span>
}

// ── Page ──────────────────────────────────────────────────────────

export default function SettingsRoutineDetailPage() {
    const { routineId } = useParams({ from: '/settings/routines/$routineId' })
    const { api } = useAppContext()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [runFilter, setRunFilter] = useState<RunFilter>('all')
    const [mutating, setMutating] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)

    const routineQ = useQuery({
        queryKey: queryKeys.routine(routineId),
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getRoutine(routineId)
        }
    })
    const runsQ = useQuery({
        queryKey: queryKeys.routineRuns(routineId),
        enabled: Boolean(api),
        refetchInterval: 4_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.listRoutineRuns(routineId, 100)
        }
    })

    const routine = routineQ.data?.ok ? routineQ.data.routine : null
    const runs = useMemo<RoutineRunSummary[]>(
        () => (runsQ.data?.ok ? runsQ.data.runs : []),
        [runsQ.data]
    )

    const routineTriggerKind: RoutineTriggerKind = routine?.trigger.kind ?? 'schedule'
    const filteredRuns = useMemo(
        () => runs.filter(() => matchesFilter(routineTriggerKind, runFilter)),
        [runs, runFilter, routineTriggerKind]
    )

    const isActive = routine?.status === 'active'
    const repeatsText = routine ? describeRepeats(routine.trigger) : '—'
    const nextRunText = routine ? computeNextRun(routine.trigger) : null

    const repoUrl = (routine?.spawn as { repositoryUrl?: string } | undefined)?.repositoryUrl
    const repoLabel = useMemo(() => {
        if (!repoUrl) return null
        const match = repoUrl.match(/([^/]+\/[^/.]+?)(?:\.git)?$/)
        return match ? match[1] : repoUrl
    }, [repoUrl])

    const toggleActive = useCallback(async () => {
        if (!api || !routine || mutating) return
        setMutating(true)
        try {
            const nextStatus = routine.status === 'active' ? 'paused' : 'active'
            await api.updateRoutine(routineId, { status: nextStatus })
            await qc.invalidateQueries({ queryKey: queryKeys.routine(routineId) })
            await qc.invalidateQueries({ queryKey: queryKeys.routines })
        } finally {
            setMutating(false)
        }
    }, [api, routine, routineId, qc, mutating])

    const handleDelete = useCallback(async () => {
        if (!api || mutating) return
        setMutating(true)
        try {
            await api.deleteRoutine(routineId)
            await qc.invalidateQueries({ queryKey: queryKeys.routines })
            navigate({ to: '/settings/routines' })
        } finally {
            setMutating(false)
            setDeleteConfirm(false)
        }
    }, [api, routineId, qc, navigate, mutating])

    const handleRunNow = useCallback(() => {
        // UI-only placeholder: server does not expose an admin-fire endpoint.
        // To wire up: issue a fire token, then POST /api/routines/:id/fire
        // with Bearer token.
    }, [])

    return (
        <div className="routine-detail-page cursor-theme">
            <div className="routine-detail-inner">
                <button
                    type="button"
                    className="routine-detail-back"
                    onClick={() => navigate({ to: '/settings/routines' })}
                >
                    <ArrowLeftIcon />
                    <span>All</span>
                </button>

                <header className="routine-detail-header">
                    <h1 className="routine-detail-title">
                        {routine?.name ?? (routineQ.isLoading ? 'Loading…' : routineId)}
                    </h1>
                    <div className="routine-detail-actions">
                        <button
                            type="button"
                            className="routine-detail-iconbtn"
                            title="Edit"
                            aria-label="Edit"
                            onClick={() => {
                                /* edit dialog TODO */
                            }}
                        >
                            <PencilIcon />
                        </button>
                        <button
                            type="button"
                            className="routine-detail-iconbtn"
                            title="Delete"
                            aria-label="Delete"
                            onClick={() => setDeleteConfirm(true)}
                        >
                            <TrashIcon />
                        </button>
                        <button
                            type="button"
                            className="routine-run-now-btn"
                            onClick={handleRunNow}
                            disabled={mutating}
                        >
                            <PlayIcon />
                            <span>Run now</span>
                        </button>
                    </div>
                </header>

                <div className="routine-detail-status">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        className={`routine-detail-toggle${isActive ? ' on' : ''}`}
                        onClick={toggleActive}
                        disabled={mutating || !routine}
                        title={isActive ? 'Pause' : 'Activate'}
                    >
                        <span className="routine-detail-toggle-thumb" />
                    </button>
                    <span className={`routine-detail-status-pill${isActive ? ' active' : ' paused'}`}>
                        <ClockIconSmall />
                        <span>{isActive ? 'Active' : routine?.status === 'paused' ? 'Paused' : 'Inactive'}</span>
                    </span>
                    {isActive && nextRunText ? (
                        <span className="routine-detail-next-run">Next run: {nextRunText}</span>
                    ) : null}
                </div>

                {repoLabel ? (
                    <section className="routine-detail-section">
                        <div className="routine-detail-section-label">Repositories</div>
                        <div className="routine-detail-repo-pill">{repoLabel}</div>
                    </section>
                ) : null}

                <section className="routine-detail-section">
                    <div className="routine-detail-section-label">Repeats</div>
                    <div className="routine-detail-section-text">{repeatsText}</div>
                </section>

                {routine?.description ? (
                    <section className="routine-detail-section">
                        <div className="routine-detail-section-label">Instructions</div>
                        <div className="routine-detail-instructions">{routine.description}</div>
                    </section>
                ) : null}

                <section className="routine-detail-section">
                    <div className="routine-detail-runs-header">
                        <div className="routine-detail-section-label">Runs</div>
                        <div className="routine-runs-tabs" role="tablist">
                            {(['all', 'scheduled', 'api', 'webhook', 'manual'] as RunFilter[]).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={runFilter === key}
                                    className={`routine-runs-tab${runFilter === key ? ' active' : ''}`}
                                    onClick={() => setRunFilter(key)}
                                >
                                    {key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {runsQ.isLoading && filteredRuns.length === 0 ? (
                        <div className="routine-runs-empty">Loading…</div>
                    ) : filteredRuns.length === 0 ? (
                        <div className="routine-runs-empty">No runs yet.</div>
                    ) : (
                        <div className="routine-runs-list">
                            {filteredRuns.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="routine-run-row"
                                    onClick={() => {
                                        if (r.sessionId) {
                                            navigate({ to: '/sessions/$sessionId', params: { sessionId: r.sessionId } })
                                        }
                                    }}
                                    disabled={!r.sessionId}
                                >
                                    <RunStatusIcon status={r.status} />
                                    <span className="routine-run-row-time">
                                        {r.startedAt ? formatRelativeDateTime(r.startedAt) : '—'}
                                    </span>
                                    <span className="routine-run-row-badge">
                                        {triggerBadgeLabel(routineTriggerKind)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {deleteConfirm ? (
                <div className="routine-dialog-backdrop" onClick={() => setDeleteConfirm(false)}>
                    <div
                        className="routine-dialog routine-delete-dialog"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="routine-dialog-body">
                            <div className="routine-section-title">Delete routine?</div>
                            <div className="routine-connectors-desc">
                                This will delete <strong>{routine?.name}</strong> and all its run history. This action cannot be undone.
                            </div>
                        </div>
                        <div className="routine-dialog-footer">
                            <button
                                type="button"
                                className="routine-btn-secondary"
                                onClick={() => setDeleteConfirm(false)}
                                disabled={mutating}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="routine-btn-danger"
                                onClick={handleDelete}
                                disabled={mutating}
                            >
                                {mutating ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
