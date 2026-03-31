import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudWorkerSummary } from '@/types/api'

function formatLastSeen(updatedAt: number): string {
    const now = Date.now()
    const diffMs = now - updatedAt
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return new Date(updatedAt).toLocaleDateString()
}

function formatMemory(memoryMb: number): string {
    if (memoryMb >= 1024) return `${(memoryMb / 1024).toFixed(1)} GB`
    return `${memoryMb} MB`
}

export default function CloudWorkersPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        }
    })

    if (workersQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (workersQuery.isError) {
        return <div className="p-4 text-sm text-red-500">Failed to load workers</div>
    }

    const workers: CloudWorkerSummary[] = workersQuery.data?.workers ?? []

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.workers.title')}</h1>
            </div>

            {workers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm font-medium">{t('cloud.workers.empty')}</div>
                    <div className="mt-1 text-sm text-[var(--app-hint)]">
                        {t('cloud.workers.empty.hint')}{' '}
                        <Link to="/cloud/secrets" className="underline hover:no-underline">
                            {t('cloud.workers.empty.link')}
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {workers.map((worker) => (
                        <div
                            key={worker.machineId}
                            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                            worker.active
                                                ? 'bg-emerald-500/15 text-emerald-700'
                                                : 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
                                        }`}
                                    >
                                        {worker.active ? t('cloud.workers.status.online') : t('cloud.workers.status.offline')}
                                    </span>
                                    <span className="font-mono text-sm font-medium">{worker.machineId}</span>
                                </div>
                                <div className="text-xs text-[var(--app-hint)]">
                                    {t('cloud.workers.lastSeen')}: {formatLastSeen(worker.updatedAt)}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                {worker.provider ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.provider')}</span>{' '}
                                        {worker.provider}
                                    </span>
                                ) : null}
                                {worker.lifecycle ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.lifecycle')}</span>{' '}
                                        {worker.lifecycle}
                                    </span>
                                ) : null}
                                {worker.region ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.region')}</span>{' '}
                                        {worker.region}
                                    </span>
                                ) : null}
                                {worker.workerVersion ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.version')}</span>{' '}
                                        {worker.workerVersion}
                                    </span>
                                ) : null}
                            </div>

                            {worker.resources ? (
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                    {worker.resources.cpu != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.cpu')}</span>{' '}
                                            {worker.resources.cpu} cores
                                        </span>
                                    ) : null}
                                    {worker.resources.memoryMb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.memory')}</span>{' '}
                                            {formatMemory(worker.resources.memoryMb)}
                                        </span>
                                    ) : null}
                                    {worker.resources.diskGb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.disk')}</span>{' '}
                                            {worker.resources.diskGb} GB
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {worker.labels && worker.labels.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {worker.labels.map((label) => (
                                        <span
                                            key={label}
                                            className="rounded bg-[var(--app-bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--app-hint)]"
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
