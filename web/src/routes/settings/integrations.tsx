import { useQuery } from '@tanstack/react-query'
import {
    CursorEmptyState,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

export default function SettingsIntegrationsPage() {
    const { api } = useAppContext()

    const machinesQuery = useQuery({
        queryKey: queryKeys.machines,
        enabled: Boolean(api),
        staleTime: 30_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getMachines()
        }
    })

    const machineCount = machinesQuery.data?.machines.length ?? 0

    return (
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Integrations"
                description="Connection surface for code hosts, notifications, and local machines that back remote sessions."
            />

            <CursorSettingsSection title="Code Hosts">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="GitHub"
                        description="Pull requests, code review, and remote repo context."
                        control={<CursorSettingsBadge>Planned</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="GitLab"
                        description="Repository routing and merge-request workflows."
                        control={<CursorSettingsBadge>Planned</CursorSettingsBadge>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Notifications">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Slack"
                        description="Post cloud-agent status and review summaries into shared channels."
                        control={<CursorSettingsBadge>Coming soon</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Telegram"
                        description="Approve, inspect, and manage sessions from mobile notifications."
                        control={<CursorSettingsBadge tone="accent">Built-in</CursorSettingsBadge>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Connected Machines">
                {machineCount === 0 ? (
                    <CursorEmptyState
                        title="No machines connected"
                        description="Connect at least one machine to expose desktop, terminal, and self-hosted worker integrations."
                    />
                ) : (
                    <CursorSettingsCard>
                        <CursorSettingsRow
                            title="Available runtime targets"
                            description="Machines currently visible to the hub for sessions and worker routing."
                            control={<CursorSettingsBadge>{machineCount}</CursorSettingsBadge>}
                        />
                    </CursorSettingsCard>
                )}
            </CursorSettingsSection>
        </div>
    )
}
