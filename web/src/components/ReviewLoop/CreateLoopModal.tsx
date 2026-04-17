import { useState, useEffect, useMemo, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ReviewLoopUserPreference, SessionSummary } from '@/types/api'
import { matchesSessionSearch } from '@/lib/session-search'
import { getSessionTitle } from '@/lib/session-title'

export type CreateLoopData = {
    workerSessionId: string
    reviewerSessionId: string
    requirement: string
    acceptanceCriteria: string
    maxRounds: number
    userPreference: ReviewLoopUserPreference
}

type CreateLoopModalProps = {
    open: boolean
    onClose: () => void
    onSubmit: (data: CreateLoopData) => void
    sessions: SessionSummary[]
}

const PREFERENCE_OPTIONS: Array<{ value: ReviewLoopUserPreference; label: string }> = [
    { value: 'auto', label: 'auto' },
    { value: 'verbose', label: 'verbose' },
    { value: 'silent', label: 'silent' },
]

const inputClass =
    'w-full rounded-sm border border-[var(--border-secondary)] bg-[var(--cursor-code-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]'

const labelClass = 'font-mono text-xs text-[var(--text-tertiary)]'

/* ── CLI-style session picker with search ── */
function SessionPicker(props: {
    label: string
    sessions: SessionSummary[]
    excludeIds?: Set<string>
    selectedId: string
    onSelect: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const selected = props.sessions.find(s => s.id === props.selectedId)
    const selectedTitle = selected ? getSessionTitle(selected, { fallbackIdLength: 12 }) : null

    const filtered = useMemo(() => {
        return props.sessions.filter(s => {
            if (props.excludeIds?.has(s.id)) return false
            return matchesSessionSearch(s, search)
        })
    }, [props.sessions, props.excludeIds, search])

    const online = useMemo(() => filtered.filter(s => s.active), [filtered])
    const offline = useMemo(() => filtered.filter(s => !s.active), [filtered])

    useEffect(() => {
        if (open) {
            setSearch('')
            setTimeout(() => inputRef.current?.focus(), 0)
        }
    }, [open])

    const handleSelect = (id: string) => {
        props.onSelect(id)
        setOpen(false)
    }

    const renderRow = (s: SessionSummary) => {
        const title = getSessionTitle(s, { fallbackIdLength: 12 })
        const path = s.metadata?.path ?? ''
        const isSelected = s.id === props.selectedId
        return (
            <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s.id)}
                className={cn(
                    'flex w-full items-center gap-2 px-2 py-1 text-left transition-colors rounded-sm',
                    isSelected
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-quaternary)]'
                )}
            >
                <span className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    s.active ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]/40'
                )} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{title}</span>
                {path && <span className="shrink-0 truncate max-w-[120px] text-[10px] text-[var(--text-tertiary)]">{path.split('/').pop()}</span>}
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-1">
            <label className={labelClass}>{props.label}:</label>
            <div className="flex items-center gap-1.5">
                <span className="text-[var(--text-tertiary)]">{'>'}</span>
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className={cn(
                        inputClass,
                        'text-left truncate',
                        !selectedTitle && 'text-[var(--text-tertiary)]'
                    )}
                >
                    {selectedTitle ?? 'Select a session...'}
                </button>
            </div>

            {open && (
                <div className="ml-4 mt-0.5 rounded-sm border border-[var(--border-secondary)] bg-[var(--cursor-code-bg)] overflow-hidden">
                    {/* Search */}
                    <div className="border-b border-[var(--border-secondary)] px-2 py-1">
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="search..."
                            className="w-full bg-transparent font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                        />
                    </div>

                    {/* Results */}
                    <div className="max-h-[160px] overflow-y-auto py-0.5">
                        {online.length === 0 && offline.length === 0 ? (
                            <div className="px-2 py-1.5 font-mono text-xs text-[var(--text-tertiary)]">
                                {search ? 'no match' : 'no sessions'}
                            </div>
                        ) : (
                            <>
                                {online.length > 0 && (
                                    <>
                                        <div className="px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                                            online ({online.length})
                                        </div>
                                        {online.map(renderRow)}
                                    </>
                                )}
                                {offline.length > 0 && (
                                    <>
                                        <div className="px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                                            offline ({offline.length})
                                        </div>
                                        {offline.map(renderRow)}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export function CreateLoopModal({ open, onClose, onSubmit, sessions }: CreateLoopModalProps) {
    const [workerSessionId, setWorkerSessionId] = useState('')
    const [reviewerSessionId, setReviewerSessionId] = useState('')
    const [requirement, setRequirement] = useState('')
    const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
    const [maxRounds, setMaxRounds] = useState(10)
    const [userPreference, setUserPreference] = useState<ReviewLoopUserPreference>('auto')

    useEffect(() => {
        if (open) {
            setWorkerSessionId('')
            setReviewerSessionId('')
            setRequirement('')
            setAcceptanceCriteria('')
            setMaxRounds(10)
            setUserPreference('auto')
        }
    }, [open])

    const workerExclude = useMemo(() => new Set<string>(), [])
    const reviewerExclude = useMemo(() => workerSessionId ? new Set([workerSessionId]) : new Set<string>(), [workerSessionId])

    const isValid =
        workerSessionId !== '' &&
        reviewerSessionId !== '' &&
        workerSessionId !== reviewerSessionId &&
        requirement.trim() !== '' &&
        acceptanceCriteria.trim() !== '' &&
        maxRounds >= 1

    const handleSubmit = () => {
        if (!isValid) return
        onSubmit({
            workerSessionId,
            reviewerSessionId,
            requirement: requirement.trim(),
            acceptanceCriteria: acceptanceCriteria.trim(),
            maxRounds,
            userPreference,
        })
    }

    const handleWorkerChange = (id: string) => {
        setWorkerSessionId(id)
        if (id === reviewerSessionId) {
            setReviewerSessionId('')
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md font-mono !rounded-sm overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="font-mono text-xs font-normal text-[var(--text-tertiary)]">
                        <div className="flex items-center gap-2">
                            <div className="border-t border-[var(--border-secondary)] w-4" />
                            <span>New Review Loop</span>
                            <div className="flex-1 border-t border-[var(--border-secondary)]" />
                        </div>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Set up a worker-reviewer loop with acceptance criteria.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex flex-col gap-3 text-xs min-w-0">
                    {/* Worker Session */}
                    <SessionPicker
                        label="Worker Session"
                        sessions={sessions}
                        excludeIds={workerExclude}
                        selectedId={workerSessionId}
                        onSelect={handleWorkerChange}
                    />

                    {/* Reviewer Session */}
                    <SessionPicker
                        label="Reviewer Session"
                        sessions={sessions}
                        excludeIds={reviewerExclude}
                        selectedId={reviewerSessionId}
                        onSelect={setReviewerSessionId}
                    />

                    {workerSessionId && workerSessionId === reviewerSessionId && (
                        <p className="font-mono text-xs text-[var(--warn)] ml-4">
                            ! Worker and reviewer must be different sessions.
                        </p>
                    )}

                    {/* Requirement */}
                    <div className="flex flex-col gap-1">
                        <label className={labelClass}>Requirement:</label>
                        <div className="flex items-start gap-1.5">
                            <span className="text-[var(--text-tertiary)] mt-1.5">{'>'}</span>
                            <textarea
                                value={requirement}
                                onChange={(e) => setRequirement(e.target.value)}
                                placeholder="Describe the task for the worker..."
                                className={cn(inputClass, 'resize-none placeholder:text-[var(--text-tertiary)]')}
                                rows={3}
                            />
                        </div>
                    </div>

                    {/* Acceptance Criteria */}
                    <div className="flex flex-col gap-1">
                        <label className={labelClass}>Acceptance Criteria:</label>
                        <div className="flex items-start gap-1.5">
                            <span className="text-[var(--text-tertiary)] mt-1.5">{'>'}</span>
                            <textarea
                                value={acceptanceCriteria}
                                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                                placeholder="Define what the reviewer should check..."
                                className={cn(inputClass, 'resize-none placeholder:text-[var(--text-tertiary)]')}
                                rows={3}
                            />
                        </div>
                    </div>

                    {/* Max Rounds & Notify inline */}
                    <div className="flex items-center gap-4 ml-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text-tertiary)]">max-rounds:</span>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={maxRounds}
                                onChange={(e) => setMaxRounds(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-14 rounded-sm border border-[var(--border-secondary)] bg-[var(--cursor-code-bg)] px-2 py-0.5 font-mono text-xs text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)]"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text-tertiary)]">notify:</span>
                            <div className="flex items-center gap-0.5">
                                {PREFERENCE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setUserPreference(opt.value)}
                                        className={cn(
                                            'rounded-sm px-2 py-0.5 font-mono text-xs transition-colors',
                                            userPreference === opt.value
                                                ? 'border border-[var(--accent)] text-[var(--text-primary)]'
                                                : 'border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2 ml-2">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className="rounded-sm border border-[var(--accent)] bg-[var(--bg-quaternary)] px-3 py-1 font-mono text-xs text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--cursor-button-text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Create &#x25B8;
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-sm border border-[var(--border-secondary)] bg-transparent px-3 py-1 font-mono text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
