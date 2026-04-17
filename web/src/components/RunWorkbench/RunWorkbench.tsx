import { useState, useMemo, useCallback, useEffect } from 'react'
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
    maximized: boolean
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
        <div
            className="context-header flex items-center justify-between"
            style={{
                padding: '8px 12px 8px 16px',
                borderBottom: '1px solid var(--border-tertiary)',
            }}
        >
            <div className="context-tabs flex" style={{ gap: 'var(--context-tab-gap)' }}>
                {tabs.filter(t => t.available).map(tab => {
                    const isActive = props.activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            className="context-tab"
                            onClick={() => props.onTabChange(tab.key)}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '4px 0',
                                fontSize: 'var(--font-size-base)',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                                cursor: 'pointer',
                            }}
                        >
                            {tab.label}
                        </button>
                    )
                })}
            </div>
            <div className="context-controls relative-wrapper flex items-center gap-1">
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
                {/* Maximize / Restore */}
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={props.onFullscreen}
                    title={props.maximized ? 'Restore' : 'Expand panel'}
                    aria-label={props.maximized ? 'Restore' : 'Expand panel'}
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
    const [maximized, setMaximized] = useState(false)

    // Validate active tab
    const effectiveTab = useMemo(() => {
        if (activeTab === 'desktop' && !hasDesktop) return defaultTab
        if (activeTab === 'terminal' && !hasTerminal) return defaultTab
        if (activeTab === 'setup' && !isSetupMode) return 'git'
        if (activeTab === 'plan' && isSetupMode) return 'setup'
        return activeTab
    }, [activeTab, hasDesktop, hasTerminal, isSetupMode, defaultTab])

    const handleFullscreen = useCallback(() => setMaximized(v => !v), [])

    useEffect(() => {
        if (!maximized) return
        document.body.classList.add('layout-maximized')
        return () => document.body.classList.remove('layout-maximized')
    }, [maximized])

    return (
        <aside
            className="context-panel flex flex-col flex-shrink-0 z-10 h-full"
            style={{
                width: maximized ? '100vw' : 'var(--context-panel-width)',
                background: 'var(--editor)',
                borderLeft: maximized ? 'none' : '1px solid var(--border-tertiary)',
                transition: 'width 0.2s',
            }}
        >
            <WorkbenchTabBar
                activeTab={effectiveTab}
                onTabChange={setActiveTab}
                isSetupMode={isSetupMode}
                hasDesktop={hasDesktop}
                hasTerminal={hasTerminal}
                maximized={maximized}
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
        </aside>
    )
}
