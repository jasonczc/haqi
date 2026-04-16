import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import {
    CursorButton,
    CursorDetailGrid,
    CursorDetailItem,
    CursorSettingsHeader,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

function formatRef(request: {
    branch?: string
    tag?: string
    commit?: string
    pr?: string
} | undefined): string {
    if (!request) {
        return 'default'
    }
    if (request.branch) {
        return `branch:${request.branch}`
    }
    if (request.tag) {
        return `tag:${request.tag}`
    }
    if (request.commit) {
        return `commit:${request.commit.slice(0, 12)}`
    }
    if (request.pr) {
        return `pr:${request.pr}`
    }
    return 'default'
}

export function CloudRequestDetailContent(props: {
    requestId: string
    routeScope?: 'settings' | 'agents'
    embedded?: boolean
}) {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const requestId = props.requestId
    const routeScope = props.routeScope ?? 'settings'
    const embedded = props.embedded ?? false

    const requestQuery = useQuery({
        queryKey: queryKeys.cloudRequest(requestId),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudRequest(requestId)
        },
        refetchInterval: (query) => {
            const phase = query.state.data?.request.phase
            return phase === 'succeeded' || phase === 'failed' || phase === 'canceled' ? false : 1500
        }
    })

    const cancelMutation = useMutation({
        mutationFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.cancelCloudRequest(requestId)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequest(requestId) })
        }
    })

    const retryMutation = useMutation({
        mutationFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.retryCloudRequest(requestId)
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequest(result.request.id) })
            if (routeScope === 'agents') {
                navigate({
                    to: '/settings/cloud-agents/requests/$requestId',
                    params: { requestId: result.request.id }
                })
            } else {
                navigate({
                    to: '/settings/requests/$requestId',
                    params: { requestId: result.request.id }
                })
            }
        }
    })

    const request = requestQuery.data?.request

    useEffect(() => {
        if (request?.phase === 'succeeded' && request.sessionId) {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId: request.sessionId },
                replace: true
            })
        }
    }, [navigate, request?.phase, request?.sessionId])

    if (requestQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label="Loading cloud request…" />
            </div>
        )
    }

    if (!request) {
        return (
            <div className="p-4 text-sm text-[var(--danger)]">
                {requestQuery.error instanceof Error ? requestQuery.error.message : 'Cloud request not found'}
            </div>
        )
    }

    const repository = request.request.workspaceSource?.repository
    const canCancel = request.phase !== 'succeeded' && request.phase !== 'failed' && request.phase !== 'canceled'
    const canRetry = request.phase === 'failed' || request.phase === 'canceled'

    return (
        <div className={`${embedded ? 'flex flex-col gap-4 p-4' : 'mx-auto flex w-full max-w-3xl flex-col gap-4 p-4'}`}>
            <div className="flex items-center justify-between gap-3">
                <CursorSettingsHeader title={request.id} description="Cloud Request" />
                <div className="flex gap-2">
                    <CursorButton
                        type="button"
                        variant="outline"
                        onClick={() => navigate({ to: '/sessions' })}
                    >
                        New Session
                    </CursorButton>
                    {canCancel ? (
                        <CursorButton
                            type="button"
                            variant="outline"
                            onClick={() => cancelMutation.mutate()}
                            disabled={cancelMutation.isPending}
                        >
                            Cancel
                        </CursorButton>
                    ) : null}
                    {canRetry ? (
                        <CursorButton
                            type="button"
                            onClick={() => retryMutation.mutate()}
                            disabled={retryMutation.isPending}
                        >
                            Retry
                        </CursorButton>
                    ) : null}
                </div>
            </div>

            <CursorDetailGrid>
                <CursorDetailItem label="Phase" value={request.phase} />
                <CursorDetailItem label="Worker" value={request.selectedMachineId ?? 'pending scheduler'} />
                <CursorDetailItem
                    label="Workspace"
                    value={
                        request.workspaceId ? (
                            <button
                                type="button"
                                className="text-[var(--accent)] hover:underline"
                                onClick={() => {
                                    if (routeScope === 'agents') {
                                        navigate({
                                            to: '/settings/cloud-agents/workspaces/$workspaceId',
                                            params: { workspaceId: request.workspaceId! }
                                        })
                                        return
                                    }
                                    navigate({
                                        to: '/settings/workspaces/$workspaceId',
                                        params: { workspaceId: request.workspaceId! }
                                    })
                                }}
                            >
                                {request.workspaceId}
                            </button>
                        ) : 'pending'
                    }
                />
                <CursorDetailItem label="Environment" value={request.request.environmentId ?? request.request.environment?.id ?? 'default'} />
                <CursorDetailItem label="Checkpoint" value={request.request.checkpointId ?? request.request.environment?.runtime?.checkpointId ?? 'default'} />
                <CursorDetailItem label="Launch" value={request.request.launchMode ?? 'interactive'} />
                <CursorDetailItem
                    className="md:col-span-2"
                    label="Repository"
                    value={(
                        <>
                            <div>{repository?.url ?? 'none'}</div>
                            {repository ? (
                                <div className="mt-1 text-[var(--text-secondary)]">{formatRef(repository.ref)}</div>
                            ) : null}
                        </>
                    )}
                />
                {request.error ? (
                    <div className="md:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Last Error</div>
                        <div className="mt-1 rounded-md border border-[var(--danger)]/20 bg-[var(--danger)]/10 p-3 text-[var(--danger)]">
                            <div className="font-medium">{request.error.code ?? 'error'}</div>
                            <div className="mt-1">{request.error.message}</div>
                        </div>
                    </div>
                ) : null}
            </CursorDetailGrid>

            <SpawnLogsPanel requestId={request.id} />
        </div>
    )
}

