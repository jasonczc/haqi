import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
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
        return <div className="p-4 text-sm text-[var(--app-badge-error-text)]">Failed to load containers</div>
    }

    const machines: MachineContainers[] = (query.data?.machines ?? []) as MachineContainers[]
    const allContainers = machines.flatMap(m => m.containers.map(c => ({ ...c, machineId: m.machineId })))

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-[var(--app-border)] px-4 py-3">
                <h1 className="text-base font-semibold">{t('cloud.containers.title')}</h1>
            </div>
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-content flex-col gap-6 p-4">
                    {allContainers.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center p-8">
                            <div className="text-center text-sm text-[var(--app-hint)]">
                                <p>{t('cloud.containers.empty')}</p>
                                <Link
                                    to="/sessions/new"
                                    className="mt-3 inline-block text-[var(--app-link)] underline hover:no-underline"
                                >
                                    Create a new session
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {allContainers.map((c) => {
                                const isRunning = c.status?.includes('Up')
                                return (
                                    <div key={c.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        isRunning
                                                            ? 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]'
                                                            : 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]'
                                                    }`}>
                                                        {isRunning ? 'running' : 'stopped'}
                                                    </span>
                                                    <span className="font-mono text-sm">{c.name || c.id?.slice(0, 12)}</span>
                                                </div>
                                                <div className="mt-1 text-xs text-[var(--app-hint)]">
                                                    {c.runtime && <span className="mr-3">Runtime: {c.runtime}</span>}
                                                    {c.workspaceId && <span className="mr-3">Workspace: {c.workspaceId}</span>}
                                                    {c.ports && <span>Ports: {c.ports}</span>}
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {isRunning && (
                                                    <>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => stopSessionMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                        >
                                                            {t('cloud.containers.stopSession')}
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => stopMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                        >
                                                            {t('cloud.containers.stop')}
                                                        </Button>
                                                    </>
                                                )}
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => setRemoveTarget({ machineId: c.machineId, containerId: c.id })}
                                                >
                                                    {t('cloud.containers.remove')}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
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
        </div>
    )
}
