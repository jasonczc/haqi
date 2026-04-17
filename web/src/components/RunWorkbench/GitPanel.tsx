import { useState, type ReactNode } from 'react'
import type { Session } from '@/types/api'
import type { GitSubTab, PrInfo, PrState, CiCheck, CommitInfo, FileChange, BranchStatus } from './types'
import { Button } from '@/components/ui/button'

// ── Helpers ──────────────────────────────────────────────────────────

function PrStateBadge(props: { state: PrState }) {
    const config: Record<PrState, { label: string; bg: string; text: string; icon: ReactNode }> = {
        open: {
            label: 'Open',
            bg: 'var(--cursor-success-bg)',
            text: 'var(--cursor-success)',
            icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" /></svg>
        },
        draft: {
            label: 'Draft',
            bg: 'var(--cursor-bg-soft)',
            text: 'var(--cursor-text-tertiary)',
            icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" /></svg>
        },
        merged: {
            label: 'Merged',
            bg: 'rgba(124,58,237,0.14)',
            text: 'var(--cursor-info)',
            icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M5 3.254V3.25a.75.75 0 110 .005v5.45a2.5 2.5 0 101.5 0V5.957a4.001 4.001 0 003.5 3.294v.499a2.5 2.5 0 101.5 0v-.73A5.5 5.5 0 006.5 4.5v-.246z" /></svg>
        },
        closed: {
            label: 'Closed',
            bg: 'var(--cursor-danger-bg)',
            text: 'var(--cursor-danger)',
            icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" /></svg>
        }
    }
    const c = config[props.state]
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: c.bg, color: c.text }}
        >
            {c.icon}
            {c.label}
        </span>
    )
}

function FileStatusIcon(props: { status: string }) {
    const colors: Record<string, string> = {
        added: 'var(--cursor-success)',
        modified: 'var(--cursor-link)',
        removed: 'var(--cursor-danger)',
        renamed: 'var(--cursor-link)'
    }
    const labels: Record<string, string> = { added: 'A', modified: 'M', removed: 'D', renamed: 'R' }
    return (
        <span
            className="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
            style={{ color: colors[props.status] ?? 'var(--cursor-text-tertiary)' }}
        >
            {labels[props.status] ?? '?'}
        </span>
    )
}

// ── Diff Sub-Tab ─────────────────────────────────────────────────────

