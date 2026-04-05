import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pixel-structural clone of cursor-clone/index.html (Agents home).
 * List copy and layout match the reference HTML; wire navigation via callbacks.
 */
export type CursorAgentsHomeProps = {
    onNewSession: () => void
    onAutomations: () => void
    onDashboard: () => void
    onBugbot: () => void
    onSettings: () => void
    onToggleSidebar: () => void
}

function IconPanelLeft() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>
    )
}

function IconSearch() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
    )
}

function IconSquarePen() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" /></svg>
    )
}

function IconBot() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
    )
}

function IconLayoutDashboard() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
    )
}

function IconBug() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3 3 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" /><path d="M12 20v-9" /></svg>
    )
}

function IconGitBranch(props: { className?: string }) {
    return (
        <svg className={props.className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
    )
}

function IconGitMerge(props: { className?: string }) {
    return (
        <svg className={props.className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></svg>
    )
}

function IconGitPullRequest(props: { className?: string }) {
    return (
        <svg className={props.className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" x2="6" y1="9" y2="21" /></svg>
    )
}

function IconArchive() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
    )
}

function IconChevronDown(props: { className?: string }) {
    return (
        <svg className={props.className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    )
}

function IconImage() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
    )
}

function IconMic() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
    )
}

function IconCheckCircle() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-gray" aria-hidden><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 12 2 2 4-4" /></svg>
    )
}

function IconZap() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-gray" aria-hidden><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>
    )
}

function IconChevronRightSmall() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="small-icon" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
    )
}

function IconMoreHorizontal() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
    )
}

function IconListFilter() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></svg>
    )
}

function navClick(e: React.MouseEvent, fn: () => void) {
    e.preventDefault()
    fn()
}

