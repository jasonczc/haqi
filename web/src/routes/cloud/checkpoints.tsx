import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'

type StoredCheckpoint = {
    id: string
    namespace: string
    name: string
    repoUrl: string | null
    parentCheckpointId: string | null
    baseImage: string
    dockerImage: string
    machineId: string
    workspacePath: string | null
    environmentJson: string | null
    createdBySession: string | null
    status: 'creating' | 'ready' | 'failed'
    createdAt: number
    updatedAt: number
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function StatusBadge({ status, t }: { status: StoredCheckpoint['status']; t: (key: string) => string }) {
    const colorMap = {
        ready: 'bg-emerald-500/15 text-emerald-700',
        creating: 'bg-amber-500/15 text-amber-700',
        failed: 'bg-red-500/15 text-red-700',
    } as const
    const labelMap = {
        ready: t('cloud.checkpoints.ready'),
        creating: t('cloud.checkpoints.creating'),
        failed: t('cloud.checkpoints.failed'),
    } as const
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status]}`}>
            {labelMap[status]}
        </span>
    )
}

export default function CloudCheckpointsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const checkpointsQuery = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudCheckpoints()
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!api) throw new Error('API unavailable')
            await api.deleteCheckpoint(id)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cloudCheckpoints })
    })

    if (checkpointsQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (checkpointsQuery.isError) {
        return <div className="p-4 text-sm text-red-500">Failed to load checkpoints</div>
    }

    const checkpoints = (checkpointsQuery.data?.checkpoints ?? []) as unknown as StoredCheckpoint[]

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.checkpoints.title')}</h1>
            </div>

            {checkpoints.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm font-medium text-[var(--app-hint)]">{t('cloud.checkpoints.empty')}</div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {checkpoints.map((checkpoint) => (
                        <div
                            key={checkpoint.id}
                            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={checkpoint.status} t={t} />
                                        <span className="font-medium text-sm">{checkpoint.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                        {checkpoint.repoUrl ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">{t('cloud.checkpoints.repo')}</span>{' '}
                                                {checkpoint.repoUrl}
                                            </span>
                                        ) : null}
                                        {checkpoint.parentCheckpointId ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">{t('cloud.checkpoints.parent')}</span>{' '}
                                                <span className="font-mono">{checkpoint.parentCheckpointId}</span>
                                            </span>
                                        ) : null}
                                        {checkpoint.machineId ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">{t('cloud.checkpoints.machine')}</span>{' '}
                                                <span className="font-mono">{checkpoint.machineId}</span>
                                            </span>
                                        ) : null}
                                        <span>{formatDate(checkpoint.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1.5">
                                    <Link
                                        to="/sessions/new"
                                        search={{ checkpointId: checkpoint.id } as any}
                                        className="rounded bg-[var(--app-subtle-bg)] px-2 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]"
                                    >
                                        {t('cloud.checkpoints.newSession')}
                                    </Link>
                                    <Link
                                        to="/sessions/new"
                                        search={{ checkpointId: checkpoint.id, sessionType: 'setup' } as any}
                                        className="rounded bg-[var(--app-subtle-bg)] px-2 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]"
                                    >
                                        {t('cloud.checkpoints.derive')}
                                    </Link>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(t('cloud.checkpoints.confirmDelete'))) {
                                                deleteMutation.mutate(checkpoint.id)
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                        className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-700 hover:bg-red-500/25 disabled:opacity-50"
                                    >
                                        {t('cloud.checkpoints.delete')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
