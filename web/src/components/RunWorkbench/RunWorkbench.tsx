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
import { Button } from '@/components/ui/button'

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
    const [menuOpen, setMenuOpen] = useState(false)
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
        <div className="context-header flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)]">
            <div className="context-tabs flex">
                {tabs.filter(t => t.available).map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => props.onTabChange(tab.key)}
                        className={`context-tab relative px-0 py-1 text-[13px] font-medium transition-colors ${
                            props.activeTab === tab.key
                                ? 'active text-[var(--cursor-text-primary)]'
                                : 'text-[var(--cursor-text-tertiary)] hover:text-[var(--cursor-text-secondary)]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="context-controls relative-wrapper flex items-center gap-0.5 pr-2">
                {/* More menu */}
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => setMenuOpen((open) => !open)}
                    title="More options"
                    aria-label="More options"
                    leadingIcon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                        </svg>
                    }
                />
                <div className={`dropdown-menu${menuOpen ? '' : ' hidden'}`}>
                    <button type="button" className="dropdown-item">Open in Desktop</button>
                    <button type="button" className="dropdown-item">Configure Environment</button>
                    <div className="dropdown-divider" />
                    <button type="button" className="dropdown-item dropdown-item-danger">Archive</button>
                </div>
                {/* Fullscreen */}
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={props.onFullscreen}
                    title="Expand panel"
                    aria-label="Expand panel"
                    leadingIcon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    }
                />
                {/* Close */}
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={props.onClose}
                    title="Toggle app panel"
                    aria-label="Toggle app panel"
                    leadingIcon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M9 3v18" />
                        </svg>
                    }
                />
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
        ? 'context-panel fixed inset-0 z-50 flex flex-col bg-[var(--cursor-bg-card)]'
        : 'context-panel flex h-full w-full flex-col border-l border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)]'

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