export function CursorAgentsHome(props: CursorAgentsHomeProps) {
    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [micActive, setMicActive] = useState(true)
    const promptRef = useRef<HTMLDivElement>(null)

    const insertPillText = useCallback((text: string) => {
        const el = promptRef.current
        if (!el) return
        el.textContent = text
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
    }, [])

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node
            const menu = document.getElementById('cursor-agents-user-menu')
            const btn = document.getElementById('cursor-agents-user-profile-btn')
            if (menu && btn && !menu.contains(t) && !btn.contains(t)) {
                setUserMenuOpen(false)
            }
        }
        document.addEventListener('click', onDoc)
        return () => document.removeEventListener('click', onDoc)
    }, [])

    return (
        <div className="cursor-agents-home">
            <div className="app-container">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <button type="button" className="icon-btn" title="Toggle Sidebar" onClick={props.onToggleSidebar}>
                            <IconPanelLeft />
                        </button>
                        <button type="button" className="icon-btn" title="Search (⌘K)">
                            <IconSearch />
                        </button>
                    </div>

                    <nav className="sidebar-nav">
                        <a href="#" className="nav-item" onClick={(e) => navClick(e, props.onNewSession)}>
                            <IconSquarePen />
                            <span>New Agent</span>
                        </a>
                        <a href="#" className="nav-item" onClick={(e) => navClick(e, props.onAutomations)}>
                            <IconBot />
                            <span>Automations</span>
                        </a>
                        <a href="#" className="nav-item" onClick={(e) => navClick(e, props.onDashboard)}>
                            <IconLayoutDashboard />
                            <span>Dashboard</span>
                        </a>
                        <a href="#" className="nav-item" onClick={(e) => navClick(e, props.onBugbot)}>
                            <IconBug />
                            <span>Bugbot</span>
                        </a>
                    </nav>

                    <div className="sidebar-section">
                        <div className="section-title">This Week</div>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitBranch className="history-icon gray" />
                                <span className="history-title">Ctf 相关内容</span>
                            </div>
                            <span className="history-stats">+342 <span style={{ color: '#ef4444' }}>-4</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitBranch className="history-icon gray" />
                                <span className="history-title">代理总结需求</span>
                            </div>
                            <span className="history-stats">+612982 <span style={{ color: '#ef4444' }}>-98</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitMerge className="history-icon purple" />
                                <span className="history-title">Cloud agent features</span>
                            </div>
                            <span className="history-stats">+204</span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitPullRequest className="history-icon green" />
                                <span className="history-title">Haqi 云 agent 功能</span>
                            </div>
                            <span className="history-stats">+13560 <span style={{ color: '#ef4444' }}>-594</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>
                        <a href="#" className="history-sub-item" onClick={(e) => e.preventDefault()}>Haqi 云代理功能</a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitMerge className="history-icon purple" />
                                <span className="history-title">Thankyou-pay 测试体系</span>
                            </div>
                            <span className="history-stats">+120 <span style={{ color: '#ef4444' }}>-19</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitBranch className="history-icon gray" />
                                <span className="history-title">当前测试失败</span>
                            </div>
                            <span className="history-stats">+8 <span style={{ color: '#ef4444' }}>-9</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitBranch className="history-icon gray" />
                                <span className="history-title">Development environment set...</span>
                            </div>
                            <span className="history-stats">+45</span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitMerge className="history-icon purple" />
                                <span className="history-title">当前一致性核对</span>
                            </div>
                            <span className="history-stats">+213 <span style={{ color: '#ef4444' }}>-21</span></span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>

                        <a href="#" className="history-item" onClick={(e) => e.preventDefault()}>
                            <div className="history-item-left">
                                <IconGitBranch className="history-icon gray" />
                                <span className="history-title">Development environment set...</span>
                            </div>
                            <span className="history-stats">+54</span>
                            <button type="button" className="history-archive" title="Archive" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                                <IconArchive />
                            </button>
                        </a>
                        <a href="#" className="history-sub-item" onClick={(e) => e.preventDefault()}>User concurrency impact</a>
                    </div>

                    <div className="sidebar-footer">
                        <div className={`user-dropdown-menu${userMenuOpen ? '' : ' hidden'}`} id="cursor-agents-user-menu">
                            <div className="dropdown-item flex-between">
                                <span>Appearance</span>
                                <div className="color-preview"><span>System</span> <IconChevronRightSmall /></div>
                            </div>
                            <div className="dropdown-item" role="button" tabIndex={0} onClick={() => { setUserMenuOpen(false); props.onDashboard() }} onKeyDown={(e) => { if (e.key === 'Enter') { setUserMenuOpen(false); props.onDashboard() } }}>
                                Cloud Agent Settings
                            </div>
                            <div className="dropdown-item">Download Cursor macOS</div>
                            <div className="dropdown-divider" />
                            <div className="dropdown-item">Cursor Docs</div>
                            <div className="dropdown-item">Contact Us</div>
                            <div className="dropdown-divider" />
                            <div className="dropdown-item">Log Out</div>
                        </div>

                        <div
                            className="user-profile"
                            id="cursor-agents-user-profile-btn"
                            style={{ cursor: 'pointer' }}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setUserMenuOpen((v) => !v) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') setUserMenuOpen((v) => !v) }}
                        >
                            <div className="avatar">a</div>
                            <div className="user-info">
                                <div className="user-name">awdajkd awldja</div>
                                <div className="user-plan">Ultra</div>
                            </div>
                            <div className="footer-actions">
                                <button type="button" className="icon-btn" title="More options"><IconMoreHorizontal /></button>
                                <button type="button" className="icon-btn" title="Filter" onClick={(e) => { e.stopPropagation(); props.onSettings() }}><IconListFilter /></button>
                            </div>
                        </div>
                    </div>
                </aside>

                <main className="main-content">
                    <div className="content-wrapper">
                        <div className="repo-selector">
                            <button type="button" className="repo-btn">
                                Select repository <IconChevronDown />
                            </button>
                        </div>

                        <div className="prompt-container">
                            <div className="prompt-card">
                                <div
                                    ref={promptRef}
                                    className="prompt-input"
                                    contentEditable
                                    role="textbox"
                                    aria-multiline="true"
                                    data-placeholder="Ask Cursor to build, fix bugs, explore"
                                    suppressContentEditableWarning
                                />
                                <div className="prompt-footer">
                                    <div className="prompt-tools">
                                        <button type="button" className="tool-chip">
                                            Codex 5.3 High <IconChevronDown />
                                        </button>
                                        <button type="button" className="tool-chip">
                                            MCPs <IconChevronDown />
                                        </button>
                                    </div>
                                    <div className="prompt-actions">
                                        <button type="button" className="action-btn" title="Add image">
                                            <IconImage />
                                        </button>
                                        <button
                                            type="button"
                                            className={`action-btn${micActive ? ' active' : ''}`}
                                            title="Voice input"
                                            onClick={() => setMicActive((v) => !v)}
                                        >
                                            <IconMic />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="action-pills">
                            <button type="button" className="pill-btn" onClick={() => insertPillText('Run security audit')}>Run security audit</button>
                            <button type="button" className="pill-btn" onClick={() => insertPillText('Improve AGENTS.md')}>Improve AGENTS.md</button>
                            <button type="button" className="pill-btn" onClick={() => insertPillText('Solve a TODO')}>Solve a TODO</button>
                        </div>

                        <div className="agent-list">
                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">16 files</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+342</span>
                                            <span className="diff-sub">-4</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-draft">
                                        <IconGitBranch /> Draft
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">Ctf 相关内容</div>
                                    <div className="agent-subtitle">
                                        <IconGitBranch className="icon-gray" />
                                        <span>Composer 2</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>haqi</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>3d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">340 ...</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+612982</span>
                                            <span className="diff-sub">-98</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-draft">
                                        <IconGitBranch /> Draft
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">代理总结需求</div>
                                    <div className="agent-subtitle">
                                        <IconGitBranch className="icon-gray" />
                                        <span>Opus 4.6 High</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>haqi</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">1 file</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+204</span>
                                            <span className="diff-sub">-0</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-merged">
                                        <IconGitMerge /> Merged
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">Cloud agent features</div>
                                    <div className="agent-subtitle">
                                        <IconGitMerge className="icon-purple" />
                                        <span>Composer 2</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>haqi</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">105 ...</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+13560</span>
                                            <span className="diff-sub">-594</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-open">
                                        <IconGitPullRequest /> Open
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">Haqi 云 agent 功能</div>
                                    <div className="agent-subtitle">
                                        <IconGitPullRequest className="icon-green" />
                                        <IconZap />
                                        <span>GPT-5.4 High</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>haqi</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row child-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <IconGitBranch />
                                    <span>Branch</span>
                                    <IconChevronDown className="chevron-sm" />
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">Haqi 云代理功能</div>
                                    <div className="agent-subtitle">
                                        <IconCheckCircle />
                                        <span>Composer 2</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>haqi</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">1 file</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+120</span>
                                            <span className="diff-sub">-19</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-merged">
                                        <IconGitMerge /> Merged
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">Thankyou-pay 测试体系</div>
                                    <div className="agent-subtitle">
                                        <IconGitMerge className="icon-purple" />
                                        <span>GPT-5.4 High Fast</span>
                                        <span className="sep" />
                                        <span>thankyou-pay</span>
                                        <span className="sep" />
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>

                            <a href="#" className="agent-row" onClick={(e) => e.preventDefault()}>
                                <div className="metadata-card">
                                    <div className="meta-row">
                                        <span className="meta-file-count">12 files</span>
                                        <div className="meta-diff">
                                            <span className="diff-add">+8</span>
                                            <span className="diff-sub">-9</span>
                                        </div>
                                    </div>
                                    <div className="badge badge-draft">
                                        <IconGitBranch /> Draft
                                    </div>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-title">当前测试失败</div>
                                    <div className="agent-subtitle">
                                        <IconGitBranch className="icon-gray" />
                                        <span>Codex 5.3 High</span>
                                        <span className="sep" />
                                        <span>haqi</span>
                                        <span className="sep" />
                                        <span>4d</span>
                                    </div>
                                </div>
                            </a>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
