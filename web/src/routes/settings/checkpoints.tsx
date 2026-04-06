import { useState, useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import { QuickSpawnDialog } from '@/components/QuickSpawnDialog'
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
        ready: 'bg-[var(--cursor-badge-success-bg)] text-[var(--cursor-badge-success-text)] border border-[var(--cursor-badge-success-border)]',
        creating: 'bg-[var(--cursor-badge-warning-bg)] text-[var(--cursor-badge-warning-text)] border border-[var(--cursor-badge-warning-border)]',
        failed: 'bg-[var(--cursor-badge-error-bg)] text-[var(--cursor-badge-error-text)] border border-[var(--cursor-badge-error-border)]',
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

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function CollapsibleSection(props: {
    title: string
    description: string
    isExpanded: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    const sectionContentId = useId()
    return (
        <section className="border-b border-[var(--cursor-stroke-secondary)]">
            <button
                type="button"
                onClick={props.onToggle}
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--cursor-bg-quiet)]"
                aria-expanded={props.isExpanded}
                aria-controls={sectionContentId}
            >
                <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-[var(--cursor-text-primary)]">{props.title}</span>
                    <span className="text-xs text-[var(--cursor-text-secondary)]">{props.description}</span>
                </div>
                <ChevronDownIcon
                    className={`mt-0.5 shrink-0 text-[var(--cursor-text-secondary)] transition-transform ${
                        props.isExpanded ? 'rotate-180' : ''
                    }`}
                />
            </button>
            {props.isExpanded && (
                <div id={sectionContentId}>
                    {props.children}
                </div>
            )}
        </section>
    )
}

export default function CloudCheckpointsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const [spawnOpen, setSpawnOpen] = useState(false)

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
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load checkpoints</div>
    }

    const checkpoints = (checkpointsQuery.data?.checkpoints ?? []) as unknown as StoredCheckpoint[]

    return (
        <>
            <div className="mx-auto w-full max-w-content">
                <CollapsibleSection
                    title="Checkpoints"
                    description={`${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''} available`}
                    isExpanded={isExpanded}
                    onToggle={() => setIsExpanded(!isExpanded)}
                >
                    {checkpoints.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-[var(--cursor-text-secondary)]">
                            <p>{t('cloud.checkpoints.empty')}</p>
                            <p className="mt-2 text-xs">
                                Start a Setup session to configure an environment, then save it as a checkpoint.
                            </p>
                            <div className="mt-3 flex items-center justify-center gap-2">
                                <Button size="sm" onClick={() => setSpawnOpen(true)}>
                                    Start Setup Session
                                </Button>
                                <Link to="/settings/onboard">
                                    <Button variant="outline" size="sm">
                                        Onboarding Guide
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div>
                            {checkpoints.map((checkpoint) => (
                                <div
                                    key={checkpoint.id}
                                    className={`flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-secondary)] px-3 py-3${
                                        checkpoint.parentCheckpointId ? ' pl-8' : ''
                                    }`}
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={checkpoint.status} t={t} />
                                            <span className="text-sm font-medium text-[var(--cursor-text-primary)]">{checkpoint.name}</span>
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--cursor-text-secondary)]">
                                            {checkpoint.repoUrl ? (
                                                <span>
                                                    <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.repo')}</span>{' '}
                                                    {checkpoint.repoUrl}
                                                </span>
                                            ) : null}
                                            {checkpoint.parentCheckpointId ? (
                                                <span>
                                                    <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.parent')}</span>{' '}
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
                                                    <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.checkpoints.machine')}</span>{' '}
                                                    <span className="font-mono">{checkpoint.machineId}</span>
                                                </span>
                                            ) : null}
                                            <span>{formatDate(checkpoint.createdAt)}</span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-1.5">
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
                            ))}
                        </div>
                    )}
                </CollapsibleSection>
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
            <QuickSpawnDialog
                open={spawnOpen}
                onClose={() => setSpawnOpen(false)}
                defaultSetup
                onSpawned={(sessionId) => {
                    setSpawnOpen(false)
                    void navigate({ to: '/sessions/$sessionId', params: { sessionId } })
                }}
            />
        </>
    )
}
