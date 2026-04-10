import {
    CursorEmptyState,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'

export default function SettingsBillingPage() {
    return (
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Billing & Invoices"
                description="Billing contacts, invoice history, and payment configuration for teams and hosted runtime plans."
            />

            <CursorSettingsSection>
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Plan"
                        description="Current environment is running in self-hosted mode."
                        control={<CursorSettingsBadge>Self-hosted</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Billing contact"
                        description="Set the person or team inbox that should receive invoices."
                        control={<div className="w-[240px]"><CursorTextField placeholder="billing@example.com" /></div>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection>
                <CursorEmptyState
                    title="No invoices yet"
                    description="Invoice history, downloadable PDFs, and payment methods can attach to this page once billing backend support lands."
                />
            </CursorSettingsSection>
        </div>
    )
}
