import { z } from 'zod'
import { MODEL_MODES, PERMISSION_MODES } from './modes'

export const PermissionModeSchema = z.enum(PERMISSION_MODES)
export const ModelModeSchema = z.enum(MODEL_MODES)

const MetadataSummarySchema = z.object({
    text: z.string(),
    updatedAt: z.number()
})

export const WorktreeMetadataSchema = z.object({
    basePath: z.string(),
    branch: z.string(),
    name: z.string(),
    worktreePath: z.string().optional(),
    createdAt: z.number().optional()
})

export type WorktreeMetadata = z.infer<typeof WorktreeMetadataSchema>

export const ExecutionBackendSchema = z.enum([
    'local',
    'cloud-self-hosted',
    'cloud-managed'
])

export type ExecutionBackend = z.infer<typeof ExecutionBackendSchema>

export const RuntimeKindSchema = z.enum([
    'host-process',
    'docker-session'
])

export type RuntimeKind = z.infer<typeof RuntimeKindSchema>

export const WorkerLifecycleSchema = z.enum([
    'provisioning',
    'booting',
    'ready',
    'preparing-workspace',
    'busy',
    'idle',
    'draining',
    'shutting-down',
    'stopping',
    'stopped',
    'failed'
])

export type WorkerLifecycle = z.infer<typeof WorkerLifecycleSchema>

export const PreviewVisibilitySchema = z.enum([
    'private',
    'public'
])

export type PreviewVisibility = z.infer<typeof PreviewVisibilitySchema>

export const NetworkModeSchema = z.enum([
    'default',
    'restricted',
    'off'
])

export type NetworkMode = z.infer<typeof NetworkModeSchema>

export const AgentFlavorSchema = z.enum([
    'claude',
    'codex',
    'cursor',
    'gemini',
    'opencode'
])

export type AgentFlavor = z.infer<typeof AgentFlavorSchema>

export const WorkerResourcesSchema = z.object({
    cpu: z.number().positive().optional(),
    memoryMb: z.number().int().positive().optional(),
    diskGb: z.number().int().positive().optional(),
    gpu: z.number().int().nonnegative().optional()
})

export type WorkerResources = z.infer<typeof WorkerResourcesSchema>

export const RepoCacheSchema = z.object({
    enabled: z.boolean(),
    rootPath: z.string().optional()
})

export type RepoCache = z.infer<typeof RepoCacheSchema>

export const WorkerCapabilitiesSchema = z.object({
    docker: z.boolean().optional(),
    nestedDocker: z.boolean().optional(),
    gitLfs: z.boolean().optional(),
    submodules: z.boolean().optional(),
    previewPorts: z.boolean().optional(),
    persistentWorkspace: z.boolean().optional(),
    snapshotRestore: z.boolean().optional(),
    internetAccess: z.boolean().optional(),
    serviceContainers: z.boolean().optional(),
    dockerSession: z.boolean().optional(),
    maxConcurrentSessions: z.number().int().positive().optional(),
    supportedAgents: z.array(AgentFlavorSchema).optional(),
    resources: WorkerResourcesSchema.optional()
})

export type WorkerCapabilities = z.infer<typeof WorkerCapabilitiesSchema>

export const RepositoryRefSchema = z.object({
    branch: z.string().optional(),
    tag: z.string().optional(),
    commit: z.string().optional(),
    pr: z.string().optional()
})

export type RepositoryRef = z.infer<typeof RepositoryRefSchema>

export const RepositorySpecSchema = z.object({
    url: z.string().min(1),
    provider: z.enum(['github', 'gitlab', 'bitbucket', 'generic']).optional(),
    ref: RepositoryRefSchema.optional(),
    subdirectory: z.string().optional(),
    cloneDepth: z.number().int().positive().optional(),
    withSubmodules: z.boolean().optional(),
    withLfs: z.boolean().optional(),
    credentialsSecretRef: z.string().min(1).optional()
})

export type RepositorySpec = z.infer<typeof RepositorySpecSchema>

export const WorkspaceModeSchema = z.enum([
    'ephemeral',
    'persistent',
    'snapshot-derived'
])

export type WorkspaceMode = z.infer<typeof WorkspaceModeSchema>

export const WorkspaceSpecSchema = z.object({
    mode: WorkspaceModeSchema.optional(),
    name: z.string().optional(),
    baseDir: z.string().optional()
})

