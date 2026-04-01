import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudWorkspace } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        ready: 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]',
        provisioning: 'bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)] border border-[var(--app-badge-warning-border)]',
        starting: 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]',
        active: 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]',
        stopped: 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]',
        failed: 'bg-[var(--app-badge-error-bg)] text-[var(--app-badge-error-text)] border border-[var(--app-badge-error-border)]',
    }
    const classes = colorMap[status] ?? 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]'
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
            {status}
        </span>
    )
}

export default function CloudWorkspacesPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()

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
        return <div className="p-4 text-sm text-[var(--app-badge-error-text)]">Failed to load workspaces</div>
    }

    const workspaces = (workspacesQuery.data?.workspaces ?? []) as CloudWorkspace[]

    return (
        <div className="mx-auto flex w-full max-w-content flex-col gap-6 p-4">
                    {workspaces.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center p-8">
                            <div className="text-center text-sm text-[var(--app-hint)]">
                                <p>{t('cloud.workspaces.empty')}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {workspaces.map((workspace) => (
                                <Link
                                    key={workspace.id}
                                    to="/cloud/workspaces/$workspaceId"
                                    params={{ workspaceId: workspace.id }}
                                    className="block rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 transition-colors hover:bg-[var(--app-subtle-bg)]"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={workspace.status} />
                                                <span className="font-mono text-sm font-medium">{workspace.id}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                                {workspace.mode ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--app-fg)]">Mode</span>{' '}
                                                        {workspace.mode}
                                                    </span>
                                                ) : null}
                                                {workspace.machineId ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--app-fg)]">Worker</span>{' '}
                                                        {workspace.machineId}
                                                    </span>
                                                ) : null}
                                                {workspace.path ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--app-fg)]">Path</span>{' '}
                                                        <span className="font-mono">{workspace.path}</span>
                                                    </span>
                                                ) : null}
                                                <span>{formatDate(workspace.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
        </div>
    )
}
