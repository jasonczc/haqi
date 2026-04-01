import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
        ready: 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]',
        creating: 'bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)] border border-[var(--app-badge-warning-border)]',
        failed: 'bg-[var(--app-badge-error-bg)] text-[var(--app-badge-error-text)] border border-[var(--app-badge-error-border)]',
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
    const [deleteId, setDeleteId] = useState<string | null>(null)

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
        return <div className="p-4 text-sm text-[var(--app-badge-error-text)]">Failed to load checkpoints</div>
    }

    const checkpoints = (checkpointsQuery.data?.checkpoints ?? []) as unknown as StoredCheckpoint[]

    return (
        <>
            <div className="mx-auto flex w-full max-w-content flex-col gap-6 p-4">
                    {checkpoints.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center p-8">
                            <div className="text-center text-sm text-[var(--app-hint)]">
                                <p>{t('cloud.checkpoints.empty')}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {checkpoints.map((checkpoint) => (
                                <div
                                    key={checkpoint.id}
                                    className={`rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4${checkpoint.parentCheckpointId ? ' ml-6 border-l-2 border-l-[var(--app-link)]' : ''}`}
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
                                                        {(() => {
                                                            const parent = checkpoints.find(c => c.id === checkpoint.parentCheckpointId)
                                                            return parent
                                                                ? <span className="font-mono">{parent.name} ({checkpoint.parentCheckpointId.slice(0, 8)})</span>
                                                                : <span className="font-mono">{checkpoint.parentCheckpointId.slice(0, 12)}</span>
                                                        })()}
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
                                                search={{ checkpointId: checkpoint.id }}
                                            >
                                                <Button variant="outline" size="sm">
                                                    {t('cloud.checkpoints.newSession')}
                                                </Button>
                                            </Link>
                                            <Link
                                                to="/sessions/new"
                                                search={{ checkpointId: checkpoint.id, sessionType: 'setup' }}
                                            >
                                                <Button variant="outline" size="sm">
                                                    {t('cloud.checkpoints.derive')}
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setDeleteId(checkpoint.id)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                {t('cloud.checkpoints.delete')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            </div>
            <ConfirmDialog
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                title={t('cloud.checkpoints.confirmDelete')}
                description="This action cannot be undone."
                confirmLabel={t('cloud.checkpoints.delete')}
                confirmingLabel={t('cloud.checkpoints.delete')}
                onConfirm={async () => {
                    if (deleteId) {
                        await deleteMutation.mutateAsync(deleteId)
                    }
                }}
                isPending={deleteMutation.isPending}
                destructive
            />
        </>
    )
}