export type WorkspaceSpec = z.infer<typeof WorkspaceSpecSchema>

export const WorkspaceSourceSchema = z.object({
    type: z.enum(['path', 'repo', 'session-clone']).optional(),
    directory: z.string().optional(),
    repository: RepositorySpecSchema.optional(),
    sourceSessionId: z.string().optional()
})

export type WorkspaceSource = z.infer<typeof WorkspaceSourceSchema>

export const SecretRefSchema = z.object({
    name: z.string().min(1),
    mountAs: z.enum(['env', 'file']).optional(),
    envName: z.string().optional(),
    filePath: z.string().optional(),
    required: z.boolean().optional()
})

export type SecretRef = z.infer<typeof SecretRefSchema>

export const EnvironmentServicePortSchema = z.object({
    name: z.string().optional(),
    containerPort: z.number().int().positive(),
    hostPort: z.number().int().positive().optional(),
    protocol: z.enum(['tcp', 'udp']).optional(),
    expose: z.boolean().optional(),
    public: z.boolean().optional()
})

export type EnvironmentServicePort = z.infer<typeof EnvironmentServicePortSchema>

export const EnvironmentServiceHealthcheckSchema = z.object({
    type: z.enum(['tcp', 'http', 'command']),
    port: z.number().int().positive().optional(),
    path: z.string().optional(),
    command: z.array(z.string()).optional(),
    intervalMs: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional()
})

export type EnvironmentServiceHealthcheck = z.infer<typeof EnvironmentServiceHealthcheckSchema>

export const EnvironmentServiceSchema = z.object({
    name: z.string().min(1),
    image: z.string().min(1),
    command: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    ports: z.array(EnvironmentServicePortSchema).optional(),
    volumes: z.array(z.string()).optional(),
    healthcheck: EnvironmentServiceHealthcheckSchema.optional(),
    restartPolicy: z.enum(['no', 'on-failure', 'always', 'unless-stopped']).optional()
})

export type EnvironmentService = z.infer<typeof EnvironmentServiceSchema>

export const EnvironmentTerminalSchema = z.object({
    name: z.string().min(1),
    command: z.string().min(1)
})

export type EnvironmentTerminal = z.infer<typeof EnvironmentTerminalSchema>

export const EnvironmentCacheMountSchema = z.object({
    path: z.string().min(1),
    key: z.string().optional(),
    scope: z.enum(['repo', 'env', 'user']).optional()
})

export type EnvironmentCacheMount = z.infer<typeof EnvironmentCacheMountSchema>

export const EnvironmentRuntimeSchema = z.object({
    kind: RuntimeKindSchema.optional(),
    image: z.string().optional(),
    dockerfile: z.string().optional(),
    buildContext: z.string().optional(),
    snapshot: z.string().optional(),
    agentCanUpdateSnapshot: z.boolean().optional(),
    resources: WorkerResourcesSchema.optional(),
    networkMode: NetworkModeSchema.optional(),
    user: z.string().optional(),
    workingDir: z.string().optional()
})

export type EnvironmentRuntime = z.infer<typeof EnvironmentRuntimeSchema>

export const EnvironmentTemplateSchema = z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    source: z.enum(['builtin', 'repo', 'team', 'user']).optional(),
    runtime: EnvironmentRuntimeSchema.optional(),
    install: z.union([z.string(), z.array(z.string())]).optional(),
    start: z.union([z.string(), z.array(z.string())]).optional(),
    terminals: z.array(EnvironmentTerminalSchema).optional(),
    services: z.array(EnvironmentServiceSchema).optional(),
    ports: z.array(EnvironmentServicePortSchema).optional(),
    resources: WorkerResourcesSchema.optional(),
    network: z.object({
        mode: NetworkModeSchema.optional(),
        allowDomains: z.array(z.string()).optional()
    }).optional(),
    cache: z.array(EnvironmentCacheMountSchema).optional(),
    secrets: z.array(SecretRefSchema).optional(),
    user: z.string().optional(),
    workingDir: z.string().optional(),
    repositoryDependencies: z.array(z.string()).optional(),
    features: z.object({
        docker: z.boolean().optional(),
        node: z.boolean().optional(),
        bun: z.boolean().optional(),
        python: z.boolean().optional()
    }).optional()
})

export type EnvironmentTemplate = z.infer<typeof EnvironmentTemplateSchema>

