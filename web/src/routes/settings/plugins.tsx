import {
    CursorEmptyState,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
} from '@/components/settings/CursorSettingsPrimitives'

export default function SettingsPluginsPage() {
    return (
        <>
            <CursorSettingsHeader
                title="Plugins"
                description="Review installed capabilities and scaffold where plugin marketplace controls should live."
            />

            <CursorSettingsSection title="Installed">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="GitHub"
                        description="Repository, PR, review, and CI workflows."
                        control={<CursorSettingsBadge tone="success">Enabled</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Google Calendar"
                        description="Availability, scheduling, and daily calendar workflows."
                        control={<CursorSettingsBadge tone="success">Enabled</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Google Drive"
                        description="Docs, Sheets, Slides, and Drive file workflows."
                        control={<CursorSettingsBadge tone="success">Enabled</CursorSettingsBadge>}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Marketplace">
                <CursorEmptyState
                    title="Marketplace UI not wired yet"
                    description="This page now exists in the new settings IA; plugin installation, ordering, and permissions can plug into this surface next."
                />
            </CursorSettingsSection>
        </>
    )
}
