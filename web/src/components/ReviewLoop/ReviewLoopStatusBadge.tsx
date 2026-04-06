import type { ReviewLoopStatus } from '@/types/api'

const statusConfig: Record<ReviewLoopStatus, {
    label: string
    color: string
    active?: boolean
}> = {
    executing: { label: 'EXECUTING', color: 'var(--warn)', active: true },
    reviewing: { label: 'REVIEWING', color: 'var(--cursor-info)', active: true },
    waiting_user: { label: 'WAITING', color: 'var(--warn)', active: true },
    paused: { label: 'PAUSED', color: 'var(--warn)' },
    accepted: { label: 'ACCEPTED', color: 'var(--success)' },
    aborted: { label: 'ABORTED', color: 'var(--danger)' },
    canceled: { label: 'CANCELED', color: 'var(--text-tertiary)' },
}

export function ReviewLoopStatusBadge({ status }: { status: ReviewLoopStatus }) {
    const config = statusConfig[status]
    return (
        <span
            className="font-mono text-xs inline-flex items-center gap-1"
            style={{ color: config.color }}
        >
            {config.active && (
                <span className="inline-block animate-[blink_1s_step-end_infinite]">●</span>
            )}
            <span>[{config.label}]</span>
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        </span>
    )
}