export const CloudSpawnPhaseSchema = z.enum([
    'queued',
    'selecting-worker',
    'acquiring-workspace',
    'preparing-workspace',
    'materializing-secrets',
    'starting-session',
    'succeeded',
    'failed',
    'canceled'
])

export type CloudSpawnPhase = z.infer<typeof CloudSpawnPhaseSchema>

export const CloudWorkspaceStatusSchema = z.enum([
    'creating',
    'ready',
    'leased',
    'released',
    'expired',
    'failed'
])

export type CloudWorkspaceStatus = z.infer<typeof CloudWorkspaceStatusSchema>

export const CloudWorkspaceLeaseStatusSchema = z.enum([
    'active',
    'released',
    'expired'
])

export type CloudWorkspaceLeaseStatus = z.infer<typeof CloudWorkspaceLeaseStatusSchema>

export const CloudSecretAdapterSchema = z.enum([
    'generic',
    'git',
    'claude',
    'gemini',
    'codex'
])

export type CloudSecretAdapter = z.infer<typeof CloudSecretAdapterSchema>

export const CloudRequestErrorSchema = z.object({
    phase: CloudSpawnPhaseSchema,
    message: z.string(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    at: z.number()
})

export type CloudRequestError = z.infer<typeof CloudRequestErrorSchema>

export const ResolvedSecretSchema = z.object({
    secretId: z.string(),
    secretName: z.string(),
    mountAs: z.enum(['env', 'file']),
    envName: z.string().optional(),
    filePath: z.string().optional(),
    value: z.string(),
    adapter: CloudSecretAdapterSchema.optional()
})

export type ResolvedSecret = z.infer<typeof ResolvedSecretSchema>

export const CloudWorkspaceLeaseBindingSchema = z.object({
    leaseId: z.string(),
    workspaceId: z.string(),
    workspaceKey: z.string().optional(),
    machineId: z.string(),
    mode: WorkspaceModeSchema.optional(),
    name: z.string().optional(),
    path: z.string().optional(),
    baseDir: z.string().optional(),
    source: WorkspaceSourceSchema.optional(),
    environmentId: z.string().optional(),
    environmentVersion: z.string().optional(),
    expiresAt: z.number().optional()
})

export type CloudWorkspaceLeaseBinding = z.infer<typeof CloudWorkspaceLeaseBindingSchema>

export const PreviewTargetSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    port: z.number().int().positive(),
    url: z.string().optional(),
    visibility: PreviewVisibilitySchema.optional()
})

export type PreviewTarget = z.infer<typeof PreviewTargetSchema>

export const MetadataSchema = z.object({
    path: z.string(),
    host: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    os: z.string().optional(),
    summary: MetadataSummarySchema.optional(),
    machineId: z.string().optional(),
    claudeSessionId: z.string().optional(),
    codexSessionId: z.string().optional(),
    geminiSessionId: z.string().optional(),
    opencodeSessionId: z.string().optional(),
    cursorSessionId: z.string().optional(),
    tools: z.array(z.string()).optional(),
    slashCommands: z.array(z.string()).optional(),
    model: z.string().optional(),
    thinkEffort: z.string().optional(),
    serviceTier: z.string().optional(),
    collaborationMode: z.string().optional(),
    availableModels: z.array(z.string()).optional(),
    homeDir: z.string().optional(),
    happyHomeDir: z.string().optional(),
    happyLibDir: z.string().optional(),
    happyToolsDir: z.string().optional(),
    startedFromRunner: z.boolean().optional(),
    hostPid: z.number().optional(),
    startedBy: z.enum(['runner', 'terminal']).optional(),
    lifecycleState: z.string().optional(),
    lifecycleStateSince: z.number().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    flavor: z.string().nullish(),
    worktree: WorktreeMetadataSchema.optional(),
    executionBackend: ExecutionBackendSchema.optional(),
    runtimeKind: RuntimeKindSchema.optional(),
    workerId: z.string().optional(),
    workspaceId: z.string().optional(),
    spawnRequestId: z.string().optional(),
    workspaceSource: WorkspaceSourceSchema.optional(),
    workspaceMode: WorkspaceModeSchema.optional(),
    repositoryUrl: z.string().optional(),
    repositoryProvider: z.string().optional(),
    repositoryRef: RepositoryRefSchema.optional(),
    repositoryCommit: z.string().optional(),
    environmentId: z.string().optional(),
    environmentVersion: z.string().optional(),
    previewUrls: z.array(PreviewTargetSchema).optional(),
    serviceEndpoints: z.array(z.object({
        service: z.string(),
        host: z.string(),
        port: z.number().int().positive(),
        containerPort: z.number().int().positive(),
        url: z.string().optional()
    })).optional(),
    setupStatus: z.object({
        phase: z.string(),
        message: z.string().optional(),
        updatedAt: z.number()
    }).optional()
})

