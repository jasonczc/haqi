export default function SettingsBillingPage() {
    return (
        <>
            <div className="settings-header">
                <h1>Billing &amp; Invoices</h1>
                <p>Billing contacts, invoice history, and payment configuration for teams and hosted runtime plans.</p>
            </div>

            <div className="settings-section">
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Plan</span>
                            <span className="settings-row-desc">Current environment is running in self-hosted mode.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Self-hosted</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Billing contact</span>
                            <span className="settings-row-desc">Set the person or team inbox that should receive invoices.</span>
                        </div>
                        <div className="settings-row-right">
                            <input className="settings-input" placeholder="billing@example.com" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-empty-state">
                    <div className="settings-empty-title">No invoices yet</div>
                    <div className="settings-empty-desc">Invoice history, downloadable PDFs, and payment methods can attach to this page once billing backend support lands.</div>
                </div>
            </div>
        </>
    )
}
