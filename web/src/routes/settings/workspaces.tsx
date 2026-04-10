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
import type { CloudWorkspace } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
    const toneMap: Record<string, 'default' | 'success' | 'danger' | 'accent'> = {
        ready: 'success',
        provisioning: 'accent',
        starting: 'accent',
        active: 'success',
        stopped: 'default',
        failed: 'danger',
    }
    return (
        <CursorSettingsBadge tone={toneMap[status] ?? 'default'} className="rounded-full">
            {status}
        </CursorSettingsBadge>
    )
}

export default function CloudWorkspacesPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const [isExpanded, setIsExpanded] = useState(true)

    const workspacesQuery = useQuery({
        queryKey: queryKeys.cloudWorkspaces,
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkspaces()
        }
    })

    if (workspacesQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (workspacesQuery.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load workspaces</div>
    }

    const workspaces = (workspacesQuery.data?.workspaces ?? []) as CloudWorkspace[]

    return (
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Workspaces"
                description="Tracked cloud workspaces, including persistent snapshots, worker assignments, and lifecycle state."
            />

            <CursorSettingsSection>
                <CursorCollapsibleSection
                    title="Workspaces"
                    description={`${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''} tracked`}
                    isExpanded={isExpanded}
                    onToggle={() => setIsExpanded(!isExpanded)}
                >
                    {workspaces.length === 0 ? (
                        <div className="px-4 py-6">
                            <CursorEmptyState
                                title={t('cloud.workspaces.empty')}
                                description="No cloud workspaces are currently tracked for this namespace."
                            />
                        </div>
                    ) : (
                        <div>
                            {workspaces.map((workspace) => (
                                <Link
                                    key={workspace.id}
                                    to="/settings/workspaces/$workspaceId"
                                    params={{ workspaceId: workspace.id }}
                                    className="flex items-start justify-between gap-3 border-b border-[var(--border-tertiary)] px-4 py-4 text-left transition-colors hover:bg-[var(--bg-quaternary)] last:border-b-0"
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={workspace.status} />
                                            <span className="font-[var(--font-mono)] text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">{workspace.id}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                            {workspace.mode ? (
                                                <span>
                                                    <span className="font-medium text-[var(--text-primary)]">Mode</span>{' '}
                                                    {workspace.mode}
                                                </span>
                                            ) : null}
                                            {workspace.machineId ? (
                                                <span>
                                                    <span className="font-medium text-[var(--text-primary)]">Worker</span>{' '}
                                                    {workspace.machineId}
                                                </span>
                                            ) : null}
                                            {workspace.path ? (
                                                <span>
                                                    <span className="font-medium text-[var(--text-primary)]">Path</span>{' '}
                                                    <span className="font-[var(--font-mono)]">{workspace.path}</span>
                                                </span>
                                            ) : null}
                                            <span>{formatDate(workspace.createdAt)}</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CursorCollapsibleSection>
            </CursorSettingsSection>
        </div>
    )
}
