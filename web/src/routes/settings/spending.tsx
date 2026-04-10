import {
    CursorEmptyState,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'

export default function SettingsSpendingPage() {
    return (
        <>
            <CursorSettingsHeader
                title="Spending"
                description="Budget and cost control surface for model usage, cloud runtime, and self-hosted routing."
            />

            <CursorSettingsSection>
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Monthly budget"
                        description="Set a soft limit for cloud agents and provider-backed model usage."
                        control={<CursorTextField defaultValue="$500" />}
                    />
                    <CursorSettingsRow
                        title="Alert threshold"
                        description="Warn when the workspace crosses a percentage of the budget."
                        control={<CursorTextField defaultValue="80%" />}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection>
                <CursorEmptyState
                    title="Detailed cost reporting not wired yet"
                    description="The page now has a stable destination for future model, worker, and infrastructure spend breakdowns."
                />
            </CursorSettingsSection>
        </>
    )
}