export type Metadata = z.infer<typeof MetadataSchema>

export const AgentStateRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish()
})

export type AgentStateRequest = z.infer<typeof AgentStateRequestSchema>

export const AgentStateCompletedRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish(),
    completedAt: z.number().nullish(),
    status: z.enum(['canceled', 'denied', 'approved']),
    reason: z.string().optional(),
    mode: z.string().optional(),
    decision: z.enum(['approved', 'approved_for_session', 'denied', 'abort']).optional(),
    allowTools: z.array(z.string()).optional(),
    // Flat format: Record<string, string[]> (AskUserQuestion)
    // Nested format: Record<string, { answers: string[] }> (request_user_input)
    answers: z.union([
        z.record(z.string(), z.array(z.string())),
        z.record(z.string(), z.object({ answers: z.array(z.string()) }))
    ]).optional()
})

export type AgentStateCompletedRequest = z.infer<typeof AgentStateCompletedRequestSchema>

export const AgentStateRunningAgentSchema = z.object({
    name: z.string(),
    task: z.string().optional(),
    toolUseId: z.string().optional(),
    startedAt: z.number().nullish()
})

export type AgentStateRunningAgent = z.infer<typeof AgentStateRunningAgentSchema>

export const AgentStateSchema = z.object({
    controlledByUser: z.boolean().nullish(),
    requests: z.record(z.string(), AgentStateRequestSchema).nullish(),
    completedRequests: z.record(z.string(), AgentStateCompletedRequestSchema).nullish(),
    runningAgent: AgentStateRunningAgentSchema.nullish(),
    runningAgents: z.array(AgentStateRunningAgentSchema).nullish()
})

export type AgentState = z.infer<typeof AgentStateSchema>

export const TodoItemSchema = z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']),
    id: z.string()
})

export type TodoItem = z.infer<typeof TodoItemSchema>

export const TodosSchema = z.array(TodoItemSchema)

export const TeamMemberSchema = z.object({
    name: z.string(),
    agentType: z.string().optional(),
    status: z.enum(['active', 'idle', 'shutdown']).optional()
})

export type TeamMember = z.infer<typeof TeamMemberSchema>

export const TeamTaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    owner: z.string().optional()
})

export type TeamTask = z.infer<typeof TeamTaskSchema>

export const TeamMessageSchema = z.object({
    from: z.string(),
    to: z.string(),
    summary: z.string(),
    type: z.enum(['message', 'broadcast', 'shutdown_request', 'shutdown_response']),
    timestamp: z.number()
})

export type TeamMessage = z.infer<typeof TeamMessageSchema>

export const TeamStateSchema = z.object({
    teamName: z.string(),
    description: z.string().optional(),
    members: z.array(TeamMemberSchema).optional(),
    tasks: z.array(TeamTaskSchema).optional(),
    messages: z.array(TeamMessageSchema).optional(),
    updatedAt: z.number().optional()
})

export type TeamState = z.infer<typeof TeamStateSchema>

export const TeamControlActionSchema = z.enum([
    'message',
    'shutdown_member',
    'assign_task',
    'nudge_member',
    'cleanup_team'
])

export type TeamControlAction = z.infer<typeof TeamControlActionSchema>

export const TeamControlRequestSchema = z.object({
    action: TeamControlActionSchema,
    memberName: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    message: z.string().min(1).optional()
})

export type TeamControlRequest = z.infer<typeof TeamControlRequestSchema>

export const TeamControlResponseSchema = z.object({
    ok: z.boolean(),
    accepted: z.boolean().optional(),
    mode: z.literal('lead_prompt').optional(),
    enqueuedPrompt: z.string().optional(),
    error: z.string().optional(),
    code: z.enum([
        'not_claude_session',
        'session_not_active',
        'team_not_found',
        'member_not_found',
        'task_not_found',
        'invalid_action'
    ]).optional()
})

export type TeamControlResponse = z.infer<typeof TeamControlResponseSchema>

