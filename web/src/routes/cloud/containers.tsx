import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
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
        return <div className="p-4 text-sm text-red-500">Failed to load containers</div>
    }

    const machines: MachineContainers[] = (query.data?.machines ?? []) as MachineContainers[]
    const allContainers = machines.flatMap(m => m.containers.map(c => ({ ...c, machineId: m.machineId })))

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.containers.title')}</h1>
            </div>

            {allContainers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm text-[var(--app-hint)]">
                        {t('cloud.containers.empty')}
                    </div>
                    <Link
                        to="/sessions/new"
                        className="mt-3 inline-block rounded-md bg-[var(--app-link)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                        Create a new session
                    </Link>
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
                                                    ? 'bg-emerald-500/15 text-emerald-700'
                                                    : 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
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
                                                <button
                                                    onClick={() => stopSessionMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                    className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/25"
                                                >
                                                    {t('cloud.containers.stopSession')}
                                                </button>
                                                <button
                                                    onClick={() => stopMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                                    className="rounded bg-orange-500/15 px-2 py-1 text-xs text-orange-700 hover:bg-orange-500/25"
                                                >
                                                    {t('cloud.containers.stop')}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => removeMutation.mutate({ machineId: c.machineId, containerId: c.id })}
                                            className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-700 hover:bg-red-500/25"
                                        >
                                            {t('cloud.containers.remove')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
