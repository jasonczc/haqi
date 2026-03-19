import { useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useReviewLoop } from '@/hooks/queries/useReviewLoop'
import { useReviewLoopActions } from '@/hooks/mutations/useReviewLoopActions'
import { LoadingState } from '@/components/LoadingState'
import {
    ReviewLoopStatusBadge,
    ProgressBar,
    CriteriaChecklist,
    LoopControls,
    LoopSettingsPanel,
    RoundTimeline,
} from '@/components/ReviewLoop'
import type { ReviewLoopUserPreference } from '@/types/api'

// ─── Terminal Section Divider ────────────────────────────────────────────────────

function SectionDivider({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-2 text-[var(--app-hint)] font-mono text-xs select-none mt-4 mb-2">
            <div className="border-t border-[var(--app-border)] w-4" />
            <span className="shrink-0">{title}</span>
            <div className="flex-1 border-t border-[var(--app-border)]" />
        </div>
    )
}

// ─── Main Detail Page ────────────────────────────────────────────────────────────

export default function ReviewLoopDetailPage() {
    const { api } = useAppContext()
    const { loopId } = useParams({ from: '/review-loops/$loopId' })
    const { loop, rounds, isLoading, error } = useReviewLoop(api, loopId)
    const { continueLoop, cancelLoop, pauseLoop, updateLoop, isPending } = useReviewLoopActions(api, loopId)

    const handleContinue = useCallback((instruction?: string) => {
        void continueLoop(instruction ? { additionalInstruction: instruction } : undefined)
    }, [continueLoop])

    const handlePause = useCallback(() => {
        void pauseLoop()
    }, [pauseLoop])

    const handleCancel = useCallback(() => {
        void cancelLoop()
    }, [cancelLoop])

    const handleUpdatePreference = useCallback((pref: ReviewLoopUserPreference) => {
        void updateLoop({ userPreference: pref })
    }, [updateLoop])

    const handleUpdateMaxRounds = useCallback((n: number) => {
        void updateLoop({ maxRounds: n })
    }, [updateLoop])

    if (isLoading || !loop) {
        return (
            <div className="flex h-full items-center justify-center p-4 font-mono">
                <LoadingState label="loading..." className="text-sm" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center p-4 font-mono">
                <div className="text-sm text-[var(--app-badge-error-text)]">err: {error}</div>
            </div>
        )
    }

    // Compute latest progress from the most recent verdict
    const latestVerdict = rounds
        .filter((r) => r.verdict)
        .sort((a, b) => b.round - a.round)[0]?.verdict
    const latestProgress = latestVerdict?.progress ?? 0

    const isTerminal = loop.status === 'accepted' || loop.status === 'aborted' || loop.status === 'canceled'

    return (
        <div className="flex h-full flex-col overflow-y-auto font-mono min-w-0">
            <div className="mx-auto w-full max-w-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] min-w-0">
                {/* ╭─ Header ─╮ */}
                <div className="border border-[var(--app-divider)] rounded-sm p-4">
                    <div className="text-sm text-[var(--app-fg)] leading-relaxed whitespace-pre-wrap">
                        {loop.requirement.length > 300
                            ? loop.requirement.slice(0, 300) + '...'
                            : loop.requirement}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                        <span>status: <ReviewLoopStatusBadge status={loop.status} /></span>
                        <span>round: {loop.currentRound}/{loop.maxRounds}</span>
                        <span>progress: <ProgressBar progress={latestProgress} /></span>
                    </div>
                </div>

                {/* ─── Acceptance Criteria ─── */}
                {loop.acceptanceCriteria && latestVerdict?.criteriaStatus && latestVerdict.criteriaStatus.length > 0 ? (
                    <>
                        <SectionDivider title="Acceptance Criteria" />
                        <div className="border border-[var(--app-divider)] rounded-sm p-3">
                            <CriteriaChecklist criteria={latestVerdict.criteriaStatus} />
                        </div>
                    </>
                ) : loop.acceptanceCriteria ? (
                    <>
                        <SectionDivider title="Acceptance Criteria" />
                        <div className="border border-[var(--app-divider)] rounded-sm p-3">
                            <pre className="font-mono text-xs text-[var(--app-fg)] whitespace-pre-wrap">{loop.acceptanceCriteria}</pre>
                        </div>
                    </>
                ) : null}

                {/* ─── Settings ─── */}
                <SectionDivider title="Settings" />
                <div className="border border-[var(--app-divider)] rounded-sm p-3">
                    <LoopSettingsPanel
                        userPreference={loop.userPreference}
                        maxRounds={loop.maxRounds}
                        currentRound={loop.currentRound}
                        onUpdatePreference={handleUpdatePreference}
                        onUpdateMaxRounds={handleUpdateMaxRounds}
                        disabled={isPending || isTerminal}
                    />
                </div>

                {/* ─── Controls ─── */}
                <SectionDivider title="Controls" />
                <div className="border border-[var(--app-divider)] rounded-sm p-3">
                    <LoopControls
                        status={loop.status}
                        onContinue={handleContinue}
                        onPause={handlePause}
                        onCancel={handleCancel}
                        isPending={isPending}
                    />
                </div>

                {/* ─── Timeline ─── */}
                <SectionDivider title={`Timeline (${rounds.length} rounds)`} />
                {rounds.length === 0 ? (
                    <div className="text-xs text-[var(--app-hint)] py-2">no rounds yet.</div>
                ) : (
                    <RoundTimeline rounds={rounds} />
                )}
            </div>
        </div>
    )
}
