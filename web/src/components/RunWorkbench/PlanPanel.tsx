import type { Session } from '@/types/api'

export function PlanPanel(props: { session: Session }) {
    const plan = (props.session.metadata as any)?.plan as
        | { steps?: Array<{ title: string; status?: string; description?: string }> }
        | undefined

    if (!plan?.steps?.length) {
        return (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--text-tertiary)]">
                No plan available for this run.
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
                {plan.steps.map((step, i) => {
                    const isDone = step.status === 'done' || step.status === 'completed'
                    const isActive = step.status === 'active' || step.status === 'in_progress'
                    return (
                        <div
                            key={i}
                            className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
                                isActive
                                    ? 'bg-[var(--bg-accent-secondary)]'
                                    : ''
                            }`}
                        >
                            <div className="mt-0.5 flex-shrink-0">
                                {isDone ? (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="7" fill="var(--success)" />
                                        <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : isActive ? (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin">
                                        <circle cx="8" cy="8" r="6.5" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="30 12" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="6.5" stroke="var(--border-secondary)" strokeWidth="1.5" />
                                    </svg>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={`text-[13px] font-medium leading-tight ${
                                    isDone ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'
                                }`}>
                                    {step.title}
                                </div>
                                {step.description && (
                                    <div className="mt-0.5 text-xs text-[var(--text-tertiary)] leading-relaxed">
                                        {step.description}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
