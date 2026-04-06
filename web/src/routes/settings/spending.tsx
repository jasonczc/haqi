export default function SettingsSpendingPage() {
    return (
        <>
            <div className="settings-header">
                <h1>Spending</h1>
                <p>Budget and cost control surface for model usage, cloud runtime, and self-hosted routing.</p>
            </div>

            <div className="settings-section">
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Monthly budget</span>
                            <span className="settings-row-desc">Set a soft limit for cloud agents and provider-backed model usage.</span>
                        </div>
                        <div className="settings-row-right">
                            <input className="settings-input" defaultValue="$500" />
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Alert threshold</span>
                            <span className="settings-row-desc">Warn when the workspace crosses a percentage of the budget.</span>
                        </div>
                        <div className="settings-row-right">
                            <input className="settings-input" defaultValue="80%" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-empty-state">
                    <div className="settings-empty-title">Detailed cost reporting not wired yet</div>
                    <div className="settings-empty-desc">The page now has a stable destination for future model, worker, and infrastructure spend breakdowns.</div>
                </div>
            </div>
        </>
    )
}
