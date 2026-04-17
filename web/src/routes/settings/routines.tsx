/**
 * Routines list page.
 *
 * Minimal Cursor-style table: one row per routine in the current
 * namespace. Click a row → /settings/routines/$routineId detail view.
 *
 * Data is polled cheaply (5s) instead of SSE for the list view —
 * routines change rarely. Run detail pages subscribe to SSE for
 * live-updating row status.
 */

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import type { RoutineSummary, RoutineTriggerKind } from '@/types/api'

function formatRelative(ts: number): string {
    const delta = Date.now() - ts
    if (delta < 60_000) return 'just now'
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
    return `${Math.floor(delta / 86_400_000)}d ago`
}

function describeTrigger(trigger: RoutineSummary['trigger']): string {
    switch (trigger.kind) {
        case 'api':
            return 'API'
        case 'schedule': {
            const every = trigger.every as 'hour' | 'day' | undefined
            const minute = trigger.minute as number | undefined
            const hour = trigger.hour as number | undefined
            const tz = (trigger.timezone as string | undefined) ?? 'UTC'
            if (every === 'hour')
                return `Every hour at :${String(minute ?? 0).padStart(2, '0')}`
            return `Daily at ${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')} ${tz}`
        }
        case 'github':
            return 'GitHub webhook'
    }
    return trigger.kind
}

function triggerBadgeColor(kind: RoutineTriggerKind): string {
    switch (kind) {
        case 'api':
            return 'var(--cursor-link)'
        case 'schedule':
            return 'var(--cursor-text-primary)'
        case 'github':
            return 'var(--accent)'
    }
}

export default function SettingsRoutinesPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const q = useQuery({
        queryKey: queryKeys.routines,
        enabled: Boolean(api),
        refetchInterval: 5_000,
        staleTime: 2_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.listRoutines()
        }
    })
    const routines = useMemo<RoutineSummary[]>(
        () => (q.data?.ok ? q.data.routines : []),
        [q.data]
    )

    return (
        <div className="flex flex-col gap-5 px-6 py-6">
            <header className="flex items-baseline justify-between gap-3">
                <div>
                    <h1 className="text-[17px] font-semibold text-[var(--cursor-text-primary)]">
                        Routines
                    </h1>
                    <p className="mt-0.5 text-[12px] text-[var(--cursor-text-tertiary)]">
                        Scheduled, webhook, and API-triggered agent runs. Every fire
                        produces a durable run you can replay.
                    </p>
                </div>
            </header>

            <div className="rounded-[8px] border border-[var(--cursor-stroke-secondary)]">
                <div className="grid grid-cols-[1.5fr,1fr,100px,140px] gap-3 border-b border-[var(--cursor-stroke-secondary)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--cursor-text-tertiary)]">
                    <span>Name</span>
                    <span>Trigger</span>
                    <span>Status</span>
                    <span>Updated</span>
                </div>
                {q.isLoading ? (
                    <div className="px-4 py-6 text-center text-[13px] text-[var(--cursor-text-tertiary)]">
                        Loading…
                    </div>
                ) : routines.length === 0 ? (
                    <div className="px-4 py-10 text-center text-[13px] text-[var(--cursor-text-tertiary)]">
                        No routines yet. Create one via{' '}
                        <code className="rounded bg-[var(--cursor-bg-subtle)] px-1 py-0.5 font-mono text-[11px]">
                            POST /api/routines
                        </code>
                        .
                    </div>
                ) : (
                    routines.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() =>
                                navigate({
                                    to: '/settings/routines/$routineId',
                                    params: { routineId: r.id }
                                })
                            }
                            className="grid w-full grid-cols-[1.5fr,1fr,100px,140px] gap-3 border-b border-[var(--cursor-stroke-secondary)] px-4 py-3 text-left text-[13px] transition-colors last:border-b-0 hover:bg-[var(--cursor-bg-subtle)]"
                        >
                            <div className="flex flex-col">
                                <span className="truncate font-medium text-[var(--cursor-text-primary)]">
                                    {r.name}
                                </span>
                                {r.description ? (
                                    <span className="truncate text-[11px] text-[var(--cursor-text-tertiary)]">
                                        {r.description}
                                    </span>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 text-[12px] text-[var(--cursor-text-secondary)]">
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: triggerBadgeColor(r.trigger.kind) }}
                                />
                                <span className="truncate">{describeTrigger(r.trigger)}</span>
                            </div>
                            <div
                                className={`text-[12px] ${
                                    r.status === 'active'
                                        ? 'text-[var(--cursor-text-primary)]'
                                        : 'text-[var(--cursor-text-tertiary)]'
                                }`}
                            >
                                {r.status}
                            </div>
                            <div className="text-[12px] text-[var(--cursor-text-tertiary)]">
                                {formatRelative(r.updatedAt)}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}
