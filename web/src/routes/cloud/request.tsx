import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/LoadingState'
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

export default function CloudRequestDetailPage() {
    const { api } = useAppContext()
    const { requestId } = useParams({ from: '/cloud/requests/$requestId' })
    const navigate = useNavigate()
    const queryClient = useQueryClient()

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
            navigate({
                to: '/cloud/requests/$requestId',
                params: { requestId: result.request.id }
            })
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
            <div className="p-4 text-sm text-red-600">
                {requestQuery.error instanceof Error ? requestQuery.error.message : 'Cloud request not found'}
            </div>
        )
    }

    const repository = request.request.workspaceSource?.repository
    const canCancel = request.phase !== 'succeeded' && request.phase !== 'failed' && request.phase !== 'canceled'
    const canRetry = request.phase === 'failed' || request.phase === 'canceled'

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud Request</div>
                    <h1 className="text-xl font-semibold">{request.id}</h1>
                </div>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate({ to: '/sessions/new' })}
                    >
                        New Session
                    </Button>
                    {canCancel ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => cancelMutation.mutate()}
                            disabled={cancelMutation.isPending}
                        >
                            Cancel
                        </Button>
                    ) : null}
                    {canRetry ? (
                        <Button
                            type="button"
                            onClick={() => retryMutation.mutate()}
                            disabled={retryMutation.isPending}
                        >
                            Retry
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 text-sm md:grid-cols-2">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Phase</div>
                    <div className="mt-1 font-medium">{request.phase}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Worker</div>
                    <div className="mt-1 font-medium">{request.selectedMachineId ?? 'pending scheduler'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Workspace</div>
                    <div className="mt-1 font-medium">
                        {request.workspaceId ? (
                            <button
                                type="button"
                                className="text-[var(--app-link)] hover:underline"
                                onClick={() => navigate({
                                    to: '/cloud/workspaces/$workspaceId',
                                    params: { workspaceId: request.workspaceId! }
                                })}
                            >
                                {request.workspaceId}
                            </button>
                        ) : 'pending'}
                    </div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Environment</div>
                    <div className="mt-1 font-medium">{request.request.environmentId ?? request.request.environment?.id ?? 'default'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Checkpoint</div>
                    <div className="mt-1 font-medium">{request.request.checkpointId ?? request.request.environment?.runtime?.checkpointId ?? 'default'}</div>
                </div>
                <div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Launch</div>
                    <div className="mt-1 font-medium">{request.request.launchMode ?? 'interactive'}</div>
                </div>
                <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Repository</div>
                    <div className="mt-1 font-medium">
                        {repository?.url ?? 'none'}
                    </div>
                    {repository ? (
                        <div className="mt-1 text-[var(--app-hint)]">{formatRef(repository.ref)}</div>
                    ) : null}
                </div>
                {request.error ? (
                    <div className="md:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-hint)]">Last Error</div>
                        <div className="mt-1 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-700">
                            <div className="font-medium">{request.error.code ?? 'error'}</div>
                            <div className="mt-1">{request.error.message}</div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
