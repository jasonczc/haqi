import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SpawnResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import type {
    AgentFlavor,
    EnvironmentTemplate,
    ExecutionBackend,
    RuntimeKind,
    WorkerResources,
    WorkspaceSource,
    WorkspaceSpec,
} from '@hapi/protocol/types'
import type { NetworkMode } from '@hapi/protocol/schemas'

type SpawnInput = {
    machineId: string
    directory?: string
    agent?: AgentFlavor
    model?: string
    thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'max' | 'xhigh'
    serviceTier?: 'fast' | 'flex'
    yolo?: boolean
    sessionType?: 'simple' | 'worktree' | 'setup'
    worktreeName?: string
    previewUrl?: string
    executionBackend?: ExecutionBackend
    runtimeKind?: RuntimeKind
    launchMode?: 'interactive' | 'background'
    environmentId?: string
    environment?: EnvironmentTemplate
    checkpointId?: string
    repoSyncPolicy?: 'fetch-reset'
    workspaceSource?: WorkspaceSource
    workspace?: WorkspaceSpec
    resources?: WorkerResources
    networkPolicy?: NetworkMode
    ttlMinutes?: number
    persistentWorkspace?: boolean
    secrets?: string[]
    labels?: string[]
    preview?: {
        autoDetect?: boolean
        preferredPort?: number
    }
}

export function useSpawnSession(api: ApiClient | null): {
    spawnSession: (input: SpawnInput) => Promise<SpawnResponse>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (input: SpawnInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.spawnSession(input.machineId, {
                directory: input.directory,
                agent: input.agent,
                model: input.model,
                thinkEffort: input.thinkEffort,
                serviceTier: input.serviceTier,
                yolo: input.yolo,
                sessionType: input.sessionType,
                worktreeName: input.worktreeName,
                previewUrl: input.previewUrl,
                executionBackend: input.executionBackend,
                runtimeKind: input.runtimeKind,
                launchMode: input.launchMode,
                environmentId: input.environmentId,
                environment: input.environment,
                checkpointId: input.checkpointId,
                repoSyncPolicy: input.repoSyncPolicy,
                workspaceSource: input.workspaceSource,
                workspace: input.workspace,
                resources: input.resources,
                networkPolicy: input.networkPolicy,
                ttlMinutes: input.ttlMinutes,
                persistentWorkspace: input.persistentWorkspace,
                secrets: input.secrets,
                labels: input.labels,
                preview: input.preview
            })
        },
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            if (result.type === 'accepted') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
            }
        },
    })

    return {
        spawnSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? 'Failed to spawn session' : null,
    }
}
