import { useState } from 'react'

export default function SettingsBugbotPage() {
    const [bugbotEnabled, setBugbotEnabled] = useState(true)
    const [autoTriage, setAutoTriage] = useState(false)
    const [captureScreenshots, setCaptureScreenshots] = useState(true)

    return (
        <>
            <div className="settings-header">
                <h1>Bugbot</h1>
                <p>Prepare screenshot capture, triage, and reproduction defaults for Cursor-style automated bug workflows.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Automation</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Enable Bugbot</span>
                            <span className="settings-row-desc">Allow the workspace to prepare automated bug investigation flows.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={bugbotEnabled} onChange={() => setBugbotEnabled((value) => !value)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Auto-triage issues</span>
                            <span className="settings-row-desc">Create a structured reproduction checklist when a bug report arrives.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={autoTriage} onChange={() => setAutoTriage((value) => !value)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Capture screenshots</span>
                            <span className="settings-row-desc">Attach screenshots or desktop thumbnails during a bug reproduction run.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={captureScreenshots} onChange={() => setCaptureScreenshots((value) => !value)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Escalation</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Review destination</span>
                            <span className="settings-row-desc">Where Bugbot should place follow-up artifacts when this flow is enabled.</span>
                        </div>
                        <div className="settings-row-right">
                            <button className="custom-select-btn" type="button">
                                <span>Session timeline</span>
                            </button>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Escalate to human</span>
                            <span className="settings-row-desc">Prompt a maintainer when the bot cannot reproduce or classify the failure.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Default on</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
