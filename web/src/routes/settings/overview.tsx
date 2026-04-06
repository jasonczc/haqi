import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

function ActivityHeatmap(props: { data: Map<string, number> }) {
    const weeks = useMemo(() => {
        const result: Array<Array<{ date: string; count: number }>> = []
        const today = new Date()
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 364)
        while (startDate.getDay() !== 1) {
            startDate.setDate(startDate.getDate() - 1)
        }

        let currentWeek: Array<{ date: string; count: number }> = []
        const cursor = new Date(startDate)
        while (cursor <= today) {
            const dateStr = cursor.toISOString().slice(0, 10)
            currentWeek.push({ date: dateStr, count: props.data.get(dateStr) ?? 0 })
            if (currentWeek.length === 7) {
                result.push(currentWeek)
                currentWeek = []
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        if (currentWeek.length > 0) result.push(currentWeek)
        return result
    }, [props.data])

    const maxCount = useMemo(() => Math.max(...props.data.values(), 1), [props.data])
    const colorFor = (count: number) => {
        if (count <= 0) return 'var(--cursor-bg-quaternary)'
        const ratio = count / maxCount
        if (ratio < 0.25) return 'var(--cursor-success-bg-quiet)'
        if (ratio < 0.5) return 'var(--cursor-success-bg)'
        if (ratio < 0.75) return 'var(--cursor-success-secondary)'
        return 'var(--cursor-success)'
    }

    return (
        <div className="heatmap-wrapper">
            <div className="heatmap-container">
                <div className="heatmap-grid-area">
                    <div className="heatmap-grid heatmap-grid-7">
                        {weeks.flatMap((week) => week).map((day) => (
                            <div
                                key={day.date}
                                className="heatmap-cell"
                                style={{ backgroundColor: colorFor(day.count) }}
                                title={`${day.date}: ${day.count} sessions`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function SettingsOverviewPage() {
    const { api } = useAppContext()
    const sessionsQuery = useQuery({
        queryKey: queryKeys.sessions,
        enabled: Boolean(api),
        staleTime: 60_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getSessions()
        }
    })

    const sessions = sessionsQuery.data?.sessions ?? []
    const activityData = useMemo(() => {
        const map = new Map<string, number>()
        for (const session of sessions) {
            const date = new Date(session.updatedAt).toISOString().slice(0, 10)
            map.set(date, (map.get(date) ?? 0) + 1)
        }
        return map
    }, [sessions])

    const cloudSessions = sessions.filter((session: any) => session.metadata?.executionBackend?.startsWith('cloud')).length
    const activeToday = sessions.filter((session: any) => Boolean(session.active)).length
    const mostActiveDay = [...activityData.entries()].sort((a, b) => b[1] - a[1])[0]
    const mostActiveMonth = useMemo(() => {
        const counts = new Map<string, number>()
        for (const session of sessions) {
            const key = new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    }, [sessions])

    return (
        <>
            <div className="settings-header">
                <h1>Overview</h1>
                <p>Track activity, session volume, and the current cloud usage footprint.</p>
            </div>

            <div className="settings-section">
                <div className="settings-card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div className="settings-section-title" style={{ marginBottom: 0 }}>AI Line Edits in the last year</div>
                        <div className="overview-tabs">
                            <button type="button" className="overview-tab-btn active">All</button>
                            <button type="button" className="overview-tab-btn">Cloud</button>
                            <button type="button" className="overview-tab-btn">Agent</button>
                        </div>
                    </div>

                    <div style={{ fontSize: 40, fontWeight: 600, marginBottom: 8, color: 'var(--cursor-text-primary)' }}>
                        {sessions.length.toLocaleString()}
                    </div>

                    <ActivityHeatmap data={activityData} />

                    <div className="stat-segments">
                        <div className="stat-box">
                            <div className="stat-label">Most Active Month</div>
                            <div className="stat-value">{mostActiveMonth}</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-label">Most Active Day</div>
                            <div className="stat-value">{mostActiveDay ? mostActiveDay[0] : '—'}</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-label">Cloud Sessions</div>
                            <div className="stat-value">{cloudSessions}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Quick Links</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Source Control</span>
                            <span className="settings-row-desc">Connect GitHub or GitLab and control where PRs land.</span>
                        </div>
                        <div className="settings-row-right">
                            <a className="settings-link" href="/settings/integrations">Open Integrations</a>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Cloud Agents</span>
                            <span className="settings-row-desc">Manage environments, workers, secrets, defaults, and API keys.</span>
                        </div>
                        <div className="settings-row-right">
                            <a className="settings-link" href="/settings/cloud-agents">Open Cloud Agents</a>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Active Today</span>
                            <span className="settings-row-desc">Current sessions actively running or waiting on responses.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{activeToday}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