export const AttachmentMetadataSchema = z.object({
    id: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    path: z.string(),
    previewUrl: z.string().optional()
})

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>

export const CodexCredentialSummarySchema = z.object({
    authMode: z.string().optional(),
    email: z.string().optional(),
    organizationTitle: z.string().optional(),
    planType: z.string().optional(),
    lastRefresh: z.string().optional(),
    hasOpenAiApiKey: z.boolean(),
    hasTokens: z.boolean()
})

export type CodexCredentialSummary = z.infer<typeof CodexCredentialSummarySchema>

export const CodexCredentialProfileSchema = z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    importSource: z.enum(['current-auth', 'imported-file']),
    isActive: z.boolean(),
    summary: CodexCredentialSummarySchema
})

export type CodexCredentialProfile = z.infer<typeof CodexCredentialProfileSchema>

export const CodexCredentialStateResponseSchema = z.object({
    current: z.object({
        exists: z.boolean(),
        activeProfileId: z.string().nullable(),
        summary: CodexCredentialSummarySchema.nullable()
    }),
    profiles: z.array(CodexCredentialProfileSchema)
})

export type CodexCredentialStateResponse = z.infer<typeof CodexCredentialStateResponseSchema>

export const CodexCredentialExportResponseSchema = z.object({
    content: z.string(),
    summary: CodexCredentialSummarySchema
})

export type CodexCredentialExportResponse = z.infer<typeof CodexCredentialExportResponseSchema>

export const CodexCredentialImportRequestSchema = z.object({
    content: z.string().min(1),
    name: z.string().trim().min(1).optional()
})

export type CodexCredentialImportRequest = z.infer<typeof CodexCredentialImportRequestSchema>

export const CodexCredentialSaveCurrentRequestSchema = z.object({
    name: z.string().trim().min(1).optional()
})

export type CodexCredentialSaveCurrentRequest = z.infer<typeof CodexCredentialSaveCurrentRequestSchema>

export const CodexCredentialActivateRequestSchema = z.object({
    profileId: z.string().min(1)
})

export type CodexCredentialActivateRequest = z.infer<typeof CodexCredentialActivateRequestSchema>

export const DecryptedMessageSchema = z.object({
    id: z.string(),
    seq: z.number().nullable(),
    localId: z.string().nullable(),
    content: z.unknown(),
    createdAt: z.number()
})

export type DecryptedMessage = z.infer<typeof DecryptedMessageSchema>

export const MachineMetadataSchema = z.object({
    host: z.string(),
    platform: z.string(),
    happyCliVersion: z.string(),
    displayName: z.string().optional(),
    homeDir: z.string(),
    happyHomeDir: z.string(),
    happyLibDir: z.string(),
    executorType: ExecutionBackendSchema.optional(),
    provider: z.string().optional(),
    region: z.string().optional(),
    zone: z.string().optional(),
    image: z.string().optional(),
    environmentId: z.string().optional(),
    workerVersion: z.string().optional(),
    labels: z.array(z.string()).optional(),
    capabilities: WorkerCapabilitiesSchema.optional(),
    resources: WorkerResourcesSchema.optional(),
    repoCache: RepoCacheSchema.optional()
})

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>

export const RunnerStateSchema = z.object({
    status: z.string().optional(),
    lifecycle: WorkerLifecycleSchema.optional(),
    pid: z.number().optional(),
    httpPort: z.number().optional(),
    startedAt: z.number().optional(),
    shutdownRequestedAt: z.number().optional(),
    shutdownSource: z.string().optional(),
    currentSessionId: z.string().nullable().optional(),
    capacity: z.object({
        total: z.number().int().nonnegative(),
        used: z.number().int().nonnegative()
    }).optional(),
    workspacePreparation: z.object({
        phase: z.string(),
        repo: z.string().optional(),
        ref: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        startedAt: z.number().optional(),
        updatedAt: z.number().optional()
    }).nullable().optional(),
    lastProvisionError: z.object({
        message: z.string(),
        code: z.string().optional(),
        at: z.number()
    }).nullable().optional(),
    lastWorkspaceError: z.object({
        message: z.string(),
        code: z.string().optional(),
        at: z.number()
    }).nullable().optional(),
    lastSpawnError: z.object({
        message: z.string(),
        pid: z.number().optional(),
        exitCode: z.number().nullable().optional(),
        signal: z.string().nullable().optional(),
        at: z.number()
    }).nullable().optional(),
    lastHeartbeatAt: z.number().optional(),
    publicPreviewBaseUrl: z.string().optional(),
    leaseExpiresAt: z.number().optional(),
    ttlExpiresAt: z.number().optional(),
    costHint: z.object({
        currency: z.string(),
        hourlyRate: z.number().nonnegative().optional()
    }).optional()
})

