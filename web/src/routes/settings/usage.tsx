import { useEffect, useMemo, useState } from 'react'
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
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Usage"
                description="High-level activity metrics for sessions, active runs, and recent throughput."
            />

            <CursorSettingsSection>
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Total sessions"
                        description="All visible sessions in the current namespace."
                        control={<CursorSettingsBadge>{sessions.length}</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Active now"
                        description="Sessions currently marked active."
                        control={<CursorSettingsBadge>{activeCount}</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Thinking now"
                        description="Sessions still waiting on agent output."
                        control={<CursorSettingsBadge>{thinkingCount}</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Updated in last 7 days"
                        description="Recent session churn; good seed for future graphs."
                        control={<CursorSettingsBadge>{thisWeekCount}</CursorSettingsBadge>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Provider Token Usage">
                {usageLoading ? (
                    <CursorEmptyState title="Loading usage overview…" description="Fetching provider-level token usage and event counts." />
                ) : usageError ? (
                    <CursorEmptyState title="Usage unavailable" description={usageError} />
                ) : usageOverview ? (
                    <CursorSettingsCard>
                        {[usageOverview.claude, usageOverview.codex].map((provider) => (
                            <CursorSettingsRow
                                key={provider.provider}
                                title={provider.provider === 'claude' ? 'Claude' : 'Codex'}
                                description={provider.available
                                    ? `${provider.eventCount} events · ${provider.filesScanned} files scanned · last 30d ${provider.last30Days.totalTokens.toLocaleString()} tokens`
                                    : 'Unavailable'}
                                control={(
                                    <CursorSettingsBadge>
                                        {provider.available ? provider.allTime.totalTokens.toLocaleString() : '—'}
                                    </CursorSettingsBadge>
                                )}
                            />
                        ))}
                    </CursorSettingsCard>
                ) : null}
            </CursorSettingsSection>
        </div>
    )
}
