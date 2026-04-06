import { useQuery } from '@tanstack/react-query'
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
        <>
            <div className="settings-header">
                <h1>Integrations</h1>
                <p>Connection surface for code hosts, notifications, and local machines that back remote sessions.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Code Hosts</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">GitHub</span>
                            <span className="settings-row-desc">Pull requests, code review, and remote repo context.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Planned</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">GitLab</span>
                            <span className="settings-row-desc">Repository routing and merge-request workflows.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Planned</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Notifications</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Slack</span>
                            <span className="settings-row-desc">Post cloud-agent status and review summaries into shared channels.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Coming soon</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Telegram</span>
                            <span className="settings-row-desc">Approve, inspect, and manage sessions from mobile notifications.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">Built-in</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Connected Machines</div>
                {machineCount === 0 ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">No machines connected</div>
                        <div className="settings-empty-desc">Connect at least one machine to expose desktop, terminal, and self-hosted worker integrations.</div>
                    </div>
                ) : (
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-row-left">
                                <span className="settings-row-title">Available runtime targets</span>
                                <span className="settings-row-desc">Machines currently visible to the hub for sessions and worker routing.</span>
                            </div>
                            <div className="settings-row-right">
                                <span className="settings-badge">{machineCount}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
