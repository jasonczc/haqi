import { useState } from 'react'
import type { ReviewRound, ReviewRoundStatus } from '@/types/api'
import { RoundCard } from './RoundCard'

const dotSymbol: Record<ReviewRoundStatus, string> = {
    instructed: '\u25CB',
    executing: '\u25C9',
    executed: '\u25CF',
    reviewed: '\u25CF',
    user_pending: '\u25C6',
}

const dotColor: Record<ReviewRoundStatus, string> = {
    instructed: 'var(--app-hint)',
    executing: 'var(--app-badge-warning-text)',
    executed: 'var(--app-badge-info-text)',
    reviewed: 'var(--app-badge-success-text)',
    user_pending: 'var(--app-badge-warning-text)',
}

export function RoundTimeline({ rounds }: { rounds: ReviewRound[] }) {
    const sorted = [...rounds].sort((a, b) => a.round - b.round)
    const [expandedId, setExpandedId] = useState<string | null>(
        sorted.length > 0 ? sorted[sorted.length - 1].id : null
    )

    return (
        <div className="font-mono text-xs min-w-0">
            {sorted.map((round, i) => {
                const isLatest = i === sorted.length - 1
                const isExpanded = expandedId === round.id
                const symbol = dotSymbol[round.status] ?? '\u25CB'
                const color = dotColor[round.status] ?? 'var(--app-hint)'

                return (
                    <div key={round.id} className="min-w-0">
                        {/* Connector line above */}
                        {i > 0 && (
                            <div className="ml-[5px] h-3 border-l border-[var(--app-border)]" />
                        )}

                        {/* Timeline node */}
                        <button
                            type="button"
                            className="flex items-center gap-2 w-full text-left hover:bg-[var(--app-subtle-bg)] transition-colors rounded-sm px-0 py-0.5 min-w-0"
                            onClick={() => setExpandedId(isExpanded ? null : round.id)}
                        >
                            <span className="shrink-0 w-3 text-center" style={{ color }}>
                                {symbol}
                            </span>
                            <span className="text-[var(--app-fg)] shrink-0">Round {round.round}</span>
                            <span className="shrink-0" style={{ color }}>[{round.status.replace('_', ' ').toUpperCase()}]</span>
                            {isLatest && (
                                <span className="text-[var(--app-hint)] shrink-0">&larr; current</span>
                            )}
                        </button>

                        {/* Expanded round card */}
                        {isExpanded && (
                            <div className="ml-5 mt-1 mb-1 min-w-0">
                                <RoundCard round={round} isLatest={isLatest} />
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
