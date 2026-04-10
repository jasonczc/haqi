import {
    CursorButton,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
} from '@/components/settings/CursorSettingsPrimitives'

export default function SettingsMembersPage() {
    return (
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Members"
                description="Seat management, team creation, and access policy surface for multi-user HAQI workspaces."
            />

            <CursorSettingsSection title="Workspace Access">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Current account"
                        description="haqi · self-hosted owner"
                        control={<CursorSettingsBadge>Owner</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Team support"
                        description="Shared seats and member invitations will be configured here."
                        control={<CursorButton type="button" variant="outline" size="sm">Create a Team</CursorButton>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>
        </div>
    )
}
