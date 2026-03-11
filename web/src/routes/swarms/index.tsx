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

type SwarmListItem = {
    id: string
    title: string
    status: string
    currentPhase: string
    updatedAt: number
    latestOutcomePreview?: string | null
}

function SwarmCard({ item, onOpen }: { item: SwarmListItem, onOpen: (swarmId: string) => void }) {
    return (
        <button
            type="button"
            onClick={() => onOpen(item.id)}
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
    )
}

function SwarmSection({
    title,
    hint,
    items,
    empty,
    onOpen
}: {
    title: string
    hint: string
    items: SwarmListItem[]
    empty: string
    onOpen: (swarmId: string) => void
}) {
    return (
        <section className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-[var(--app-fg)]">{title}</div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">{hint}</div>
                </div>
                <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">{items.length}</span>
            </div>
            {items.length > 0 ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {items.map((item) => (
                        <SwarmCard key={item.id} item={item} onOpen={onOpen} />
                    ))}
                </div>
            ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/45 p-4 text-sm text-[var(--app-hint)]">
                    {empty}
                </div>
            )}
        </section>
    )
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

    const sortedByUpdated = [...swarms].sort((a, b) => b.updatedAt - a.updatedAt)
    const blocked = sortedByUpdated.filter((item) => item.status === 'blocked')
    const active = sortedByUpdated.filter((item) => ['active', 'in_progress'].includes(item.status) || ['execute', 'review'].includes(item.currentPhase))
    const recent = sortedByUpdated.slice(0, 6)
    const completed = sortedByUpdated.filter((item) => item.status === 'completed')
    const openCount = sortedByUpdated.length - completed.length

    const openSwarm = (swarmId: string) => {
        void navigate({ to: '/swarms/$swarmId', params: { swarmId } })
    }

    return (
        <div className="h-full overflow-y-auto bg-[var(--app-bg)]">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
                <section className="rounded-2xl border border-[var(--app-divider)] bg-gradient-to-br from-[var(--app-secondary-bg)] via-[var(--app-bg)] to-[var(--app-secondary-bg)] p-5 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Swarm workspace</div>
                    <h1 className="mt-2 text-2xl font-semibold text-[var(--app-fg)]">Start from the story, not the schema</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-hint)]">
                        Jump into the swarm that needs attention, continue active work, or review recent mission updates without scanning one giant wall of cards.
                    </p>
                </section>

                <section className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Needs attention</div>
                        <div className="mt-2 text-3xl font-semibold text-rose-600">{blocked.length}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Blocked swarms that likely need human intervention</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">In motion</div>
                        <div className="mt-2 text-3xl font-semibold text-sky-600">{active.length}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Swarms currently planning, executing, or reviewing</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Open missions</div>
                        <div className="mt-2 text-3xl font-semibold text-[var(--app-fg)]">{openCount}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Everything not yet complete</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Completed</div>
                        <div className="mt-2 text-3xl font-semibold text-emerald-600">{completed.length}</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Finished swarms kept for traceability</div>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-sm font-semibold text-[var(--app-fg)]">What do you want to do?</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">Choose the lane that matches the user story.</div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 p-3">
                                <div className="text-sm font-medium text-[var(--app-fg)]">Fix blockers</div>
                                <div className="mt-1 text-xs leading-5 text-[var(--app-hint)]">Start with swarms that are blocked or paused before they stall longer.</div>
                            </div>
                            <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 p-3">
                                <div className="text-sm font-medium text-[var(--app-fg)]">Continue work</div>
                                <div className="mt-1 text-xs leading-5 text-[var(--app-hint)]">Open the active swarm and move its plan, execution, or decision queue forward.</div>
                            </div>
                            <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 p-3">
                                <div className="text-sm font-medium text-[var(--app-fg)]">Catch up</div>
                                <div className="mt-1 text-xs leading-5 text-[var(--app-hint)]">Scan recently updated swarms to see what changed and what needs a response.</div>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
                        <div className="text-sm font-semibold text-[var(--app-fg)]">Suggested default flow</div>
                        <div className="mt-4 space-y-3 text-sm">
                            {[
                                '1. Open a blocked swarm first if any exist.',
                                '2. Otherwise continue the most recently updated active swarm.',
                                '3. Use completed swarms only for reference and audit.'
                            ].map((line) => (
                                <div key={line} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-[var(--app-hint)]">
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <SwarmSection
                    title="Needs attention"
                    hint="Blockers, stuck missions, and swarms that should be reviewed first."
                    items={blocked}
                    empty="No blocked swarms right now."
                    onOpen={openSwarm}
                />

                <SwarmSection
                    title="Continue active work"
                    hint="The main working set: swarms in planning, execution, or review."
                    items={active}
                    empty="No active swarms right now."
                    onOpen={openSwarm}
                />

                <SwarmSection
                    title="Recently updated"
                    hint="Best place to catch up when you are not sure what changed last."
                    items={recent}
                    empty="No recent updates yet."
                    onOpen={openSwarm}
                />

                <SwarmSection
                    title="Completed reference"
                    hint="Historical missions kept for outcomes, artifacts, and audit trails."
                    items={completed.slice(0, 6)}
                    empty="No completed swarms yet."
                    onOpen={openSwarm}
                />
            </div>
        </div>
    )
}
