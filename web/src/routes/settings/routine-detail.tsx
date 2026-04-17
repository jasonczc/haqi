/**
 * Routine detail page — /settings/routines/$routineId
 *
 * Layout:
 *
 *   ┌─── Header (name · trigger · status) ────────────┐
 *   │                                                 │
 *   │  ┌─── Runs list ───┐   ┌─── Run detail ─────┐  │
 *   │  │ selectable rows │   │ state graph        │  │
 *   │  │ status dots     │   │ event timeline     │  │
 *   │  │ live via SSE    │   │                    │  │
 *   │  └─────────────────┘   └────────────────────┘  │
 *   └─────────────────────────────────────────────────┘
 *
 * Selecting a run in the left column loads the hydrated detail
 * (run + fire + event timeline) in the right column.
 *
 * Live updates: we subscribe to the `routine-run-updated` SSE events
 * filtered to this routineId and invalidate the runs + active run
 * detail queries when they arrive.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import type { RoutineRunStatus, RoutineRunSummary } from '@/types/api'
import { RunStateGraph } from '@/components/routines/RunStateGraph'
import { RunEventTimeline } from '@/components/routines/RunEventTimeline'

function statusDotColor(status: RoutineRunStatus): string {
    switch (status) {
        case 'queued': return '#a8a29e'
        case 'spawning': return '#fbbf24'
        case 'running': return '#3b82f6'
        case 'succeeded': return '#10b981'
        case 'failed': return '#ef4444'
        case 'timeout': return '#f59e0b'
        case 'skipped': return '#9ca3af'
        case 'cancelled': return '#6b7280'
    }
}

function formatHMS(ts: number | undefined): string {
    if (!ts) return '—'
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatDuration(run: RoutineRunSummary): string {
    if (!run.startedAt) return '—'
    const end = run.endedAt ?? Date.now()
    const ms = end - run.startedAt
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.round(ms / 1000)}s`
}

export default function SettingsRoutineDetailPage() {
    const { routineId } = useParams({ from: '/settings/routines/$routineId' })
    const { api } = useAppContext()
    const navigate = useNavigate()
    const search = useSearch({ from: '/settings/routines/$routineId' }) as { run?: string }
    const selectedRunId = search.run ?? null

    // Polling cadence matches the live-ness of the data: routine config
    // rarely changes (10s), runs list updates as fires land (4s), and
    // the selected run re-fetches every 1.5s while active.
    const routineQ = useQuery({
        queryKey: queryKeys.routine(routineId),
        enabled: Boolean(api),
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

    const runs = useMemo<RoutineRunSummary[]>(
        () => (runsQ.data?.ok ? runsQ.data.runs : []),
        [runsQ.data]
    )

    // Auto-select first run when the page loads without ?run=.
    useEffect(() => {
        if (!selectedRunId && runs.length > 0) {
            navigate({
                to: '/settings/routines/$routineId',
                params: { routineId },
                search: { run: runs[0].id },
                replace: true
            })
        }
    }, [selectedRunId, runs, routineId, navigate])

    const runDetailQ = useQuery({
        enabled: Boolean(api) && Boolean(selectedRunId),
        queryKey: queryKeys.routineRun(routineId, selectedRunId ?? ''),
        queryFn: async () => {
            if (!api || !selectedRunId) throw new Error('API or run unavailable')
            return await api.getRoutineRun(routineId, selectedRunId)
        },
        refetchInterval: (q) => {
            const data = q.state.data
            if (!data || !data.ok) return 5_000
            const status = data.run.status
            if (['running', 'spawning', 'queued'].includes(status)) return 1_500
            return false
        }
    })

    const routine = routineQ.data?.ok ? routineQ.data.routine : null

    return (
        <div className="flex flex-col gap-5 px-6 py-6">
            <header className="flex items-baseline justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <Link
                        to="/settings/routines"
                        className="w-fit text-[11px] text-[var(--cursor-text-tertiary)] hover:text-[var(--cursor-link)]"
                    >
                        ← Routines
                    </Link>
                    <h1 className="text-[17px] font-semibold text-[var(--cursor-text-primary)]">
                        {routine?.name ?? routineId}
                    </h1>
                    {routine?.description ? (
                        <p className="text-[12px] text-[var(--cursor-text-tertiary)]">
                            {routine.description}
                        </p>
                    ) : null}
                </div>
                {routine ? (
                    <div className="flex items-center gap-3 text-[11px] text-[var(--cursor-text-tertiary)]">
                        <span>v{routine.version}</span>
                        <span>·</span>
                        <span>{routine.trigger.kind}</span>
                        <span>·</span>
                        <span>concurrency: {routine.concurrency}</span>
                    </div>
                ) : null}
            </header>

            <div className="grid grid-cols-[320px,1fr] gap-4">
                {/* Runs list */}
                <section className="flex flex-col rounded-[8px] border border-[var(--cursor-stroke-secondary)]">
                    <div className="border-b border-[var(--cursor-stroke-secondary)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--cursor-text-tertiary)]">
                        Runs ({runs.length})
                    </div>
                    {runsQ.isLoading ? (
                        <div className="px-3 py-6 text-center text-[12px] text-[var(--cursor-text-tertiary)]">
                            Loading…
                        </div>
                    ) : runs.length === 0 ? (
                        <div className="px-3 py-6 text-center text-[12px] text-[var(--cursor-text-tertiary)]">
                            No runs yet.
                        </div>
                    ) : (
                        <div className="max-h-[540px] overflow-auto">
                            {runs.map((r) => {
                                const selected = r.id === selectedRunId
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() =>
                                            navigate({
                                                to: '/settings/routines/$routineId',
                                                params: { routineId },
                                                search: { run: r.id }
                                            })
                                        }
                                        className={`flex w-full items-center gap-2 border-b border-[var(--cursor-stroke-secondary)] px-3 py-2 text-left text-[12px] last:border-b-0 transition-colors ${
                                            selected
                                                ? 'bg-[var(--cursor-bg-subtle)]'
                                                : 'hover:bg-[var(--cursor-bg-subtle)]'
                                        }`}
                                    >
                                        <span
                                            className="h-2 w-2 flex-shrink-0 rounded-full"
                                            style={{ backgroundColor: statusDotColor(r.status) }}
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate font-medium text-[var(--cursor-text-primary)]">
                                                {r.status}
                                            </span>
                                            <span className="truncate font-mono text-[10px] text-[var(--cursor-text-tertiary)]">
                                                {r.id.slice(0, 8)} · {formatHMS(r.startedAt)}
                                            </span>
                                        </span>
                                        <span className="flex-shrink-0 font-mono text-[10px] text-[var(--cursor-text-tertiary)]">
                                            {formatDuration(r)}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </section>

                {/* Run detail */}
                <section className="flex flex-col gap-4">
                    {!selectedRunId ? (
                        <div className="flex items-center justify-center rounded-[8px] border border-dashed border-[var(--cursor-stroke-secondary)] px-6 py-16 text-[13px] text-[var(--cursor-text-tertiary)]">
                            Select a run to inspect its state graph and timeline.
                        </div>
                    ) : !runDetailQ.data?.ok ? (
                        <div className="flex items-center justify-center rounded-[8px] border border-dashed border-[var(--cursor-stroke-secondary)] px-6 py-16 text-[13px] text-[var(--cursor-text-tertiary)]">
                            Loading run…
                        </div>
                    ) : (
                        <>
                            <div className="rounded-[8px] border border-[var(--cursor-stroke-secondary)]">
                                <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-4 py-2">
                                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--cursor-text-tertiary)]">
                                        State
                                    </span>
                                    <span className="font-mono text-[11px] text-[var(--cursor-text-tertiary)]">
                                        {runDetailQ.data.run.id.slice(0, 8)}
                                    </span>
                                </div>
                                <RunStateGraph currentStatus={runDetailQ.data.run.status} />
                            </div>
                            <div className="rounded-[8px] border border-[var(--cursor-stroke-secondary)]">
                                <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-4 py-2">
                                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--cursor-text-tertiary)]">
                                        Timeline ({runDetailQ.data.events.length})
                                    </span>
                                    {runDetailQ.data.run.sessionId ? (
                                        <Link
                                            to="/sessions/$sessionId"
                                            params={{ sessionId: runDetailQ.data.run.sessionId }}
                                            className="text-[11px] text-[var(--cursor-link)] hover:underline"
                                        >
                                            Open session →
                                        </Link>
                                    ) : null}
                                </div>
                                <RunEventTimeline events={runDetailQ.data.events} />
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    )
}
