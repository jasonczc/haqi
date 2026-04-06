import { useState, useId } from 'react'
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
                <CollapsibleSection
                    title="Containers"
                    description={`${allContainers.length} container${allContainers.length !== 1 ? 's' : ''} across all workers`}
                    isExpanded={isExpanded}
                    onToggle={() => setIsExpanded(!isExpanded)}
                >
                    {allContainers.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-[var(--cursor-text-secondary)]">
                            <p>{t('cloud.containers.empty')}</p>
                            <Link
                                to="/sessions/new"
                                className="mt-2 inline-block text-[var(--cursor-link)] underline hover:no-underline"
                            >
                                Create a new session
                            </Link>
                        </div>
                    ) : (
                        <div>
                            {allContainers.map((c) => {
                                const isRunning = c.status?.includes('Up')
                                return (
                                    <div
                                        key={c.id}
                                        className="flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-secondary)] px-3 py-3"
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                                        isRunning ? 'bg-[var(--success)]' : 'bg-[var(--cursor-text-secondary)]'
                                                    }`}
                                                />
                                                <span className="text-sm font-medium text-[var(--cursor-text-primary)]">
                                                    {c.name || c.id?.slice(0, 12)}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap gap-x-3 pl-4 text-xs text-[var(--cursor-text-secondary)]">
                                                {c.runtime && <span>Runtime: {c.runtime}</span>}
                                                {c.workspaceId && <span>Workspace: {c.workspaceId}</span>}
                                                {c.ports && <span>Ports: {c.ports}</span>}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-1.5">
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
                                )
                            })}
                        </div>
                    )}
                </CollapsibleSection>
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
