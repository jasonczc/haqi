import { useQuery } from '@tanstack/react-query'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

export function CloudWorkspaceDetailContent(props: { workspaceId: string }) {
    const { api } = useAppContext()
    const workspaceId = props.workspaceId

    const workspaceQuery = useQuery({
        queryKey: queryKeys.cloudWorkspace(workspaceId),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudWorkspace(workspaceId)
        }
    })

    const workspace = workspaceQuery.data?.workspace
    if (workspaceQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label="Loading workspace…" />
            </div>
        )
    }

    if (!workspace) {
        return (
            <div className="p-4 text-sm text-[var(--danger)]">
                {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Workspace not found'}
            </div>
        )
    }

    const source = workspace.source?.type === 'repo'
        ? workspace.source.repository?.url
        : workspace.source?.directory

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--cursor-text-secondary)]">Workspace</div>
                <h1 className="text-xl font-semibold">{workspace.id}</h1>
            </div>

            <div className="grid gap-3 rounded-lg border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-4 text-sm md:grid-cols-2">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Status</div>
                    <div className="mt-1 font-medium">{workspace.status}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Mode</div>
                    <div className="mt-1 font-medium">{workspace.mode ?? 'ephemeral'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Worker</div>
                    <div className="mt-1 font-medium">{workspace.machineId ?? 'unassigned'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Environment</div>
                    <div className="mt-1 font-medium">{workspace.environmentId ?? workspace.environment?.id ?? 'default'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Checkpoint</div>
                    <div className="mt-1 font-medium">{workspace.checkpointId ?? 'default'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Workspace Branch</div>
                    <div className="mt-1 font-medium">{workspace.workspaceBranch ?? 'pending'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Repo Status</div>
                    <div className="mt-1 font-medium">{workspace.repoStatus ?? 'unknown'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Source</div>
                    <div className="mt-1 font-medium">{source ?? 'none'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Path</div>
                    <div className="mt-1 break-all font-mono text-xs">{workspace.path ?? 'worker-managed'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Repo Volume</div>
                    <div className="mt-1 break-all font-mono text-xs">{workspace.repoVolumePath ?? workspace.path ?? 'worker-managed'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Desktop State Volume</div>
                    <div className="mt-1 break-all font-mono text-xs">{workspace.desktopStateVolumePath ?? 'worker-managed'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">Desktop State</div>
                    <div className="mt-1 font-medium">{workspace.desktopState?.status ?? 'pending'}</div>
                    {workspace.desktopState?.phase ? (
                        <div className="mt-1 text-[var(--cursor-text-secondary)]">{workspace.desktopState.phase}</div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
