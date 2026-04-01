import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudSpawnRequest } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function PhaseBadge({ phase }: { phase: string }) {
    const colorMap: Record<string, string> = {
        succeeded: 'bg-emerald-500/15 text-emerald-700',
        failed: 'bg-red-500/15 text-red-700',
        canceled: 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]',
        pending: 'bg-amber-500/15 text-amber-700',
        scheduling: 'bg-amber-500/15 text-amber-700',
        provisioning: 'bg-blue-500/15 text-blue-700',
        starting: 'bg-blue-500/15 text-blue-700',
    }
    const classes = colorMap[phase] ?? 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
            {phase}
        </span>
    )
}

export default function CloudRequestsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()

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
        return <div className="p-4 text-sm text-red-500">Failed to load requests</div>
    }

    const requests = (requestsQuery.data?.requests ?? []) as CloudSpawnRequest[]

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.requests.title')}</h1>
            </div>

            {requests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm font-medium text-[var(--app-hint)]">{t('cloud.requests.empty')}</div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {requests.map((request) => (
                        <Link
                            key={request.id}
                            to="/cloud/requests/$requestId"
                            params={{ requestId: request.id }}
                            className="block rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 transition-colors hover:bg-[var(--app-subtle-bg)]"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <PhaseBadge phase={request.phase} />
                                        <span className="font-mono text-sm font-medium">{request.id}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                        {request.selectedMachineId ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">Worker</span>{' '}
                                                {request.selectedMachineId}
                                            </span>
                                        ) : null}
                                        {request.request.agent ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">Agent</span>{' '}
                                                {request.request.agent}
                                            </span>
                                        ) : null}
                                        <span>{formatDate(request.createdAt)}</span>
                                    </div>
                                </div>
                                {request.error ? (
                                    <div className="max-w-xs truncate rounded bg-red-500/10 px-2 py-1 text-xs text-red-700">
                                        {request.error.message ?? request.error.code}
                                    </div>
                                ) : null}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