export type RunnerState = z.infer<typeof RunnerStateSchema>

export const MachineSchema = z.object({
    id: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    active: z.boolean(),
    activeAt: z.number(),
    metadata: MachineMetadataSchema.nullable(),
    metadataVersion: z.number(),
    runnerState: RunnerStateSchema.nullable(),
    runnerStateVersion: z.number()
})

export type Machine = z.infer<typeof MachineSchema>

export const MachineSpawnRequestSchema = z.object({
    directory: z.string().min(1).optional(),
    resumeSessionId: z.string().min(1).optional(),
    agent: AgentFlavorSchema.optional(),
    model: z.string().optional(),
    thinkEffort: z.enum(['auto', 'low', 'medium', 'high', 'max', 'xhigh']).optional(),
    serviceTier: z.enum(['fast', 'flex']).optional(),
    yolo: z.boolean().optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional(),
    previewUrl: z.string().optional(),
    executionBackend: ExecutionBackendSchema.optional(),
    runtimeKind: RuntimeKindSchema.optional(),
    environmentId: z.string().optional(),
    environment: EnvironmentTemplateSchema.optional(),
    workspaceSource: WorkspaceSourceSchema.optional(),
    workspace: WorkspaceSpecSchema.optional(),
    resources: WorkerResourcesSchema.optional(),
    networkPolicy: NetworkModeSchema.optional(),
    ttlMinutes: z.number().int().positive().optional(),
    persistentWorkspace: z.boolean().optional(),
    secrets: z.array(z.string().min(1)).optional(),
    labels: z.array(z.string()).optional(),
    preview: z.object({
        autoDetect: z.boolean().optional(),
        preferredPort: z.number().int().positive().optional()
    }).optional(),
    spawnRequestId: z.string().optional(),
    resolvedEnvironment: EnvironmentTemplateSchema.optional(),
    workspaceLease: CloudWorkspaceLeaseBindingSchema.optional(),
    resolvedSecrets: z.array(ResolvedSecretSchema).optional()
})

export type MachineSpawnRequest = z.infer<typeof MachineSpawnRequestSchema>

export const SpawnResponseSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('success'),
        sessionId: z.string(),
        requestId: z.string().optional()
    }),
    z.object({
        type: z.literal('accepted'),
        requestId: z.string(),
        phase: CloudSpawnPhaseSchema,
        selectedMachineId: z.string().optional()
    }),
    z.object({
        type: z.literal('error'),
        message: z.string(),
        code: z.string().optional()
    }),
    z.object({
        type: z.literal('requestToApproveDirectoryCreation'),
        directory: z.string()
    })
])

export type SpawnResponse = z.infer<typeof SpawnResponseSchema>

export const SessionSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    previewUrl: z.string().optional(),
    active: z.boolean(),
    activeAt: z.number(),
    metadata: MetadataSchema.nullable(),
    metadataVersion: z.number(),
    agentState: AgentStateSchema.nullable(),
    agentStateVersion: z.number(),
    thinking: z.boolean(),
    thinkingAt: z.number(),
    todos: TodosSchema.optional(),
    teamState: TeamStateSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    modelMode: ModelModeSchema.optional()
})

export type Session = z.infer<typeof SessionSchema>

const SessionEventBaseSchema = z.object({
    namespace: z.string().optional()
})

const SessionChangedSchema = SessionEventBaseSchema.extend({
    sessionId: z.string()
})

const MachineChangedSchema = SessionEventBaseSchema.extend({
    machineId: z.string()
})

const GroupChangedSchema = SessionEventBaseSchema.extend({
    groupId: z.string()
})

export const GroupTimelineMessageTypeSchema = z.enum([
    'chat',
    'command',
    'task_state',
    'note_state',
    'system'
])

