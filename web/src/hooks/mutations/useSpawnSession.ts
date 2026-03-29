import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SpawnResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import type {
    AgentFlavor,
    EnvironmentTemplate,
    NetworkMode,
    RuntimeKind,
    WorkerResources,
    WorkspaceSource,
    WorkspaceSpec,
} from '@hapi/protocol/types'

type SpawnInput = {
    machineId: string
    directory?: string
    agent?: AgentFlavor
    model?: string
    thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'max' | 'xhigh'
    serviceTier?: 'fast' | 'flex'
    yolo?: boolean
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    previewUrl?: string
    runtimeKind?: RuntimeKind
    environmentId?: string
    environment?: EnvironmentTemplate
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
            return await api.spawnSession(
                input.machineId,
                input.directory,
                input.agent,
                input.model,
                input.thinkEffort,
                input.serviceTier,
                input.yolo,
                input.sessionType,
                input.worktreeName,
                input.previewUrl,
                input.runtimeKind,
                input.environmentId,
                input.environment,
                input.workspaceSource,
                input.workspace,
                input.resources,
                input.networkPolicy,
                input.ttlMinutes,
                input.persistentWorkspace,
                input.secrets,
                input.labels,
                input.preview
            )
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        },
    })

    return {
        spawnSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? 'Failed to spawn session' : null,
    }
}
