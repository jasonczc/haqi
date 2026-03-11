import type { SwarmDetail } from '@/types/api'

type SwarmPoliciesPanelProps = {
    swarm: SwarmDetail
    policyKind: string
    isSubmitting: boolean
    onPolicyKindChange: (value: string) => void
    onAddPolicy: () => void
    getPolicyDraft: (policyId: string, config: unknown) => string
    onPolicyDraftChange: (policyId: string, value: string) => void
    onSavePolicyConfig: (policyId: string, currentConfig: unknown) => void
    onTogglePolicy: (policyId: string, currentStatus: string) => void
}

export function SwarmPoliciesPanel(props: SwarmPoliciesPanelProps) {
    return (
        <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
            <div className="mb-1 text-sm font-semibold text-[var(--app-fg)]">Policies</div>
            <div className="mb-3 text-xs text-[var(--app-hint)]">Define automation rules and fine-tune how swarms escalate or dispatch work.</div>
            <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/70 p-3 sm:flex-row">
                <input
                    value={props.policyKind}
                    onChange={(event) => props.onPolicyKindChange(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                    placeholder="Policy kind"
                />
                <button
                    type="button"
                    onClick={props.onAddPolicy}
                    disabled={props.isSubmitting || !props.policyKind.trim()}
                    className="rounded-xl bg-[var(--app-link)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                    Add
                </button>
            </div>
            <div className="space-y-3">
                {props.swarm.policies.length > 0 ? props.swarm.policies.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                <div className="mt-1">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === 'disabled' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                        {item.status}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => props.onTogglePolicy(item.id, item.status)}
                                disabled={props.isSubmitting}
                                className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] disabled:opacity-60"
                            >
                                {item.status === 'disabled' ? 'Enable' : 'Disable'}
                            </button>
                        </div>
                        <textarea
                            value={props.getPolicyDraft(item.id, item.config)}
                            onChange={(event) => props.onPolicyDraftChange(item.id, event.target.value)}
                            className="mt-3 min-h-[120px] w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 font-mono text-xs leading-6 text-[var(--app-hint)] outline-none focus:border-[var(--app-link)]"
                        />
                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => props.onSavePolicyConfig(item.id, item.config)}
                                disabled={props.isSubmitting}
                                className="rounded-xl bg-[var(--app-link)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                            >
                                Save Config
                            </button>
                        </div>
                    </div>
                )) : <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">No policies yet.</div>}
            </div>
        </div>
    )
}
