export default function SettingsPluginsPage() {
    return (
        <>
            <div className="settings-header">
                <h1>Plugins</h1>
                <p>Review installed capabilities and scaffold where plugin marketplace controls should live.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Installed</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">GitHub</span>
                            <span className="settings-row-desc">Repository, PR, review, and CI workflows.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Enabled</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Google Calendar</span>
                            <span className="settings-row-desc">Availability, scheduling, and daily calendar workflows.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Enabled</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Google Drive</span>
                            <span className="settings-row-desc">Docs, Sheets, Slides, and Drive file workflows.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Enabled</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Marketplace</div>
                <div className="settings-empty-state">
                    <div className="settings-empty-title">Marketplace UI not wired yet</div>
                    <div className="settings-empty-desc">This page now exists in the new settings IA; plugin installation, ordering, and permissions can plug into this surface next.</div>
                </div>
            </div>
        </>
    )
}
