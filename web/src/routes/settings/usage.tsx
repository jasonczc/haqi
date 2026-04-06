import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import type { UsageOverview } from '@/types/api'

export default function SettingsUsagePage() {
    const { api } = useAppContext()
    const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null)
    const [usageLoading, setUsageLoading] = useState(false)
    const [usageError, setUsageError] = useState<string | null>(null)
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
    const activeCount = sessions.filter((session) => session.active).length
    const thinkingCount = sessions.filter((session) => session.thinking).length
    const thisWeekCount = useMemo(() => {
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
        return sessions.filter((session) => session.updatedAt >= weekAgo).length
    }, [sessions])

    useEffect(() => {
        if (!api) return
        let cancelled = false
        setUsageLoading(true)
        setUsageError(null)
        ;(async () => {
            try {
                const result = await api.getUsageOverview()
                if (cancelled) return
                if (!result.success || !result.overview) {
                    setUsageOverview(null)
                    setUsageError(result.error ?? 'Usage overview unavailable')
                    return
                }
                setUsageOverview(result.overview)
            } catch (error) {
                if (!cancelled) {
                    setUsageError(error instanceof Error ? error.message : 'Usage overview unavailable')
                    setUsageOverview(null)
                }
            } finally {
                if (!cancelled) {
                    setUsageLoading(false)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [api])

    return (
        <>
            <div className="settings-header">
                <h1>Usage</h1>
                <p>High-level activity metrics for sessions, active runs, and recent throughput.</p>
            </div>

            <div className="settings-section">
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Total sessions</span>
                            <span className="settings-row-desc">All visible sessions in the current namespace.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{sessions.length}</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Active now</span>
                            <span className="settings-row-desc">Sessions currently marked active.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{activeCount}</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Thinking now</span>
                            <span className="settings-row-desc">Sessions still waiting on agent output.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{thinkingCount}</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Updated in last 7 days</span>
                            <span className="settings-row-desc">Recent session churn; good seed for future graphs.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{thisWeekCount}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Provider Token Usage</div>
                {usageLoading ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">Loading usage overview…</div>
                    </div>
                ) : usageError ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">Usage unavailable</div>
                        <div className="settings-empty-desc">{usageError}</div>
                    </div>
                ) : usageOverview ? (
                    <div className="settings-card">
                        {[usageOverview.claude, usageOverview.codex].map((provider) => (
                            <div key={provider.provider} className="settings-row">
                                <div className="settings-row-left">
                                    <span className="settings-row-title">{provider.provider === 'claude' ? 'Claude' : 'Codex'}</span>
                                    <span className="settings-row-desc">
                                        {provider.available
                                            ? `${provider.eventCount} events · ${provider.filesScanned} files scanned · last 30d ${provider.last30Days.totalTokens.toLocaleString()} tokens`
                                            : 'Unavailable'}
                                    </span>
                                </div>
                                <div className="settings-row-right">
                                    <span className="settings-badge">
                                        {provider.available ? provider.allTime.totalTokens.toLocaleString() : '—'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </>
    )
}
