type SwarmHeaderPanelProps = {
    title: string
    phase: string
    status: string
    updatedAtLabel: string
    autoDispatchCount: number
    reassignmentsCount: number
    autonomyPausedCount: number
    autonomyPausedReason: string | null
    canToggleAutonomy: boolean
    autonomyEnabled: boolean
    isSubmitting: boolean
    onAutoPlan: (dispatch: boolean) => void
    onRunPolicies: () => void
    onToggleAutonomy: () => void
}

export function SwarmHeaderPanel(props: SwarmHeaderPanelProps) {
    const metricClass = 'rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm'

    return (
        <section className="overflow-hidden rounded-3xl border border-[var(--app-divider)] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Swarm</div>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-white">{props.title}</h1>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
                        <span className="rounded-full bg-white/10 px-2.5 py-1">phase {props.phase}</span>
                        <span className="rounded-full bg-white/10 px-2.5 py-1">status {props.status}</span>
                        <span className="rounded-full bg-white/10 px-2.5 py-1">updated {props.updatedAtLabel}</span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 lg:min-w-[360px]">
                    <div className={metricClass}>
                        <div className="text-[11px] uppercase tracking-wide text-slate-300">Dispatches</div>
                        <div className="mt-1 text-xl font-semibold">{props.autoDispatchCount}</div>
                    </div>
                    <div className={metricClass}>
                        <div className="text-[11px] uppercase tracking-wide text-slate-300">Reassigned</div>
                        <div className="mt-1 text-xl font-semibold">{props.reassignmentsCount}</div>
                    </div>
                    <div className={metricClass}>
                        <div className="text-[11px] uppercase tracking-wide text-slate-300">Paused</div>
                        <div className="mt-1 text-xl font-semibold">{props.autonomyPausedCount}</div>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => props.onAutoPlan(false)}
                    disabled={props.isSubmitting}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                    Auto Plan
                </button>
                <button
                    type="button"
                    onClick={() => props.onAutoPlan(true)}
                    disabled={props.isSubmitting}
                    className="rounded-xl bg-[var(--app-link)] px-3 py-2 text-sm text-white shadow-sm disabled:opacity-60"
                >
                    Plan + Dispatch
                </button>
                <button
                    type="button"
                    onClick={props.onRunPolicies}
                    disabled={props.isSubmitting}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                    Run Policies
                </button>
                {props.canToggleAutonomy ? (
                    <button
                        type="button"
                        onClick={props.onToggleAutonomy}
                        disabled={props.isSubmitting}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                    >
                        {props.autonomyEnabled ? 'Pause Autonomy' : 'Resume Autonomy'}
                    </button>
                ) : null}
            </div>
            {props.autonomyPausedReason ? (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                    <span className="font-medium">Autonomy paused:</span> {props.autonomyPausedReason}
                </div>
            ) : null}
        </section>
    )
}
