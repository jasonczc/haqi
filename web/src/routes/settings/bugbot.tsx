import { useState } from 'react'
import {
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorSelectButton,
    CursorToggle,
} from '@/components/settings/CursorSettingsPrimitives'

export default function SettingsBugbotPage() {
    const [bugbotEnabled, setBugbotEnabled] = useState(true)
    const [autoTriage, setAutoTriage] = useState(false)
    const [captureScreenshots, setCaptureScreenshots] = useState(true)

    return (
        <>
            <CursorSettingsHeader
                title="Bugbot"
                description="Prepare screenshot capture, triage, and reproduction defaults for Cursor-style automated bug workflows."
            />

            <CursorSettingsSection title="Automation">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Enable Bugbot"
                        description="Allow the workspace to prepare automated bug investigation flows."
                        control={<CursorToggle checked={bugbotEnabled} onCheckedChange={setBugbotEnabled} />}
                    />
                    <CursorSettingsRow
                        title="Auto-triage issues"
                        description="Create a structured reproduction checklist when a bug report arrives."
                        control={<CursorToggle checked={autoTriage} onCheckedChange={setAutoTriage} />}
                    />
                    <CursorSettingsRow
                        title="Capture screenshots"
                        description="Attach screenshots or desktop thumbnails during a bug reproduction run."
                        control={<CursorToggle checked={captureScreenshots} onCheckedChange={setCaptureScreenshots} />}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Escalation">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Review destination"
                        description="Where Bugbot should place follow-up artifacts when this flow is enabled."
                        control={<CursorSelectButton type="button">Session timeline</CursorSelectButton>}
                    />
                    <CursorSettingsRow
                        title="Escalate to human"
                        description="Prompt a maintainer when the bot cannot reproduce or classify the failure."
                        control={<CursorSettingsBadge>Default on</CursorSettingsBadge>}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>
        </>
    )
}
