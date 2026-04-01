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
        ready: 'bg-emerald-500/15 text-emerald-700',
        provisioning: 'bg-amber-500/15 text-amber-700',
        starting: 'bg-blue-500/15 text-blue-700',
        active: 'bg-emerald-500/15 text-emerald-700',
        stopped: 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]',
        failed: 'bg-red-500/15 text-red-700',
    }
    const classes = colorMap[status] ?? 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
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
        return <div className="p-4 text-sm text-red-500">Failed to load workspaces</div>
    }

    const workspaces = (workspacesQuery.data?.workspaces ?? []) as CloudWorkspace[]

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.workspaces.title')}</h1>
            </div>

            {workspaces.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm font-medium text-[var(--app-hint)]">{t('cloud.workspaces.empty')}</div>
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
