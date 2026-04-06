import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ReviewLoopStatus } from '@/types/api'

type LoopControlsProps = {
    status: ReviewLoopStatus
    onContinue: (instruction?: string) => void
    onPause: () => void
    onCancel: () => void
    isPending: boolean
}

function StatusIndicator({ status }: { status: ReviewLoopStatus }) {
    if (status === 'executing') {
        return (
            <div className="font-mono text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-[blink_1s_step-end_infinite]" />
                <span>Executing...</span>
                <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
            </div>
        )
    }

    if (status === 'reviewing') {
        return (
            <div className="font-mono text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-[blink_1s_step-end_infinite]" />
                <span>Reviewing...</span>
                <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
            </div>
        )
    }

    // Terminal states: accepted, aborted, canceled — show nothing
    return null
}

export function LoopControls({ status, onContinue, onPause, onCancel, isPending }: LoopControlsProps) {
    const [instruction, setInstruction] = useState('')
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)

    // Active states: show pause + cancel buttons
    if (status === 'executing' || status === 'reviewing') {
        return (
            <div className="space-y-2">
                <StatusIndicator status={status} />
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onPause}
                        disabled={isPending}
                        className="rounded-sm border border-[var(--warn)]/40 bg-transparent px-3 py-1 font-mono text-xs text-[var(--warn)] transition-colors hover:bg-[var(--warn)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPending ? 'Pausing...' : 'Pause ⏸'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        disabled={isPending}
                        className="rounded-sm border border-[var(--border-secondary)] bg-transparent px-3 py-1 font-mono text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel &#x2717;
                    </button>
                </div>

                <ConfirmDialog
                    isOpen={showCancelConfirm}
                    onClose={() => setShowCancelConfirm(false)}
                    title="Cancel Review Loop"
                    description="Are you sure you want to cancel this review loop? This action cannot be undone."
                    confirmLabel="Cancel Loop"
                    confirmingLabel="Canceling..."
                    onConfirm={async () => {
                        onCancel()
                    }}
                    isPending={isPending}
                    destructive
                />
            </div>
        )
    }

    // Paused or waiting_user: show instruction input + continue/cancel
    if (status === 'paused' || status === 'waiting_user') {
        const handleContinue = () => {
            onContinue(instruction.trim() || undefined)
            setInstruction('')
        }

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleContinue()
            }
        }

        return (
            <>
                <div className="font-mono text-xs border border-[var(--border-secondary)] rounded-sm overflow-hidden min-w-0">
                    {/* Header */}
                    <div className="px-2 py-1 bg-[var(--bg-quaternary)] text-[var(--text-primary)] font-medium" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                        {status === 'paused' ? 'Paused — Add Instructions' : 'Action Required'}
                    </div>

                    <div className="p-2 space-y-2 min-w-0">
                        {status === 'paused' && (
                            <div className="text-[var(--warn)]">
                                Loop paused. Add your instructions for the reviewer below, then continue.
                            </div>
                        )}

                        {/* Instruction label */}
                        <div className="text-[var(--text-tertiary)]">
                            {'>'} {status === 'paused' ? 'Instructions for reviewer:' : 'Additional instruction (optional):'}
                        </div>

                        {/* Textarea */}
                        <textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="..."
                            className="w-full min-w-0 resize-none rounded-sm border border-[var(--border-secondary)] bg-[var(--cursor-code-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                            rows={3}
                            disabled={isPending}
                            autoFocus={status === 'paused'}
                        />

                        {/* Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={handleContinue}
                                disabled={isPending}
                                className="rounded-sm border border-[var(--accent)] bg-[var(--bg-quaternary)] px-3 py-1 font-mono text-xs text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--cursor-button-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? 'Sending...' : 'Continue \u25B8'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCancelConfirm(true)}
                                disabled={isPending}
                                className="rounded-sm border border-[var(--border-secondary)] bg-transparent px-3 py-1 font-mono text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel &#x2717;
                            </button>
                        </div>
                    </div>
                </div>

                <ConfirmDialog
                    isOpen={showCancelConfirm}
                    onClose={() => setShowCancelConfirm(false)}
                    title="Cancel Review Loop"
                    description="Are you sure you want to cancel this review loop? This action cannot be undone."
                    confirmLabel="Cancel Loop"
                    confirmingLabel="Canceling..."
                    onConfirm={async () => {
                        onCancel()
                    }}
                    isPending={isPending}
                    destructive
                />
            </>
        )
    }

    return null
}
