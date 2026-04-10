import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import {
    CursorCollapsibleSection,
    CursorEmptyState,
    CursorSettingsBadge,
    CursorSettingsHeader,
    CursorSettingsSection,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudSpawnRequest } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function PhaseBadge({ phase }: { phase: string }) {
    const toneMap: Record<string, 'default' | 'success' | 'danger' | 'accent'> = {
        succeeded: 'success',
        failed: 'danger',
        canceled: 'default',
        pending: 'accent',
        scheduling: 'accent',
        provisioning: 'accent',
        starting: 'accent',
    }
    return (
        <CursorSettingsBadge tone={toneMap[phase] ?? 'default'} className="rounded-full">
            {phase}
        </CursorSettingsBadge>
    )
}

export default function CloudRequestsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const [isExpanded, setIsExpanded] = useState(true)

    const requestsQuery = useQuery({
        queryKey: queryKeys.cloudRequests,
        enabled: Boolean(api),
        refetchInterval: 5_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudRequests()
        }
    })

    if (requestsQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (requestsQuery.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load requests</div>
    }

    const requests = (requestsQuery.data?.requests ?? []) as CloudSpawnRequest[]

    return (
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Requests"
                description="Queued, active, and completed cloud spawn requests routed through available workers."
            />
            <CursorSettingsSection>
                <CursorCollapsibleSection
                    title="Requests"
                    description={`${requests.length} spawn request${requests.length !== 1 ? 's' : ''}`}
                    isExpanded={isExpanded}
                    onToggle={() => setIsExpanded(!isExpanded)}
                >
                    {requests.length === 0 ? (
                        <div className="px-4 py-6">
                            <CursorEmptyState
                                title={t('cloud.requests.empty')}
                                description="No cloud spawn requests are currently tracked."
                            />
                        </div>
                    ) : (
                        <div>
                            {requests.map((request) => (
                                <Link
                                    key={request.id}
                                    to="/settings/requests/$requestId"
                                    params={{ requestId: request.id }}
                                    className="flex items-start justify-between gap-3 border-b border-[var(--border-tertiary)] px-4 py-4 text-left transition-colors hover:bg-[var(--bg-quaternary)] last:border-b-0"
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <div className="flex items-center gap-2">
                                            <PhaseBadge phase={request.phase} />
                                            <span className="font-[var(--font-mono)] text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">{request.id}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                            {request.selectedMachineId ? (
                                                <span>
                                                    <span className="font-medium text-[var(--text-primary)]">Worker</span>{' '}
                                                    {request.selectedMachineId}
                                                </span>
                                            ) : null}
                                            {request.request.agent ? (
                                                <span>
                                                    <span className="font-medium text-[var(--text-primary)]">Agent</span>{' '}
                                                    {request.request.agent}
                                                </span>
                                            ) : null}
                                            <span>{formatDate(request.createdAt)}</span>
                                        </div>
                                    </div>
                                    {request.error ? (
                                        <CursorSettingsBadge tone="danger" className="max-w-xs shrink-0 truncate rounded-md">
                                            {request.error.message ?? request.error.code}
                                        </CursorSettingsBadge>
                                    ) : null}
                                </Link>
                            ))}
                        </div>
                    )}
                </CursorCollapsibleSection>
            </CursorSettingsSection>
        </div>
    )
}
