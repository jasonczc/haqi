import type {
    AgentFlavor,
    CloudWorkspaceLeaseBinding,
    EnvironmentTemplate,
    ExecutionBackend,
    NetworkMode,
    ResolvedSecret,
    RuntimeKind,
    WorkerResources,
    WorkspaceSource,
    WorkspaceSpec,
} from '@hapi/protocol/types'

export interface SpawnSessionOptions {
    machineId?: string
    directory?: string
    sessionId?: string
    resumeSessionId?: string
    approvedNewDirectoryCreation?: boolean
    agent?: AgentFlavor
    model?: string
    thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'max' | 'xhigh'
    serviceTier?: 'fast' | 'flex'
    yolo?: boolean
    token?: string
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    executionBackend?: ExecutionBackend
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
    spawnRequestId?: string
    resolvedEnvironment?: EnvironmentTemplate
    workspaceLease?: CloudWorkspaceLeaseBinding
    resolvedSecrets?: ResolvedSecret[]
}

export type SpawnSessionResult =
    | { type: 'success'; sessionId: string; requestId?: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string; errorCode?: string }