/**
 * Fetches and displays the per-spawn log file from the worker.
 * Lazy — only fetches when the user clicks "Load logs".
 */
function SpawnLogsPanel(props: { requestId: string }) {
    const { api } = useAppContext()
    const [expanded, setExpanded] = useState(false)

    const logsQuery = useQuery({
        queryKey: ['cloud-request-logs', props.requestId],
        enabled: Boolean(api) && expanded,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudRequestLogs(props.requestId)
        },
        staleTime: 5_000
    })

    return (
        <div className="rounded-md border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Spawn logs</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                        The full stdout, stderr, and lifecycle events captured by the worker for this spawn.
                    </div>
                </div>
                <div className="flex gap-2">
                    {expanded ? (
                        <CursorButton
                            type="button"
                            variant="outline"
                            onClick={() => void logsQuery.refetch()}
                            disabled={logsQuery.isFetching}
                        >
                            {logsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
                        </CursorButton>
                    ) : null}
                    <CursorButton
                        type="button"
                        variant={expanded ? 'outline' : 'primary'}
                        onClick={() => setExpanded(v => !v)}
                    >
                        {expanded ? 'Hide' : 'Load logs'}
                    </CursorButton>
                </div>
            </div>
            {expanded ? (
                <div className="mt-3">
                    {logsQuery.isLoading ? (
                        <div className="text-[12px] text-[var(--text-tertiary)]">Loading…</div>
                    ) : logsQuery.isError ? (
                        <div className="text-[12px] text-[var(--danger)]">
                            {logsQuery.error instanceof Error ? logsQuery.error.message : 'Failed to load logs'}
                        </div>
                    ) : !logsQuery.data?.found ? (
                        <div className="text-[12px] text-[var(--text-tertiary)]">
                            No spawn log available for this request (worker may have pruned it, or the spawn was from an older build without per-spawn logging).
                        </div>
                    ) : (
                        <>
                            {logsQuery.data.truncated ? (
                                <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">
                                    Output truncated — showing tail only.
                                </div>
                            ) : null}
                            <pre className="max-h-[50vh] overflow-auto rounded bg-[var(--bg-primary)] p-3 font-mono text-[11px] leading-[1.4] text-[var(--text-primary)] whitespace-pre-wrap break-all">
                                {logsQuery.data.content || '(empty)'}
                            </pre>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    )
}
