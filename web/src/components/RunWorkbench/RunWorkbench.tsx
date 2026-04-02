import { useState, useMemo } from 'react'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import type { WorkbenchTab, PrInfo, CiCheck, CommitInfo, FileChange, BranchStatus } from './types'
import { PlanPanel } from './PlanPanel'
import { SetupPanel } from './SetupPanel'
import { SecretsPanel } from './SecretsPanel'
import { GitPanel } from './GitPanel'
import { DesktopPanel } from './DesktopPanel'
import { TerminalPanel } from './TerminalPanel'

// ── Tab Bar (matches Cursor's top-right bar exactly) ─────────────────

function WorkbenchTabBar(props: {
    activeTab: WorkbenchTab
    onTabChange: (tab: WorkbenchTab) => void
    isSetupMode: boolean
    hasDesktop: boolean
    hasTerminal: boolean
    onClose: () => void
    onFullscreen: () => void
}) {
    const tabs: { key: WorkbenchTab; label: string; available: boolean }[] = props.isSetupMode
        ? [
            { key: 'setup', label: 'Setup', available: true },
            { key: 'secrets', label: 'Secrets', available: true },
            { key: 'git', label: 'Git', available: true },
            { key: 'desktop', label: 'Desktop', available: props.hasDesktop },
            { key: 'terminal', label: 'Terminal', available: props.hasTerminal }
        ]
        : [
            { key: 'plan', label: 'Plan', available: true },
            { key: 'git', label: 'Git', available: true },
            { key: 'desktop', label: 'Desktop', available: props.hasDesktop },
            { key: 'terminal', label: 'Terminal', available: props.hasTerminal }
        ]

    return (
        <div className="flex items-center justify-between border-b border-[var(--border-tertiary)] bg-[var(--bg-editor)]">
            <div className="flex">
                {tabs.filter(t => t.available).map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => props.onTabChange(tab.key)}
                        className={`relative px-4 py-2.5 text-[var(--font-size-base)] font-medium transition-colors ${
                            props.activeTab === tab.key
                                ? 'text-[var(--text-primary)]'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                        }`}
                    >
                        {tab.label}
                        {props.activeTab === tab.key && (
                            <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--base)]" />
                        )}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-0.5 pr-2">
                {/* More menu */}
                <button
                    type="button"
                    className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-quaternary)] transition-colors"
                    title="More options"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </button>
                {/* Fullscreen */}
                <button
                    type="button"
                    onClick={props.onFullscreen}
                    className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-quaternary)] transition-colors"
                    title="Expand panel"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                </button>
                {/* Close */}
                <button
                    type="button"
                    onClick={props.onClose}
                    className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-quaternary)] transition-colors"
                    title="Close panel"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

// ── Main RunWorkbench ────────────────────────────────────────────────

export function RunWorkbench(props: {
    session: Session
    api?: ApiClient | null
    /** PR info from GitHub API — null if no PR yet */
    prInfo: PrInfo | null
    checks: CiCheck[]
    commits: CommitInfo[]
    files: FileChange[]
    branchStatus: BranchStatus | null
    onMerge?: () => void
    onUpdateBranch?: () => void
    onClose: () => void
}) {
    const hasDesktop = Boolean(props.session.metadata?.containerId)
    const hasTerminal = Boolean(props.session.metadata?.terminalDescriptors?.length)
    const isSetupMode = Boolean(props.session.metadata?.setupStatus || props.session.metadata?.environmentId)

    const defaultTab: WorkbenchTab = isSetupMode ? 'setup' : 'git'
    const [activeTab, setActiveTab] = useState<WorkbenchTab>(defaultTab)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Validate active tab
    const effectiveTab = useMemo(() => {
        if (activeTab === 'desktop' && !hasDesktop) return defaultTab
        if (activeTab === 'terminal' && !hasTerminal) return defaultTab
        if (activeTab === 'setup' && !isSetupMode) return 'git'
        if (activeTab === 'plan' && isSetupMode) return 'setup'
        return activeTab
    }, [activeTab, hasDesktop, hasTerminal, isSetupMode, defaultTab])

    const handleFullscreen = () => {
        setIsFullscreen(prev => !prev)
    }

    const containerClass = isFullscreen
        ? 'fixed inset-0 z-50 flex flex-col bg-[var(--bg-editor)]'
        : 'flex h-full flex-col border-l border-[var(--border-tertiary)] bg-[var(--bg-editor)]'

    return (
        <div className={containerClass}>
            <WorkbenchTabBar
                activeTab={effectiveTab}
                onTabChange={setActiveTab}
                isSetupMode={isSetupMode}
                hasDesktop={hasDesktop}
                hasTerminal={hasTerminal}
                onClose={props.onClose}
                onFullscreen={handleFullscreen}
            />

            <div className="flex min-h-0 flex-1 flex-col">
                {effectiveTab === 'plan' && (
                    <PlanPanel session={props.session} />
                )}
                {effectiveTab === 'setup' && (
                    <SetupPanel session={props.session} api={props.api ?? null} />
                )}
                {effectiveTab === 'secrets' && (
                    <SecretsPanel api={props.api ?? null} />
                )}
                {effectiveTab === 'git' && (
                    <GitPanel
                        session={props.session}
                        prInfo={props.prInfo}
                        checks={props.checks}
                        commits={props.commits}
                        files={props.files}
                        branchStatus={props.branchStatus}
                        onMerge={props.onMerge}
                        onUpdateBranch={props.onUpdateBranch}
                    />
                )}
                {effectiveTab === 'desktop' && hasDesktop && (
                    <DesktopPanel sessionId={props.session.id} />
                )}
                {effectiveTab === 'terminal' && hasTerminal && (
                    <TerminalPanel sessionId={props.session.id} />
                )}
            </div>
        </div>
    )
}
