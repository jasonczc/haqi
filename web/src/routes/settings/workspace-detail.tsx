import { useQuery } from '@tanstack/react-query'
import { LoadingState } from '@/components/LoadingState'
import {
    CursorDetailGrid,
    CursorDetailItem,
    CursorSettingsHeader,
} from '@/components/settings/CursorSettingsPrimitives'
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
            <CursorSettingsHeader title={workspace.id} description="Workspace" />

            <CursorDetailGrid>
                <CursorDetailItem label="Status" value={workspace.status} />
                <CursorDetailItem label="Mode" value={workspace.mode ?? 'ephemeral'} />
                <CursorDetailItem label="Worker" value={workspace.machineId ?? 'unassigned'} />
                <CursorDetailItem label="Environment" value={workspace.environmentId ?? workspace.environment?.id ?? 'default'} />
                <CursorDetailItem label="Checkpoint" value={workspace.checkpointId ?? 'default'} />
                <CursorDetailItem label="Workspace Branch" value={workspace.workspaceBranch ?? 'pending'} />
                <CursorDetailItem label="Repo Status" value={workspace.repoStatus ?? 'unknown'} />
                <CursorDetailItem className="md:col-span-2" label="Source" value={source ?? 'none'} />
                <CursorDetailItem className="md:col-span-2" label="Path" value={<div className="break-all font-[var(--font-mono)] text-xs">{workspace.path ?? 'worker-managed'}</div>} />
                <CursorDetailItem className="md:col-span-2" label="Repo Volume" value={<div className="break-all font-[var(--font-mono)] text-xs">{workspace.repoVolumePath ?? workspace.path ?? 'worker-managed'}</div>} />
                <CursorDetailItem className="md:col-span-2" label="Desktop State Volume" value={<div className="break-all font-[var(--font-mono)] text-xs">{workspace.desktopStateVolumePath ?? 'worker-managed'}</div>} />
                <CursorDetailItem
                    className="md:col-span-2"
                    label="Desktop State"
                    value={(
                        <>
                            <div>{workspace.desktopState?.status ?? 'pending'}</div>
                            {workspace.desktopState?.phase ? (
                                <div className="mt-1 text-[var(--text-secondary)]">{workspace.desktopState.phase}</div>
                            ) : null}
                        </>
                    )}
                />
            </CursorDetailGrid>
        </div>
    )
}