function DiffTab(props: { files: FileChange[]; prInfo: PrInfo | null }) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const toggle = (filename: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(filename)) next.delete(filename)
            else next.add(filename)
            return next
        })
    }

    if (!props.files.length) {
        return (
            <div className="flex items-center justify-center p-8 text-sm text-[var(--cursor-text-tertiary)]">
                No file changes found.
            </div>
        )
    }

    const totalAdd = props.files.reduce((s, f) => s + f.additions, 0)
    const totalDel = props.files.reduce((s, f) => s + f.deletions, 0)

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Summary header */}
            <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-4 py-2.5">
                <span className="text-[13px] font-medium text-[var(--cursor-text-primary)]">
                    {props.files.length} {props.files.length === 1 ? 'file' : 'files'} changed
                </span>
                <span className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[var(--cursor-success)]">+{totalAdd}</span>
                    <span className="font-mono text-[var(--cursor-danger)]">-{totalDel}</span>
                </span>
            </div>
            {/* File list */}
            {props.files.map(file => {
                const shortName = file.filename.split('/').pop() ?? file.filename
                const dir = file.filename.includes('/') ? file.filename.substring(0, file.filename.lastIndexOf('/')) : ''
                return (
                    <div key={file.filename}>
                        <button
                            type="button"
                            onClick={() => toggle(file.filename)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[var(--cursor-bg-soft)] transition-colors"
                        >
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                className={`flex-shrink-0 text-[var(--cursor-text-tertiary)] transition-transform ${expanded.has(file.filename) ? 'rotate-90' : ''}`}
                            >
                                <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <FileStatusIcon status={file.status} />
                            <div className="min-w-0 flex-1 truncate">
                                <span className="text-[13px] font-medium text-[var(--cursor-text-primary)]">{shortName}</span>
                                {dir && <span className="ml-1.5 text-[11px] text-[var(--cursor-text-tertiary)]">{dir}</span>}
                            </div>
                            <span className="flex items-center gap-1.5 text-xs tabular-nums">
                                {file.additions > 0 && (
                                    <span className="font-mono text-[var(--cursor-success)]">+{file.additions}</span>
                                )}
                                {file.deletions > 0 && (
                                    <span className="font-mono text-[var(--cursor-danger)]">-{file.deletions}</span>
                                )}
                            </span>
                        </button>
                        {expanded.has(file.filename) && file.patch && (
                            <div className="border-y border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-soft)] px-4 py-2 font-mono text-[12px] leading-[1.6] overflow-x-auto whitespace-pre">
                                {file.patch.split('\n').map((line, i) => {
                                    let lineClass = 'text-[var(--cursor-text-primary)]'
                                    if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'bg-[var(--cursor-success-bg-quiet)] text-[var(--cursor-success)]'
                                    else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'bg-[var(--cursor-danger-bg-quiet)] text-[var(--cursor-danger)]'
                                    else if (line.startsWith('@@')) lineClass = 'text-[var(--cursor-link)]'
                                    return <div key={i} className={lineClass}>{line}</div>
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Review Sub-Tab ───────────────────────────────────────────────────

function ReviewTab(props: { checks: CiCheck[]; branchStatus: BranchStatus | null; prInfo: PrInfo | null; onMerge?: () => void; onUpdateBranch?: () => void }) {
    const failedChecks = props.checks.filter(c => c.status === 'failure')
    const pendingChecks = props.checks.filter(c => c.status === 'pending')

    const allPassed = failedChecks.length === 0 && pendingChecks.length === 0 && props.checks.length > 0
    const hasFailed = failedChecks.length > 0
    const mergeBlocked = hasFailed || (props.prInfo && !props.prInfo.mergeable)

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Checks section */}
            {props.checks.length > 0 && (
                <div className="border-b border-[var(--cursor-stroke-secondary)]">
                    <button
                        type="button"
                        className="flex w-full items-center gap-2.5 px-4 py-3"
                    >
                        {hasFailed ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--cursor-danger)">
                                <circle cx="8" cy="8" r="8" opacity="0.15" />
                                <circle cx="8" cy="8" r="3" />
                            </svg>
                        ) : allPassed ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--cursor-success)">
                                <circle cx="8" cy="8" r="7" />
                                <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--cursor-warning)">
                                <circle cx="8" cy="8" r="8" opacity="0.15" />
                                <circle cx="8" cy="8" r="3" />
                            </svg>
                        )}
                        <span className="text-[13px] font-medium text-[var(--cursor-text-primary)]">
                            {hasFailed
                                ? `${failedChecks.length} check${failedChecks.length > 1 ? 's' : ''} failing`
                                : allPassed
                                    ? 'All checks passed'
                                    : `${pendingChecks.length} check${pendingChecks.length > 1 ? 's' : ''} pending`
                            }
                        </span>
                    </button>
                    {hasFailed && (
                        <div className="px-4 pb-3">
                            <div className="text-[12px] text-[var(--cursor-text-tertiary)] mb-1.5">
                                {failedChecks.length} failed
                            </div>
                            {failedChecks.map(check => (
                                <div key={check.name} className="flex items-center gap-2 py-1">
                                    <svg width="12" height="12" viewBox="0 0 12 12" className="flex-shrink-0 text-[var(--cursor-danger)]">
                                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    <span className="text-[12px] text-[var(--cursor-text-primary)]">{check.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Branch behind */}
            {props.branchStatus && props.branchStatus.behind > 0 && (
                <div className="border-b border-[var(--cursor-stroke-secondary)] px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                        <svg width="14" height="14" viewBox="0 0 16 16" className="text-[var(--cursor-text-tertiary)]">
                            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span className="text-[13px] font-medium text-[var(--cursor-text-primary)]">Branch is behind</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--cursor-text-tertiary)]">
                            This branch is {props.branchStatus.behind} commit{props.branchStatus.behind > 1 ? 's' : ''} behind {props.prInfo?.baseBranch ?? 'main'}
                        </span>
                        {props.onUpdateBranch && (
                            <Button variant="secondary" size="sm" onClick={props.onUpdateBranch}>
                                Update branch
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Merge section */}
            {props.prInfo && (
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[13px] font-medium text-[var(--cursor-text-primary)]">
                                {mergeBlocked ? 'Merge blocked' : 'Ready to merge'}
                            </div>
                            {mergeBlocked && props.prInfo.mergeBlockedReason && (
                                <div className="mt-0.5 text-[12px] text-[var(--cursor-text-tertiary)]">
                                    {props.prInfo.mergeBlockedReason}
                                </div>
                            )}
                        </div>
                        <Button
                            variant={mergeBlocked ? 'secondary' : 'success'}
                            size="sm"
                            onClick={props.onMerge}
                            disabled={Boolean(mergeBlocked)}
                        >
                            Merge
                        </Button>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {props.checks.length === 0 && !props.branchStatus && !props.prInfo && (
                <div className="flex items-center justify-center p-8 text-sm text-[var(--cursor-text-tertiary)]">
                    No review data available.
                </div>
            )}
        </div>
    )
}

// ── Commits Sub-Tab ──────────────────────────────────────────────────

function CommitsTab(props: { commits: CommitInfo[] }) {
    if (!props.commits.length) {
        return (
            <div className="flex items-center justify-center p-8 text-sm text-[var(--cursor-text-tertiary)]">
                No commits found.
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto">
            {props.commits.map((commit, i) => (
                <div
                    key={commit.sha}
                    className={`flex items-start gap-3 px-4 py-2.5 ${
                        i < props.commits.length - 1 ? 'border-b border-[var(--cursor-stroke-secondary)]' : ''
                    }`}
                >
                    {/* Commit dot */}
                    <div className="mt-1.5 flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-[var(--cursor-text-tertiary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[var(--cursor-text-primary)]">
                            {commit.message.split('\n')[0]}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--cursor-text-tertiary)]">
                            <span className="font-mono">{commit.sha.slice(0, 7)}</span>
                            <span>{commit.author}</span>
                            <span>{commit.date}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Main GitPanel ────────────────────────────────────────────────────

export function GitPanel(props: {
    session: Session
    prInfo: PrInfo | null
    checks: CiCheck[]
    commits: CommitInfo[]
    files: FileChange[]
    branchStatus: BranchStatus | null
    onMerge?: () => void
    onUpdateBranch?: () => void
}) {
    const [subTab, setSubTab] = useState<GitSubTab>('diff')

    const prUrl = props.prInfo?.url
    const prNumber = props.prInfo?.number
    const prTitle = props.prInfo?.title ?? (props.session.metadata as any)?.name ?? ''
    const branch = props.prInfo?.branch ?? props.session.metadata?.workspaceBranch ?? props.session.metadata?.worktree?.branch ?? ''
    const baseBranch = props.prInfo?.baseBranch ?? 'main'

    const subTabs: { key: GitSubTab; label: string; count?: number }[] = [
        { key: 'diff', label: 'Diff' },
        { key: 'review', label: 'Review', count: props.checks.filter(c => c.status === 'failure').length || undefined },
        { key: 'commits', label: 'Commits', count: props.commits.length || undefined }
    ]

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <div className="context-sub-header border-b border-[var(--cursor-stroke-secondary)] px-4 py-3">
                <div className="pr-title-row flex items-center gap-2 mb-1">
                    {prTitle && (
                        <span className="pr-title truncate text-[13px] font-semibold text-[var(--cursor-text-primary)]">
                            {prTitle}
                        </span>
                    )}
                    {prNumber && prUrl && (
                        <a
                            href={prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pr-number text-[12px] text-[var(--cursor-link)] hover:underline flex-shrink-0"
                        >
                            #{prNumber} ↗
                        </a>
                    )}
                    {props.prInfo && props.prInfo.state === 'draft' ? (
                        <button
                            type="button"
                            className="btn-primary ml-auto"
                        >
                            Mark as ready
                        </button>
                    ) : null}
                </div>
                <div className="branch-flow-row flex items-center gap-2">
                    {props.prInfo && (
                        props.prInfo.state === 'draft'
                            ? <span className="badge draft">Draft</span>
                            : <PrStateBadge state={props.prInfo.state} />
                    )}
                    {branch && (
                        <span className="branch-name text-[11px] text-[var(--cursor-text-tertiary)] font-mono truncate">
                            {branch}
                        </span>
                    )}
                    {branch && baseBranch && (
                        <span className="arrow-icon text-[11px] text-[var(--cursor-text-tertiary)]">→</span>
                    )}
                    {baseBranch && (
                        <span className="branch-name text-[11px] text-[var(--cursor-text-tertiary)] font-mono">
                            {baseBranch}
                        </span>
                    )}
                </div>

                <div className="code-flow-tabs flex">
                    {subTabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setSubTab(tab.key)}
                            className={`flow-tab ${subTab === tab.key ? 'active' : ''}`}
                        >
                            <span>{tab.label}</span>
                            {tab.key === 'review' && (tab.count ?? 0) > 0 ? (
                                <span className="red-dot" />
                            ) : null}
                            {tab.count != null ? (
                                <span className="count">{tab.count}</span>
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sub-tab content */}
            <div className="flex min-h-0 flex-1 flex-col">
                {subTab === 'diff' && <DiffTab files={props.files} prInfo={props.prInfo} />}
                {subTab === 'review' && (
                    <ReviewTab
                        checks={props.checks}
                        branchStatus={props.branchStatus}
                        prInfo={props.prInfo}
                        onMerge={props.onMerge}
                        onUpdateBranch={props.onUpdateBranch}
                    />
                )}
                {subTab === 'commits' && <CommitsTab commits={props.commits} />}
            </div>
        </div>
    )
}
