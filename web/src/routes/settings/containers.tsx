import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import {
    CursorCollapsibleSection,
    CursorButton,
    CursorEmptyState,
    CursorSettingsHeader,
    CursorSettingsSection,
    cursorButtonClassName,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1000 && unitIndex < units.length - 1) {
        value /= 1000
        unitIndex += 1
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

type CleanupResult = {
    removedImages: Array<{ tag: string; bytes: number }>
    freedBytesImages: number
    freedBytesBuild: number
    freedBytesVolumes: number
    errors: string[]
}

type ContainerInfo = {
    id: string
    name: string
    status: string
    workspaceId: string
    runtime: string
    ports: string
}

type MachineContainers = {
    machineId: string
    containers: ContainerInfo[]
}

export default function CloudContainersPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [removeTarget, setRemoveTarget] = useState<{ machineId: string; containerId: string } | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const [pruneBuildCache, setPruneBuildCache] = useState(true)
    const [pruneVolumes, setPruneVolumes] = useState(false)
    const [lastCleanup, setLastCleanup] = useState<{ machineId: string; result: CleanupResult } | null>(null)

    const query = useQuery({
        queryKey: ['cloud-containers'],
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudContainers()
        }
    })

    const stopSessionMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerStopSession(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    const stopMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerStop(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    const removeMutation = useMutation({
        mutationFn: async ({ machineId, containerId }: { machineId: string; containerId: string }) => {
            await api!.containerRemove(machineId, containerId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
    })

    const cleanupMutation = useMutation({
        mutationFn: async (machineId: string): Promise<{ machineId: string; result: CleanupResult }> => {
            const result = await api!.dockerCleanup(machineId, {
                pruneBuildCache,
                pruneVolumes
            })
            return { machineId, result }
        },
        onSuccess: ({ machineId, result }) => {
            setLastCleanup({ machineId, result })
            queryClient.invalidateQueries({ queryKey: ['cloud-containers'] })
            const totalFreed = result.freedBytesImages + result.freedBytesBuild + result.freedBytesVolumes
            addToast({
                title: 'Storage reclaimed',
                body: `Freed ${formatBytes(totalFreed)} (${result.removedImages.length} images)`,
                sessionId: '',
                url: ''
            })
        },
        onError: (err: unknown) => {
            addToast({
                title: 'Cleanup failed',
                body: err instanceof Error ? err.message : 'Unknown error',
                sessionId: '',
                url: ''
            })
        }
    })

    if (query.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (query.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load containers</div>
    }

    const machines: MachineContainers[] = (query.data?.machines ?? []) as MachineContainers[]
    const allContainers = machines.flatMap(m => m.containers.map(c => ({ ...c, machineId: m.machineId })))

    const machineIdsForCleanup = Array.from(new Set(machines.map(m => m.machineId)))

    return (
        <>
            <div className="mx-auto w-full max-w-content">
                <CursorSettingsHeader
                    title="Containers"
                    description="Live container inventory across connected cloud workers, including runtime, workspace, and stop/remove controls."
                />

                {/* ── Storage panel ─────────────────────────────────────── */}
                <CursorSettingsSection>
                    <div className="border-b border-[var(--border-tertiary)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                                    Reclaim disk space
                                </div>
                                <div className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">
                                    Remove orphan <code className="font-mono">haqi-checkpoint</code> images (those not tracked in the checkpoint registry). Optionally also prune build cache and unused volumes.
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={pruneBuildCache}
                                    onChange={(e) => setPruneBuildCache(e.target.checked)}
                                    className="h-3.5 w-3.5 cursor-pointer"
                                />
                                Prune build cache
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={pruneVolumes}
                                    onChange={(e) => setPruneVolumes(e.target.checked)}
                                    className="h-3.5 w-3.5 cursor-pointer"
                                />
                                Prune unused volumes
                            </label>
                            <div className="ml-auto flex gap-1.5">
                                {machineIdsForCleanup.length === 0 ? (
                                    <span className="text-[12px] text-[var(--text-tertiary)]">No workers online</span>
                                ) : machineIdsForCleanup.map((mid) => (
                                    <CursorButton
                                        key={mid}
                                        variant="outline"
                                        size="sm"
                                        disabled={cleanupMutation.isPending}
                                        onClick={() => cleanupMutation.mutate(mid)}
                                    >
                                        {cleanupMutation.isPending && cleanupMutation.variables === mid
                                            ? 'Cleaning…'
                                            : machineIdsForCleanup.length === 1 ? 'Clean' : `Clean ${mid.slice(0, 8)}`}
                                    </CursorButton>
                                ))}
                            </div>
                        </div>

                        {lastCleanup ? (
                            <div className="mt-3 rounded-md border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                                <div className="font-semibold text-[var(--text-primary)]">
                                    Freed {formatBytes(
                                        lastCleanup.result.freedBytesImages
                                        + lastCleanup.result.freedBytesBuild
                                        + lastCleanup.result.freedBytesVolumes
                                    )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                    <span>Images: {formatBytes(lastCleanup.result.freedBytesImages)} ({lastCleanup.result.removedImages.length} removed)</span>
                                    {lastCleanup.result.freedBytesBuild > 0 ? (
                                        <span>Build cache: {formatBytes(lastCleanup.result.freedBytesBuild)}</span>
                                    ) : null}
                                    {lastCleanup.result.freedBytesVolumes > 0 ? (
                                        <span>Volumes: {formatBytes(lastCleanup.result.freedBytesVolumes)}</span>
                                    ) : null}
                                </div>
                                {lastCleanup.result.errors.length > 0 ? (
                                    <div className="mt-1 text-[11px] text-[var(--danger)]">
                                        {lastCleanup.result.errors.length} error{lastCleanup.result.errors.length > 1 ? 's' : ''}: {lastCleanup.result.errors[0]}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </CursorSettingsSection>

                <CursorSettingsSection>
                    <CursorCollapsibleSection
                        title="Containers"
                        description={`${allContainers.length} container${allContainers.length !== 1 ? 's' : ''} across all workers`}
                        isExpanded={isExpanded}
                        onToggle={() => setIsExpanded(!isExpanded)}
                    >
                        {allContainers.length === 0 ? (
                            <div className="px-4 py-6">
                                <CursorEmptyState
                                    title={t('cloud.containers.empty')}
                                    description="No cloud containers are currently running or tracked."
                                    action={(
                                        <Link
                                            to="/sessions"
                                            className={cursorButtonClassName({ variant: 'outline', size: 'sm' })}
                                        >
                                            Create a new session
                                        </Link>
                                    )}
                                />
                            </div>
                        ) : (
                            <div>
                                {allContainers.map((c) => {
                                    const isRunning = c.status?.includes('Up')
                                    return (
                                        <div
                                            key={c.id}
                                            className="flex items-start justify-between gap-3 border-b border-[var(--border-tertiary)] px-4 py-4 last:border-b-0"
                                        >
                                            <div className="flex min-w-0 flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`h-2 w-2 shrink-0 rounded-full ${
                                                            isRunning ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'
                                                        }`}
                                                    />
                                                    <span className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">
                                                        {c.name || c.id?.slice(0, 12)}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-[12px] leading-4 text-[var(--text-secondary)]">
                                                    {c.runtime && <span>Runtime: {c.runtime}</span>}
                                                    {c.workspaceId && <span>Workspace: {c.workspaceId}</span>}
                                                    {c.ports && <span>Ports: {c.ports}</span>}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-1.5">
                                                {isRunning && (
                                                    <>
                                                        <CursorButton
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => stopSessionMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                        >
                                                            {t('cloud.containers.stopSession')}
                                                        </CursorButton>
                                                        <CursorButton
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => stopMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                        >
                                                            {t('cloud.containers.stop')}
                                                        </CursorButton>
                                                    </>
                                                )}
                                                <CursorButton
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => setRemoveTarget({ machineId: c.machineId, containerId: c.id })}
                                                >
                                                    {t('cloud.containers.remove')}
                                                </CursorButton>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CursorCollapsibleSection>
                </CursorSettingsSection>
            </div>
            <ConfirmDialog
                isOpen={!!removeTarget}
                onClose={() => setRemoveTarget(null)}
                title={t('cloud.containers.remove')}
                description="This action cannot be undone."
                confirmLabel={t('cloud.containers.remove')}
                confirmingLabel={t('cloud.containers.remove')}
                onConfirm={async () => {
                    if (removeTarget) {
                        await removeMutation.mutateAsync(removeTarget)
                    }
                }}
                isPending={removeMutation.isPending}
                destructive
            />
        </>
    )
}
