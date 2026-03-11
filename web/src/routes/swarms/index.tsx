import { useAppContext } from '@/lib/app-context'
import { useSwarms } from '@/hooks/queries/useSwarms'
import { useNavigate } from '@tanstack/react-router'

function getStatusClass(status: string): string {
    if (status === 'completed') return 'bg-emerald-50 text-emerald-700'
    if (status === 'blocked') return 'bg-rose-50 text-rose-700'
    if (status === 'active' || status === 'in_progress') return 'bg-sky-50 text-sky-700'
    return 'bg-slate-100 text-slate-700'
}

function formatTime(value: number): string {
    try {
        return new Date(value).toLocaleString()
    } catch {
        return `${value}`
    }
}

export default function SwarmsIndexPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const { swarms, isLoading, error } = useSwarms(api)

    if (isLoading) {
        return <div className="p-4 text-sm text-[var(--app-hint)]">Loading swarms...</div>
    }

    if (error) {
        return <div className="p-4 text-sm text-red-600">{error}</div>
    }

    if (swarms.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-[var(--app-hint)]">
                No swarms yet.
            </div>
        )
    }

    const completed = swarms.filter((item) => item.status === 'completed').length
    const blocked = swarms.filter((item) => item.status === 'blocked').length

    return (
        <div className="h-full overflow-y-auto bg-[var(--app-bg)]">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
                <section className="rounded-2xl border border-[var(--app-divider)] bg-gradient-to-br from-[var(--app-secondary-bg)] via-[var(--app-bg)] to-[var(--app-secondary-bg)] p-5 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Swarm workspace</div>
                    <h1 className="mt-2 text-2xl font-semibold text-[var(--app-fg)]">Mission control for multi-agent work</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-hint)]">
                        Track live swarms, check planning health, and jump into the latest decisions without digging through raw records.
                    </p>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Total swarms</div>
                        <div className="mt-2 text-3xl font-semibold text-[var(--app-fg)]">{swarms.length}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">All active and historical missions</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Completed</div>
                        <div className="mt-2 text-3xl font-semibold text-emerald-600">{completed}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Swarms that reached a done state</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Blocked</div>
                        <div className="mt-2 text-3xl font-semibold text-rose-600">{blocked}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Needs intervention or policy changes</div>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                    {swarms.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate({ to: '/swarms/$swarmId', params: { swarmId: item.id } })}
                            className="group rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--app-link)]/35 hover:bg-[var(--app-subtle-bg)]"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-[var(--app-fg)] group-hover:text-[var(--app-link)]">{item.title}</div>
                                <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClass(item.status)}`}>{item.status}</div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--app-hint)]">
                                <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1">{item.currentPhase}</span>
                                <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1">updated {formatTime(item.updatedAt)}</span>
                            </div>
                            {item.latestOutcomePreview ? (
                                <div className="mt-4 rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3 text-sm leading-6 text-[var(--app-hint)]">
                                    {item.latestOutcomePreview}
                                </div>
                            ) : null}
                        </button>
                    ))}
                </section>
            </div>
        </div>
    )
}
