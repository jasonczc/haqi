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
    const [removeTarget, setRemoveTarget] = useState<{ machineId: string; containerId: string } | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)

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

    return (
        <>
            <div className="mx-auto w-full max-w-content">
                <CursorSettingsHeader
                    title="Containers"
                    description="Live container inventory across connected cloud workers, including runtime, workspace, and stop/remove controls."
                />
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
                                            to="/sessions/new"
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
