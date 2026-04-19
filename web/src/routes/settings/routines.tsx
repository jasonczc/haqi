import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { NewRoutineDialog } from '@/components/NewRoutineDialog'
import type { RoutineSummary } from '@/types/api'

function LightningIcon(props: { size?: number }) {
    const s = props.size ?? 18
    return (
        <svg
            width={s}
            height={s}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    )
}

function CloudIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 0 0 4.5 14.5" />
            <path d="M8 19h9" />
        </svg>
    )
}

function ChevronDownIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function formatTrigger(trigger: RoutineSummary['trigger']): string {
    switch (trigger.kind) {
        case 'schedule': {
            const every = trigger.every as 'hour' | 'day' | undefined
            const hour = (trigger.hour as number | undefined) ?? 0
            const minute = (trigger.minute as number | undefined) ?? 0
            if (every === 'hour') {
                return `Every hour at :${String(minute).padStart(2, '0')}`
            }
            const h12 = hour % 12 === 0 ? 12 : hour % 12
            const ampm = hour < 12 ? 'AM' : 'PM'
            if (minute === 0) {
                return `Every day at ${h12}:00 ${ampm}`
            }
            return `Every day at ${h12}:${String(minute).padStart(2, '0')} ${ampm}`
        }
        case 'api':
            return 'API trigger'
        case 'github':
            return 'GitHub webhook'
        default:
            return String((trigger as { kind: string }).kind)
    }
}

export default function SettingsRoutinesPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [view, setView] = useState<'all' | 'calendar'>('all')
    const [dialogOpen, setDialogOpen] = useState(false)

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
        <div className="routines-page cursor-theme">
            <div className="routines-page-inner">
                <header className="routines-header">
                    <div className="routines-heading">
                        <div className="routines-title-row">
                            <span className="routines-title-icon"><LightningIcon /></span>
                            <h1 className="routines-title">Routines</h1>
                        </div>
                        <p className="routines-subtitle">
                            Create templated routines that can be kicked off on schedule, by API, or webhook.
                        </p>
                    </div>
                    <div className="routines-header-actions">
                        <button
                            type="button"
                            className="routines-new-btn"
                            onClick={() => setDialogOpen(true)}
                        >
                            <span>New routine</span>
                            <ChevronDownIcon />
                        </button>
                    </div>
                </header>

                <div className="routines-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === 'all'}
                        className={`routines-tab${view === 'all' ? ' active' : ''}`}
                        onClick={() => setView('all')}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === 'calendar'}
                        className={`routines-tab${view === 'calendar' ? ' active' : ''}`}
                        onClick={() => setView('calendar')}
                    >
                        Calendar
                    </button>
                </div>

                {view === 'all' ? (
                    <div className="routines-list">
                        {q.isLoading && routines.length === 0 ? (
                            <div className="routines-empty">Loading…</div>
                        ) : routines.length === 0 ? (
                            <div className="routines-empty">No routines yet.</div>
                        ) : (
                            routines.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="routines-row"
                                    onClick={() =>
                                        navigate({
                                            to: '/settings/routines/$routineId',
                                            params: { routineId: r.id }
                                        })
                                    }
                                >
                                    <div className="routines-row-body">
                                        <span className="routines-row-title">{r.name}</span>
                                        <span className="routines-row-sub">
                                            {formatTrigger(r.trigger)}
                                        </span>
                                    </div>
                                    <span className="routines-row-badge">
                                        <CloudIcon />
                                        Remote
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="routines-empty">Calendar view coming soon.</div>
                )}
            </div>

            <NewRoutineDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                api={api ?? null}
                onCreated={() => {
                    void qc.invalidateQueries({ queryKey: queryKeys.routines })
                }}
            />
        </div>
    )
}
