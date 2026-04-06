import type { ReviewRound } from '@/types/api'
import { WorkerOutputPanel } from './WorkerOutputPanel'
import { ProgressBar } from './ProgressBar'
import { CriteriaChecklist } from './CriteriaChecklist'
import { CliDivider } from './CliDivider'

const verdictActionConfig: Record<string, {
    label: string
    color: string
}> = {
    continue: { label: 'CONTINUE', color: 'var(--warn)' },
    pass: { label: 'PASS', color: 'var(--success)' },
    abort: { label: 'ABORT', color: 'var(--danger)' },
    notify_user: { label: 'NOTIFY', color: 'var(--cursor-info)' },
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

export function RoundCard({ round, isLatest }: { round: ReviewRound; isLatest: boolean }) {
    const actionCfg = round.verdict ? verdictActionConfig[round.verdict.action] : null
    const borderColor = isLatest ? 'var(--accent)' : 'var(--border-secondary)'

    return (
        <div
            className="font-mono text-xs rounded-sm overflow-hidden min-w-0"
            style={{ border: `1px solid ${borderColor}` }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-2 py-1 bg-[var(--bg-quaternary)] text-[var(--text-tertiary)] min-w-0 flex-wrap"
                style={{ borderBottom: '1px solid var(--border-secondary)' }}
            >
                <span className="text-[var(--text-primary)] shrink-0">Round {round.round}</span>
                <span className="shrink-0">[{round.status.replace('_', ' ').toUpperCase()}]</span>
                <span className="tabular-nums shrink-0">{formatTime(round.startedAt)}</span>
            </div>

            {/* Body */}
            <div className="px-2 py-1.5 space-y-2 min-w-0 overflow-hidden">
                {/* Instruction */}
                {round.instruction && (
                    <div className="min-w-0">
                        <div className="text-[var(--text-tertiary)]"># instruction</div>
                        <div className="text-[var(--text-primary)] whitespace-pre-wrap break-words">
                            {round.instruction.split('\n').map((line, i) => (
                                <div key={i}><span className="text-[var(--text-tertiary)]">&gt;</span> {line}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Worker Output */}
                {round.workerOutput && (
                    <WorkerOutputPanel output={round.workerOutput} />
                )}

                {/* Verdict */}
                {round.verdict && (
                    <div className="pt-1 min-w-0" style={{ borderTop: '1px solid var(--border-tertiary)' }}>
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)] min-w-0">
                            <div className="border-t border-[var(--border-secondary)] w-3 shrink-0" />
                            <span className="text-[var(--text-primary)] shrink-0">Verdict:</span>
                            {actionCfg && (
                                <span className="shrink-0" style={{ color: actionCfg.color }}>{actionCfg.label}</span>
                            )}
                            <div className="flex-1 border-t border-[var(--border-secondary)]" />
                        </div>

                        {round.verdict.feedback && (
                            <p className="text-[var(--text-primary)] whitespace-pre-wrap break-words mt-1">
                                {round.verdict.feedback}
                            </p>
                        )}

                        <div className="mt-1">
                            <ProgressBar progress={round.verdict.progress} />
                        </div>

                        {round.verdict.criteriaStatus.length > 0 && (
                            <div className="mt-1">
                                <CriteriaChecklist criteria={round.verdict.criteriaStatus} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
