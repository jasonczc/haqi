import type { CriteriaItem } from '@/types/api'

const statusIcon: Record<CriteriaItem['status'], { icon: string; color: string }> = {
    met: { icon: '\u2713', color: 'var(--success)' },
    not_met: { icon: '\u2717', color: 'var(--danger)' },
    unclear: { icon: '?', color: 'var(--warn)' },
}

export function CriteriaChecklist({ criteria }: { criteria: CriteriaItem[] }) {
    if (criteria.length === 0) return null

    return (
        <div className="font-mono text-xs space-y-0.5 min-w-0">
            {criteria.map((item, i) => {
                const { icon, color } = statusIcon[item.status]
                return (
                    <div key={i} className="min-w-0">
                        <div className="flex items-start gap-0 min-w-0">
                            <span className="shrink-0 w-6 text-center" style={{ color }}>[{icon}]</span>
                            <span className="text-[var(--text-primary)] min-w-0 break-words">{item.criteria}</span>
                        </div>
                        {item.note && (
                            <div className="flex items-start gap-0 text-[var(--text-tertiary)] min-w-0">
                                <span className="shrink-0 w-6" />
                                <span className="min-w-0 break-words">{'\u2514\u2500'} {item.note}</span>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
