import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import { QuickSpawnDialog } from '@/components/QuickSpawnDialog'
import {
    CursorButton,
    CursorCollapsibleSection,
    CursorEmptyState,
    CursorSettingsBadge,
    CursorSettingsHeader,
    CursorSettingsSection,
    cursorButtonClassName,
} from '@/components/settings/CursorSettingsPrimitives'
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
    const toneMap = {
        ready: 'success',
        creating: 'accent',
        failed: 'danger',
    } as const
    const labelMap = {
        ready: t('cloud.checkpoints.ready'),
        creating: t('cloud.checkpoints.creating'),
        failed: t('cloud.checkpoints.failed'),
    } as const
    return (
        <CursorSettingsBadge tone={toneMap[status]} className="rounded-full">
            {labelMap[status]}
        </CursorSettingsBadge>
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
                <CursorSettingsHeader
                    title="Checkpoints"
                    description="Saved cloud runtime snapshots that can boot new sessions or serve as parents for derived setup runs."
                />

                <CursorSettingsSection>
                    <CursorCollapsibleSection
                        title="Checkpoints"
                        description={`${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''} available`}
                        isExpanded={isExpanded}
                        onToggle={() => setIsExpanded(!isExpanded)}
                    >
                        {checkpoints.length === 0 ? (
                            <div className="px-4 py-6">
                                <CursorEmptyState
                                    title={t('cloud.checkpoints.empty')}
                                    description="Start a Setup session to configure an environment, then save it as a checkpoint."
                                    action={(
                                        <div className="flex items-center justify-center gap-2">
                                            <CursorButton size="sm" onClick={() => setSpawnOpen(true)}>
                                                Start Setup Session
                                            </CursorButton>
                                            <Link to="/settings/onboard" className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}>
                                                Onboarding Guide
                                            </Link>
                                        </div>
                                    )}
                                />
                            </div>
                        ) : (
                            <div>
                                {checkpoints.map((checkpoint) => (
                                    <div
                                        key={checkpoint.id}
                                        className={`flex items-start justify-between gap-3 border-b border-[var(--border-tertiary)] px-4 py-4 last:border-b-0${
                                            checkpoint.parentCheckpointId ? ' pl-8' : ''
                                        }`}
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={checkpoint.status} t={t} />
                                                <span className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">{checkpoint.name}</span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                                {checkpoint.repoUrl ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.checkpoints.repo')}</span>{' '}
                                                        {checkpoint.repoUrl}
                                                    </span>
                                                ) : null}
                                                {checkpoint.parentCheckpointId ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.checkpoints.parent')}</span>{' '}
                                                        {(() => {
                                                            const parent = checkpoints.find(c => c.id === checkpoint.parentCheckpointId)
                                                            return parent
                                                                ? <span className="font-[var(--font-mono)]">{parent.name} ({checkpoint.parentCheckpointId.slice(0, 8)})</span>
                                                                : <span className="font-[var(--font-mono)]">{checkpoint.parentCheckpointId.slice(0, 12)}</span>
                                                        })()}
                                                    </span>
                                                ) : null}
                                                {checkpoint.machineId ? (
                                                    <span>
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.checkpoints.machine')}</span>{' '}
                                                        <span className="font-[var(--font-mono)]">{checkpoint.machineId}</span>
                                                    </span>
                                                ) : null}
                                                <span>{formatDate(checkpoint.createdAt)}</span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-1.5">
                                            <Link
                                                to="/sessions/new"
                                                search={{ checkpointId: checkpoint.id }}
                                                className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}
                                            >
                                                {t('cloud.checkpoints.newSession')}
                                            </Link>
                                            <Link
                                                to="/sessions/new"
                                                search={{ checkpointId: checkpoint.id, sessionType: 'setup' }}
                                                className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}
                                            >
                                                {t('cloud.checkpoints.derive')}
                                            </Link>
                                            <CursorButton
                                                variant="danger"
                                                size="sm"
                                                onClick={() => setDeleteId(checkpoint.id)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                {t('cloud.checkpoints.delete')}
                                            </CursorButton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CursorCollapsibleSection>
                </CursorSettingsSection>
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