export const GroupTimelineMessageSchema = z.object({
    id: z.string(),
    groupId: z.string(),
    namespace: z.string(),
    seq: z.number().int().nonnegative(),
    type: GroupTimelineMessageTypeSchema,
    traceId: z.string().optional(),
    taskId: z.string().optional(),
    source: z.string(),
    actorSessionId: z.string().optional(),
    actorName: z.string().optional(),
    targetSessionIds: z.array(z.string()).optional(),
    quotedMessageId: z.string().optional(),
    quotedMessage: z.object({
        id: z.string(),
        text: z.string(),
        actorName: z.string().optional(),
        createdAt: z.number()
    }).optional(),
    payload: z.unknown(),
    createdAt: z.number()
})

// ---- ReviewLoop schemas ----

export const ReviewLoopStatusSchema = z.enum([
    'executing',
    'reviewing',
    'waiting_user',
    'accepted',
    'aborted',
    'canceled'
])

export type ReviewLoopStatus = z.infer<typeof ReviewLoopStatusSchema>

export const ReviewLoopUserPreferenceSchema = z.enum([
    'auto',
    'verbose',
    'silent'
])

export type ReviewLoopUserPreference = z.infer<typeof ReviewLoopUserPreferenceSchema>

export const CriteriaItemSchema = z.object({
    criteria: z.string(),
    status: z.enum(['met', 'not_met', 'unclear']),
    note: z.string().optional()
})

export type CriteriaItem = z.infer<typeof CriteriaItemSchema>

export const ReviewVerdictActionSchema = z.enum([
    'continue',
    'pass',
    'abort',
    'notify_user'
])

export type ReviewVerdictAction = z.infer<typeof ReviewVerdictActionSchema>

export const ReviewVerdictSchema = z.object({
    action: ReviewVerdictActionSchema,
    feedback: z.string(),
    userMessage: z.string().optional(),
    progress: z.number().min(0).max(100),
    criteriaStatus: z.array(CriteriaItemSchema)
})

export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>

export const CommandResultSchema = z.object({
    command: z.string(),
    exitCode: z.number(),
    stdout: z.string(),
    stderr: z.string()
})

export type CommandResult = z.infer<typeof CommandResultSchema>

export const WorkerOutputSchema = z.object({
    rawResponse: z.string(),
    summary: z.string().optional(),
    diff: z.string(),
    filesChanged: z.array(z.string()),
    commands: z.array(CommandResultSchema),
    exitStatus: z.enum(['success', 'error'])
})

export type WorkerOutput = z.infer<typeof WorkerOutputSchema>

export const ReviewRoundStatusSchema = z.enum([
    'instructed',
    'executing',
    'executed',
    'reviewed',
    'user_pending'
])

export type ReviewRoundStatus = z.infer<typeof ReviewRoundStatusSchema>

export const ReviewLoopSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    workerSessionId: z.string(),
    reviewerSessionId: z.string(),
    requirement: z.string(),
    acceptanceCriteria: z.string(),
    status: ReviewLoopStatusSchema,
    userPreference: ReviewLoopUserPreferenceSchema,
    currentRound: z.number().int().nonnegative(),
    maxRounds: z.number().int().positive(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export type ReviewLoop = z.infer<typeof ReviewLoopSchema>

export const ReviewRoundSchema = z.object({
    id: z.string(),
    loopId: z.string(),
    namespace: z.string(),
    round: z.number().int().positive(),
    instruction: z.string(),
    workerOutput: WorkerOutputSchema.nullable(),
    verdict: ReviewVerdictSchema.nullable(),
    status: ReviewRoundStatusSchema,
    startedAt: z.number(),
    completedAt: z.number().nullable()
})

export type ReviewRound = z.infer<typeof ReviewRoundSchema>

export const CloudWorkspaceSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    machineId: z.string().optional(),
    key: z.string().optional(),
    name: z.string().optional(),
    mode: WorkspaceModeSchema.optional(),
    status: CloudWorkspaceStatusSchema,
    source: WorkspaceSourceSchema.optional(),
    path: z.string().optional(),
    environmentId: z.string().optional(),
    environmentVersion: z.string().optional(),
    environment: EnvironmentTemplateSchema.optional(),
    reused: z.boolean().optional(),
    lastLeaseId: z.string().optional(),
    lastUsedAt: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    error: CloudRequestErrorSchema.optional()
})

export type CloudWorkspace = z.infer<typeof CloudWorkspaceSchema>

export const CloudWorkspaceLeaseSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    workspaceId: z.string(),
    requestId: z.string().optional(),
    machineId: z.string(),
    sessionId: z.string().optional(),
    status: CloudWorkspaceLeaseStatusSchema,
    createdAt: z.number(),
    updatedAt: z.number(),
    expiresAt: z.number().optional(),
    releasedAt: z.number().optional()
})

