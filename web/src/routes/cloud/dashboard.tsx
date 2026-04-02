import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

// ── Activity Heatmap ─────────────────────────────────────────────────

function ActivityHeatmap(props: { data: Map<string, number> }) {
    // Generate 52 weeks x 7 days grid
    const weeks = useMemo(() => {
        const result: Array<Array<{ date: string; count: number }>> = []
        const today = new Date()
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 364) // ~52 weeks back
        // Align to Monday
        while (startDate.getDay() !== 1) {
            startDate.setDate(startDate.getDate() - 1)
        }

        let currentWeek: Array<{ date: string; count: number }> = []
        const cursor = new Date(startDate)

        while (cursor <= today) {
            const dateStr = cursor.toISOString().slice(0, 10)
            const count = props.data.get(dateStr) ?? 0
            currentWeek.push({ date: dateStr, count })

            if (currentWeek.length === 7) {
                result.push(currentWeek)
                currentWeek = []
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        if (currentWeek.length > 0) {
            result.push(currentWeek)
        }
        return result
    }, [props.data])

    const maxCount = useMemo(() => {
        let max = 0
        for (const count of props.data.values()) {
            if (count > max) max = count
        }
        return max || 1
    }, [props.data])

    function getColor(count: number): string {
        if (count === 0) return 'var(--app-subtle-bg)'
        const ratio = count / maxCount
        if (ratio < 0.25) return 'rgba(34, 197, 94, 0.25)'
        if (ratio < 0.5) return 'rgba(34, 197, 94, 0.45)'
        if (ratio < 0.75) return 'rgba(34, 197, 94, 0.65)'
        return 'rgba(34, 197, 94, 0.9)'
    }

    return (
        <div className="overflow-x-auto">
            <div className="flex gap-[2px]">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[2px]">
                        {week.map((day) => (
                            <div
                                key={day.date}
                                className="h-[11px] w-[11px] rounded-[2px]"
                                style={{ background: getColor(day.count) }}
                                title={`${day.date}: ${day.count} edits`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Connection Card ──────────────────────────────────────────────────

function ConnectionCard(props: {
    icon: string
    name: string
    description: string
    connected: boolean
    detail?: string
    onAction: () => void
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] px-4 py-3">
            <div className="flex items-center gap-3">
                <span className="text-xl">{props.icon}</span>
                <div>
                    <div className="text-[13px] font-semibold text-[var(--app-fg)]">{props.name}</div>
                    <div className="text-[12px] text-[var(--app-hint)]">{props.description}</div>
                    {props.detail && (
                        <div className="mt-0.5 text-[11px] text-[var(--app-hint)]">{props.detail}</div>
                    )}
                </div>
            </div>
            <button
                type="button"
                onClick={props.onAction}
                className={`rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors ${
                    props.connected
                        ? 'border border-[var(--app-border)] text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                        : 'border border-[var(--app-border)] text-[var(--app-badge-info-text)] hover:bg-[var(--app-badge-info-bg)]'
                }`}
            >
                {props.connected ? 'Manage' : 'Connect ↗'}
            </button>
        </div>
    )
}

// ── Main Dashboard ───────────────────────────────────────────────────

export default function CloudDashboardPage() {
    const { api } = useAppContext()

    // Fetch sessions to compute activity data
    const sessionsQuery = useQuery({
        queryKey: queryKeys.sessions,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getSessions()
        },
        staleTime: 60_000
    })

    // Fetch secrets to check GitHub token status
    const secretsQuery = useQuery({
        queryKey: queryKeys.cloudSecrets,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudSecrets()
        },
        staleTime: 60_000
    })

    // Compute activity heatmap data from session activity
    const activityData = useMemo(() => {
        const map = new Map<string, number>()
        const sessions = sessionsQuery.data?.sessions ?? []
        for (const s of sessions) {
            const date = new Date(s.updatedAt).toISOString().slice(0, 10)
            map.set(date, (map.get(date) ?? 0) + 1)
        }
        return map
    }, [sessionsQuery.data])

    const totalSessions = sessionsQuery.data?.sessions?.length ?? 0
    const hasGitHubToken = Boolean(
        secretsQuery.data?.secrets?.some(s => s.name === 'GITHUB_TOKEN' || s.name === 'GH_TOKEN')
    )

    // Find most active day
    const mostActiveDay = useMemo(() => {
        let maxDate = ''
        let maxCount = 0
        for (const [date, count] of activityData) {
            if (count > maxCount) {
                maxCount = count
                maxDate = date
            }
        }
        return maxDate ? new Date(maxDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    }, [activityData])

    return (
        <div className="mx-auto max-w-4xl px-6 py-8">
            {/* Activity section */}
            <div className="rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-[13px] text-[var(--app-hint)]">
                        AI Sessions
                    </div>
                    <div className="flex gap-1">
                        {['All', 'Cloud', 'Local'].map(tab => (
                            <button
                                key={tab}
                                type="button"
                                className="rounded px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="text-3xl font-bold text-[var(--app-fg)] mb-4">
                    {totalSessions.toLocaleString()}
                </div>

                <ActivityHeatmap data={activityData} />

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-4 gap-4">
                    <div>
                        <div className="text-[11px] text-[var(--app-hint)]">Most Active Month</div>
                        <div className="text-[13px] font-semibold text-[var(--app-fg)]">
                            {new Date().toLocaleDateString('en-US', { month: 'long' })}
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] text-[var(--app-hint)]">Most Active Day</div>
                        <div className="text-[13px] font-semibold text-[var(--app-fg)]">{mostActiveDay}</div>
                    </div>
                    <div>
                        <div className="text-[11px] text-[var(--app-hint)]">Cloud Sessions</div>
                        <div className="text-[13px] font-semibold text-[var(--app-fg)]">
                            {sessionsQuery.data?.sessions?.filter(
                                (s: any) => s.metadata?.executionBackend === 'cloud-self-hosted' || s.metadata?.executionBackend === 'cloud-managed'
                            ).length ?? 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] text-[var(--app-hint)]">Active Today</div>
                        <div className="text-[13px] font-semibold text-[var(--app-fg)]">
                            {sessionsQuery.data?.sessions?.filter((s: any) => s.active).length ?? 0}
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-3 flex items-center gap-1 text-[10px] text-[var(--app-hint)]">
                    <span>Fewer</span>
                    {[0.1, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                        <div
                            key={i}
                            className="h-[10px] w-[10px] rounded-[2px]"
                            style={{
                                background: ratio === 0.1
                                    ? 'var(--app-subtle-bg)'
                                    : `rgba(34, 197, 94, ${ratio * 0.9})`
                            }}
                        />
                    ))}
                    <span>More</span>
                </div>
            </div>

            {/* Source Control */}
            <div className="mb-6">
                <h2 className="text-[13px] font-semibold text-[var(--app-hint)] mb-3">Source Control</h2>
                <div className="space-y-2">
                    <ConnectionCard
                        icon="🐙"
                        name="GitHub"
                        description={hasGitHubToken
                            ? 'Connected via GITHUB_TOKEN secret'
                            : 'Connect GitHub for Cloud Agents and repo access'
                        }
                        detail={hasGitHubToken ? 'Token configured in Cloud Secrets' : undefined}
                        connected={hasGitHubToken}
                        onAction={() => {
                            if (hasGitHubToken) {
                                window.location.href = '/cloud/secrets'
                            } else {
                                window.location.href = '/cloud/secrets'
                            }
                        }}
                    />
                    <ConnectionCard
                        icon="🦊"
                        name="GitLab"
                        description="Connect GitLab for Cloud Agents and enhanced codebase context"
                        connected={false}
                        onAction={() => {}}
                    />
                </div>
            </div>

            {/* Integrations */}
            <div className="mb-6">
                <h2 className="text-[13px] font-semibold text-[var(--app-hint)] mb-3">Integrations</h2>
                <div className="space-y-2">
                    <ConnectionCard
                        icon="💬"
                        name="Slack"
                        description="Work with Cloud Agents from Slack"
                        connected={false}
                        onAction={() => {}}
                    />
                    <ConnectionCard
                        icon="📋"
                        name="Linear"
                        description="Create agents from Linear issues and sync progress"
                        connected={false}
                        onAction={() => {}}
                    />
                    <ConnectionCard
                        icon="📱"
                        name="Telegram"
                        description="Control sessions from Telegram"
                        connected={true}
                        detail="Connected via Telegram Mini App"
                        onAction={() => {
                            window.location.href = '/settings'
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
