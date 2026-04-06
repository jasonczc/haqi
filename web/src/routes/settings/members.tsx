export default function SettingsMembersPage() {
    return (
        <>
            <div className="settings-header">
                <h1>Members</h1>
                <p>Seat management, team creation, and access policy surface for multi-user HAQI workspaces.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Workspace Access</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Current account</span>
                            <span className="settings-row-desc">haqi · self-hosted owner</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Owner</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Team support</span>
                            <span className="settings-row-desc">Shared seats and member invitations will be configured here.</span>
                        </div>
                        <div className="settings-row-right">
                            <button className="settings-btn-outline" type="button">Create a Team</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