export type CloudWorkspaceLease = z.infer<typeof CloudWorkspaceLeaseSchema>

export const CloudSpawnRequestSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    requestedMachineId: z.string().optional(),
    selectedMachineId: z.string().optional(),
    phase: CloudSpawnPhaseSchema,
    request: MachineSpawnRequestSchema,
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
    reusedWorkspace: z.boolean().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
    error: CloudRequestErrorSchema.optional()
})

export type CloudSpawnRequest = z.infer<typeof CloudSpawnRequestSchema>

export const CloudSecretSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mountAs: z.enum(['env', 'file']).optional(),
    envName: z.string().optional(),
    filePath: z.string().optional(),
    adapter: CloudSecretAdapterSchema.optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    lastAccessedAt: z.number().optional()
})

export type CloudSecret = z.infer<typeof CloudSecretSchema>

export const CloudSecretAccessEventSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    secretId: z.string(),
    secretName: z.string(),
    requestId: z.string().optional(),
    machineId: z.string().optional(),
    sessionId: z.string().optional(),
    createdAt: z.number()
})

export type CloudSecretAccessEvent = z.infer<typeof CloudSecretAccessEventSchema>

export const CloudWorkerEnrollmentTokenSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    label: z.string().optional(),
    machineId: z.string().optional(),
    tokenPreview: z.string(),
    createdAt: z.number(),
    expiresAt: z.number().optional(),
    revokedAt: z.number().optional()
})

export type CloudWorkerEnrollmentToken = z.infer<typeof CloudWorkerEnrollmentTokenSchema>

const ReviewLoopChangedSchema = SessionEventBaseSchema.extend({
    loopId: z.string()
})

const CloudSpawnRequestChangedSchema = SessionEventBaseSchema.extend({
    requestId: z.string()
})

const CloudWorkspaceChangedSchema = SessionEventBaseSchema.extend({
    workspaceId: z.string()
})

const CloudSecretChangedSchema = SessionEventBaseSchema.extend({
    secretId: z.string()
})

export const SyncEventSchema = z.discriminatedUnion('type', [
    SessionChangedSchema.extend({
        type: z.literal('session-added'),
        data: z.unknown().optional()
    }),
    SessionChangedSchema.extend({
        type: z.literal('session-updated'),
        data: z.unknown().optional()
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('session-removed'),
        sessionId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-received'),
        message: DecryptedMessageSchema
    }),
    MachineChangedSchema.extend({
        type: z.literal('machine-updated'),
        data: z.unknown().optional()
    }),
    CloudSpawnRequestChangedSchema.extend({
        type: z.literal('cloud-spawn-request-updated'),
        data: z.unknown().optional()
    }),
    CloudWorkspaceChangedSchema.extend({
        type: z.literal('cloud-workspace-updated'),
        data: z.unknown().optional()
    }),
    CloudSecretChangedSchema.extend({
        type: z.literal('cloud-secret-updated'),
        data: z.unknown().optional()
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-added'),
        data: z.unknown().optional()
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-updated'),
        data: z.unknown().optional()
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-removed')
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-message-received'),
        message: GroupTimelineMessageSchema
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-task-updated'),
        task: z.unknown()
    }),
    GroupChangedSchema.extend({
        type: z.literal('group-note-updated'),
        note: z.unknown()
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('toast'),
        data: z.object({
            title: z.string(),
            body: z.string(),
            sessionId: z.string(),
            url: z.string()
        })
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('heartbeat'),
        data: z.object({
            timestamp: z.number()
        }).optional()
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('connection-changed'),
        data: z.object({
            status: z.string(),
            subscriptionId: z.string().optional()
        }).optional()
    }),
    ReviewLoopChangedSchema.extend({
        type: z.literal('review-loop-added'),
        data: z.unknown().optional()
    }),
    ReviewLoopChangedSchema.extend({
        type: z.literal('review-loop-updated'),
        data: z.unknown().optional()
    }),
    ReviewLoopChangedSchema.extend({
        type: z.literal('review-loop-removed')
    }),
    ReviewLoopChangedSchema.extend({
        type: z.literal('review-loop-round-updated'),
        round: z.unknown()
    })
])

export type SyncEvent = z.infer<typeof SyncEventSchema>
