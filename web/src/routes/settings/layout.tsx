import { Link, Outlet, useLocation } from '@tanstack/react-router'

type SettingsNavItem = {
    label: string
    path: string
    icon: React.ReactNode
}

function SettingsNavIcon(props: { name: string }) {
    const icons: Record<string, React.ReactNode> = {
        home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
        settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
        cloud: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>,
        bug: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/></svg>,
        blocks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
        combine: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M11 12h2"/></svg>,
        users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
        chart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
        card: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
        receipt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-3 2V2"/><path d="M8 7h8"/><path d="M8 11h8"/></svg>,
        box: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
        folder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
        list: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
        bot: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>,
        camera: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
        wrench: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/></svg>,
    }

    return icons[props.name] ?? null
}

const primaryItems: SettingsNavItem[] = [
    { label: 'Overview', path: '/settings/overview', icon: <SettingsNavIcon name="home" /> },
    { label: 'Settings', path: '/settings/general', icon: <SettingsNavIcon name="settings" /> },
    { label: 'Cloud Agents', path: '/settings/cloud-agents', icon: <SettingsNavIcon name="cloud" /> },
    { label: 'Bugbot', path: '/settings/bugbot', icon: <SettingsNavIcon name="bug" /> },
]

const secondaryItems: SettingsNavItem[] = [
    { label: 'Plugins', path: '/settings/plugins', icon: <SettingsNavIcon name="blocks" /> },
    { label: 'Integrations', path: '/settings/integrations', icon: <SettingsNavIcon name="combine" /> },
]

const tertiaryItems: SettingsNavItem[] = [
    { label: 'Members', path: '/settings/members', icon: <SettingsNavIcon name="users" /> },
    { label: 'Usage', path: '/settings/usage', icon: <SettingsNavIcon name="chart" /> },
    { label: 'Spending', path: '/settings/spending', icon: <SettingsNavIcon name="card" /> },
    { label: 'Billing & Invoices', path: '/settings/billing', icon: <SettingsNavIcon name="receipt" /> },
]

const extraItems: SettingsNavItem[] = [
    { label: 'Containers', path: '/settings/containers', icon: <SettingsNavIcon name="box" /> },
    { label: 'Workspaces', path: '/settings/workspaces', icon: <SettingsNavIcon name="folder" /> },
    { label: 'Requests', path: '/settings/requests', icon: <SettingsNavIcon name="list" /> },
    { label: 'Automations', path: '/settings/automations', icon: <SettingsNavIcon name="bot" /> },
    { label: 'Checkpoints', path: '/settings/checkpoints', icon: <SettingsNavIcon name="camera" /> },
    { label: 'Advanced', path: '/settings/advanced', icon: <SettingsNavIcon name="wrench" /> },
]

function NavGroup(props: { items: SettingsNavItem[] }) {
    const pathname = useLocation({ select: location => location.pathname })

    return (
        <>
            {props.items.map((item) => {
                const active = pathname === item.path || pathname.startsWith(item.path + '/')
                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`settings-nav-item${active ? ' active' : ''}`}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                )
            })}
        </>
    )
}

export default function SettingsLayout() {
    return (
        <div className="settings-wrapper">
            <aside className="settings-sidebar">
                <div className="settings-sidebar-header">
                    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
                        <path d="M50 0L93.3 25V75L50 100L6.7 75V25L50 0Z" />
                    </svg>
                    <Link to="/sessions">Back to Agents</Link>
                </div>

                <div className="settings-sidebar-profile">
                    <div className="user-profile cursor-settings-user-profile">
                        <div className="avatar">H</div>
                        <div className="user-info">
                            <div className="user-name">haqi</div>
                            <div className="user-plan">Self-hosted</div>
                        </div>
                        <div className="footer-actions">
                            <button className="icon-btn" title="More options" type="button">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <nav className="settings-nav">
                    <NavGroup items={primaryItems} />
                    <div className="dropdown-divider cursor-settings-divider" />
                    <NavGroup items={secondaryItems} />
                    <div className="dropdown-divider cursor-settings-divider" />
                    <NavGroup items={tertiaryItems} />
                    <div className="dropdown-divider cursor-settings-divider" />
                    <NavGroup items={extraItems} />
                </nav>

                <div className="settings-sidebar-footer">
                    <button className="settings-btn-outline" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        Create a Team
                    </button>
                </div>
            </aside>

            <main className="settings-content">
                <div className="settings-container">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
