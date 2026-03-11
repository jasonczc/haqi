import type {
    DecryptedMessage as ProtocolDecryptedMessage,
    MachineMapping,
    ProviderProfile,
    Session,
    SessionSummary,
    SyncEvent as ProtocolSyncEvent,
    WorktreeMetadata
} from '@hapi/protocol/types'

export type {
    AgentState,
    AttachmentMetadata,
    MachineMapping,
    ProviderProfile,
    ModelMode,
    PermissionMode,
    Session,
    SessionSummary,
    SessionSummaryMetadata,
    TodoItem,
    WorktreeMetadata
} from '@hapi/protocol/types'

export type SessionMetadataSummary = {
    path: string
    host: string
    version?: string
    name?: string
    model?: string
    thinkEffort?: string
    serviceTier?: string
    collaborationMode?: string
    availableModels?: string[]
    os?: string
    summary?: { text: string; updatedAt: number }
    machineId?: string
    tools?: string[]
    flavor?: string | null
    worktree?: WorktreeMetadata
}

export type MessageStatus = 'sending' | 'sent' | 'failed'

export type DecryptedMessage = ProtocolDecryptedMessage & {
    status?: MessageStatus
    originalText?: string
}

export type Machine = {
    id: string
    active: boolean
    metadata: {
        host: string
        platform: string
        happyCliVersion: string
        displayName?: string
        mappings?: MachineMapping[]
    } | null
}

export type AuthResponse = {
    token: string
    user: {
        id: number
        username?: string
        firstName?: string
        lastName?: string
    }
}

export type SessionsResponse = { sessions: SessionSummary[] }
export type SessionResponse = { session: Session }
export type SessionPreviewUrlResponse = { ok: true; previewUrl: string | null }
export type PreviewUrlHistoryResponse = {
    urls: string[]
    entries?: Array<{ url: string; createdAt: number; lastUsedAt: number }>
}
export type MessagesResponse = {
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type ConversationTurnStatus = 'open' | 'closed'

export type ConversationTurn = {
    id: string
    sessionId: string
    turnIndex: number
    status: ConversationTurnStatus
    userMessageId: string | null
    userSeq: number | null
    agentStartSeq: number | null
    agentEndSeq: number | null
    messageCount: number
    userPreview: string | null
    assistantPreview: string | null
    createdAt: number
    updatedAt: number
}

export type ConversationTurnsResponse = {
    turns: ConversationTurn[]
    page: {
        limit: number
        beforeTurnIndex: number | null
        nextBeforeTurnIndex: number | null
        hasMore: boolean
    }
}

export type ConversationTurnMessagesResponse = {
    turn: ConversationTurn
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
        startSeq: number | null
        endSeq: number | null
    }
}

export type MachinesResponse = { machines: Machine[] }
export type MachinePathsExistsResponse = { exists: Record<string, boolean> }
export type MachineMappingsResponse = { mappings: MachineMapping[] }
export type ImportMachineMappingsResponse = {
    provider: 'ngrok'
    mappings: MachineMapping[]
    imported: number
}
export type RefreshMachineMappingsResponse = { mappings: MachineMapping[] }
export type ProviderSettingsResponse = { providers: ProviderProfile[] }
export type UpdateProviderResponse = { provider: ProviderProfile }

export type GroupTimelineMessageType = 'chat' | 'command' | 'task_state' | 'note_state' | 'system'

export type GroupTimelineMessage = {
    id: string
    groupId: string
    namespace: string
    seq: number
    type: GroupTimelineMessageType
    traceId?: string
    taskId?: string
    source: string
    actorSessionId?: string
    actorName?: string
    targetSessionIds?: string[]
    payload: unknown
    createdAt: number
    // Quote support
    quotedMessageId?: string
    quotedMessage?: {
        id: string
        text: string
        actorName?: string
        createdAt: number
    }
}

export type GroupConversationTurnStatus = 'open' | 'closed'

export type GroupConversationTurn = {
    id: string
    groupId: string
    namespace: string
    turnIndex: number
    status: GroupConversationTurnStatus
    initiatorMessageId: string | null
    initiatorSeq: number | null
    initiatorSource: string | null
    initiatorActorSessionId: string | null
    responderStartSeq: number | null
    responderEndSeq: number | null
    messageCount: number
    initiatorPreview: string | null
    responderPreview: string | null
    createdAt: number
    updatedAt: number
}

export type GroupConversationTurnsResponse = {
    turns: GroupConversationTurn[]
    page: {
        limit: number
        beforeTurnIndex: number | null
        nextBeforeTurnIndex: number | null
        hasMore: boolean
    }
}

export type GroupConversationTurnMessagesResponse = {
    turn: GroupConversationTurn
    messages: GroupTimelineMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
        startSeq: number | null
        endSeq: number | null
    }
}

export type GroupTaskStatus =
    | 'pending'
    | 'enqueued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'canceled'
    | 'manual_done'

export type GroupTask = {
    id: string
    groupId: string
    namespace: string
    traceId: string
    source: string
    targetSessionId: string
    command: string
    status: GroupTaskStatus
    dedupeKey: string | null
    expiresAt: number | null
    createdAt: number
    updatedAt: number
    startedAt: number | null
    completedAt: number | null
    error: string | null
}

export type Group = {
    id: string
    namespace: string
    name: string
    description: string | null
    noteSessionId: string | null
    notePrompt: string | null
    createdAt: number
    updatedAt: number
}

export type GroupMember = {
    id: number
    groupId: string
    namespace: string
    memberType: 'session' | 'human'
    sessionId: string | null
    userId: number | null
    role: string
    createdAt: number
}

export type GroupNote = {
    groupId: string
    namespace: string
    content: string
    version: number
    updatedBy: string | null
    updatedAt: number
}

export type GroupDetail = {
    group: Group
    members: GroupMember[]
    note: GroupNote | null
}

export type GroupsResponse = {
    groups: GroupDetail[]
}

export type GroupResponse = {
    group: GroupDetail
}

export type GroupMessagesResponse = {
    messages: GroupTimelineMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type GroupTasksResponse = {
    tasks: GroupTask[]
}

export type CreateGroupResponse = {
    group: GroupDetail
}

export type AddGroupMemberResponse = {
    group: GroupDetail
}

export type RemoveGroupMemberResponse = {
    group: GroupDetail
}

export type UpdateGroupResponse = {
    group: GroupDetail
}

export type PostGroupMessageResponse = {
    message: GroupTimelineMessage
    createdTasks: GroupTask[]
}

export type GroupNoteResponse = {
    note: GroupNote | null
}

export type UpdateGroupNoteResponse = {
    note: GroupNote
}

export type RefreshGroupNoteResponse = {
    triggered: boolean
    reason?: string
}

export type GroupTaskActionResponse = {
    task: GroupTask
}

export type Swarm = {
    id: string
    namespace: string
    title: string
    status: string
    currentPhase: string
    latestOutcomePreview?: string | null
    createdBy: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmSubject = {
    id: string
    swarmId: string
    namespace: string
    kind: string
    summary: string
    successCriteria: string | null
    constraints: unknown | null
    status: string
    createdAt: number
    updatedAt: number
}

export type SwarmParticipant = {
    id: string
    swarmId: string
    namespace: string
    kind: 'human' | 'agent' | 'service'
    refId: string | null
    provider: string | null
    model: string | null
    capabilities: string[] | null
    availability: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmOutcome = {
    id: string
    swarmId: string
    subjectId: string | null
    workItemId: string | null
    namespace: string
    kind: string
    status: string
    createdByParticipantId: string | null
    content: unknown | null
    artifactRefs: string[] | null
    createdAt: number
    updatedAt: number
}

export type SwarmWorkItem = {
    id: string
    swarmId: string
    subjectId: string | null
    namespace: string
    title: string
    intent: string | null
    status: string
    assignedParticipantId: string | null
    expectedArtifact: string | null
    doneCriteria: string | null
    lastDispatchAt: number | null
    createdAt: number
    updatedAt: number
}

export type SwarmArtifact = {
    id: string
    swarmId: string
    workItemId: string | null
    namespace: string
    kind: string
    title: string
    content: unknown | null
    url: string | null
    status: string
    createdAt: number
    updatedAt: number
}

export type SwarmTransition = {
    id: string
    swarmId: string
    namespace: string
    entityType: string
    entityId: string
    fromState: string | null
    toState: string
    reason: string | null
    byParticipantId: string | null
    createdAt: number
}

export type SwarmEvent = {
    id: string
    swarmId: string
    namespace: string
    type: string
    payload: unknown | null
    createdAt: number
}

export type SwarmEffect = {
    id: string
    swarmId: string
    workItemId: string | null
    namespace: string
    kind: string
    summary: string | null
    data: unknown | null
    raw: unknown | null
    createdAt: number
}

export type SwarmActivity = {
    id: string
    swarmId: string
    subjectId: string | null
    workItemId: string | null
    namespace: string
    kind: string
    status: string
    participantId: string | null
    content: unknown | null
    createdAt: number
    updatedAt: number
}

export type SwarmRoleBinding = {
    id: string
    swarmId: string
    namespace: string
    participantId: string
    role: string
    phase: string | null
    status: string
    createdAt: number
    updatedAt: number
}

export type SwarmRoleBindingHistory = {
    id: string
    swarmId: string
    namespace: string
    participantId: string
    role: string
    phase: string | null
    action: string
    reason: string | null
    createdAt: number
}

export type SwarmRoleProfile = {
    id: string
    swarmId: string
    namespace: string
    role: string
    instructionText: string | null
    preferredSkillIds: string[] | null
    allowedTools: string[] | null
    outputContract: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmThread = {
    id: string
    swarmId: string
    namespace: string
    title: string
    kind: string
    status: string
    summary: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmPolicy = {
    id: string
    swarmId: string
    namespace: string
    kind: string
    status: string
    config: unknown | null
    createdAt: number
    updatedAt: number
}

export type SwarmReview = {
    id: string
    swarmId: string
    workItemId: string | null
    artifactId: string | null
    namespace: string
    status: string
    verdict: string | null
    summary: string | null
    createdByParticipantId: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmThreadEntry = {
    id: string
    swarmId: string
    threadId: string
    namespace: string
    kind: string
    participantId: string | null
    replyToEntryId: string | null
    citesEntryIds: string[] | null
    content: unknown | null
    createdAt: number
    updatedAt: number
}

export type SwarmWorkItemAssignment = {
    id: string
    swarmId: string
    workItemId: string
    participantId: string
    namespace: string
    status: string
    assignedAt: number
    unassignedAt: number | null
    reason: string | null
    createdAt: number
    updatedAt: number
}

export type SwarmParticipantLease = {
    id: string
    swarmId: string
    workItemId: string
    participantId: string
    namespace: string
    status: string
    assignedAt: number
    lastHeartbeatAt: number | null
    expiresAt: number | null
    releasedAt: number | null
    createdAt: number
    updatedAt: number
}

export type SwarmDetail = {
    swarm: Swarm
    subject: SwarmSubject | null
    participants: SwarmParticipant[]
    activities: SwarmActivity[]
    roleBindings: SwarmRoleBinding[]
    roleBindingHistory: SwarmRoleBindingHistory[]
    roleProfiles: SwarmRoleProfile[]
    threads: SwarmThread[]
    threadEntries: SwarmThreadEntry[]
    policies: SwarmPolicy[]
    reviews: SwarmReview[]
    assignments: SwarmWorkItemAssignment[]
    leases: SwarmParticipantLease[]
    outcomes: SwarmOutcome[]
    workItems: SwarmWorkItem[]
    artifacts: SwarmArtifact[]
    transitions: SwarmTransition[]
    effects: SwarmEffect[]
    events: SwarmEvent[]
}

export type SwarmsResponse = {
    swarms: Swarm[]
}

export type SwarmResponse = {
    swarm: SwarmDetail
}

export type SwarmSubjectResponse = {
    subject: SwarmSubject | null
}

export type SwarmParticipantsResponse = {
    participants: SwarmParticipant[]
}

export type SwarmParticipantResponse = {
    participant: SwarmParticipant
}

export type SwarmOutcomesResponse = {
    outcomes: SwarmOutcome[]
}

export type SwarmOutcomeResponse = {
    outcome: SwarmOutcome
}

export type SwarmWorkItemsResponse = {
    workItems: SwarmWorkItem[]
}

export type SwarmWorkItemResponse = {
    workItem: SwarmWorkItem
}

export type SwarmArtifactsResponse = {
    artifacts: SwarmArtifact[]
}

export type SwarmArtifactResponse = {
    artifact: SwarmArtifact
}

export type SwarmTransitionsResponse = {
    transitions: SwarmTransition[]
}

export type SwarmTransitionResponse = {
    transition: SwarmTransition
}

export type SwarmEventsResponse = {
    events: SwarmEvent[]
}

export type SwarmEffectsResponse = {
    effects: SwarmEffect[]
}

export type GlobalMemory = {
    path: string
    content: string
    updatedAt: number
    bytes: number
    enabled: boolean
    pureContextMode: boolean
}

export type MemoryResponse = {
    memory: GlobalMemory
}

export type UpdateMemoryResponse = {
    memory: GlobalMemory
}

export type ReportDomainSettings = {
    value: string
    source: 'env' | 'file' | 'default'
    envOverride: boolean
}

export type ReportDomainResponse = {
    settings: ReportDomainSettings
}

export type ReportSummary = {
    id: string
    namespace: string
    sessionId: string | null
    taskId: string | null
    title: string
    status: string
    markdown: string
    metadata: unknown | null
    createdAt: number
    updatedAt: number
    reportUrl: string
    publicShareUrl: string | null
    assets: Array<{
        id: string
        reportId: string
        namespace: string
        fileName: string
        storageKey: string
        mimeType: string
        size: number
        caption: string | null
        createdAt: number
        assetUrl: string
        markdownRef: string
    }>
    shares: Array<{
        id: string
        reportId: string
        namespace: string
        token: string
        createdBy: string | null
        createdAt: number
        expiresAt: number | null
        revokedAt: number | null
        active: boolean
        shareUrl: string
    }>
}

export type ReportsResponse = {
    reports: ReportSummary[]
}

export type ProjectOfflineSettingsResponse = {
    directories: string[]
}

export type UsageTotals = {
    inputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export type UsageCostEstimate = {
    currency: 'USD'
    unit: 'usd_per_million_tokens'
    usdPerMillionTokens: number
    allTimeUsd: number
    last30DaysUsd: number
    approximate: true
    rateSource: 'litelm' | 'env' | 'default'
    pricingModel?: string
    pricingFetchedAt?: number
}

export type UsageProviderOverview = {
    provider: 'claude' | 'codex'
    available: boolean
    roots: string[]
    filesScanned: number
    parseErrors: number
    eventCount: number
    last30DaysEventCount: number
    allTime: UsageTotals
    last30Days: UsageTotals
    estimatedCost?: UsageCostEstimate
}

export type UsageOverview = {
    generatedAt: number
    windowDays: number
    claude: UsageProviderOverview
    codex: UsageProviderOverview
}

export type UsageOverviewResponse = {
    success: boolean
    overview?: UsageOverview
    error?: string
}

export type SessionUsageProvider = 'claude' | 'codex' | 'unknown'

export type SessionUsageSourceCounts = {
    claudeAssistantMessages: number
    codexTokenEvents: number
}

export type SessionUsageOverview = {
    sessionId: string
    provider: SessionUsageProvider
    generatedAt: number
    messageCount: number
    usageEventCount: number
    parseErrors: number
    allTime: UsageTotals
    latest: UsageTotals | null
    lastUsageAt: number | null
    sourceCounts: SessionUsageSourceCounts
}

export type SessionUsageResponse = {
    success: boolean
    usage?: SessionUsageOverview
    error?: string
}

export type SpawnResponse =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string }

export type GitCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type QueueSummary = {
    pendingCount: number
    inQueue: boolean
    taskRunning: boolean
    nextPreview?: string
}

export type QueueEntry = {
    id: string
    index: number
    preview: string
    fullText?: string
    modeHash: string
    isolate: boolean
    deferredUserMessage?: boolean
    enqueuedAt: number
}

export type QueueState = QueueSummary & {
    entries: QueueEntry[]
}

export type QueueResponse = {
    success: boolean
    error?: string
    sessionId?: string
    queue?: QueueState
    removedId?: string
    movedId?: string
    clearedCount?: number
}

export type QueueStatusResponse = {
    success: boolean
    message?: string
    error?: string
    queue?: QueueSummary
}

// Backward-compat aliases (to be removed later)
export type CodexQueueSummary = QueueSummary
export type CodexQueueEntry = QueueEntry
export type CodexQueueState = QueueState
export type CodexQueueResponse = QueueResponse
export type CodexStatusResponse = QueueStatusResponse

export type FileSearchItem = {
    fileName: string
    filePath: string
    fullPath: string
    fileType: 'file' | 'folder'
}

export type FileSearchResponse = {
    success: boolean
    files?: FileSearchItem[]
    error?: string
}

export type DirectoryEntry = {
    name: string
    type: 'file' | 'directory' | 'other'
    size?: number
    modified?: number
}

export type ListDirectoryResponse = {
    success: boolean
    entries?: DirectoryEntry[]
    error?: string
}

export type FileReadResponse = {
    success: boolean
    content?: string
    size?: number
    truncated?: boolean
    error?: string
}

export type UploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type DeleteUploadResponse = {
    success: boolean
    error?: string
}

export type GitFileStatus = {
    fileName: string
    filePath: string
    fullPath: string
    repo?: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}

export type GitRepoStatus = {
    name: string
    branch: string | null
}

export type GitStatusFiles = {
    stagedFiles: GitFileStatus[]
    unstagedFiles: GitFileStatus[]
    branch: string | null
    repos: GitRepoStatus[]
    totalStaged: number
    totalUnstaged: number
}

export type SlashCommand = {
    name: string
    description?: string
    source: 'builtin' | 'user' | 'plugin'
    content?: string  // Expanded content for Codex user prompts
    pluginName?: string
}

export type SlashCommandsResponse = {
    success: boolean
    commands?: SlashCommand[]
    error?: string
}

export type SkillSummary = {
    name: string
    description?: string
}

export type SkillsResponse = {
    success: boolean
    skills?: SkillSummary[]
    error?: string
}

export type SwarmSkillsResponse = {
    success: boolean
    skills: SkillSummary[]
}

export type McpServerSummary = {
    name: string
    status: string
    available: boolean
    enabled?: boolean
    connected?: boolean
    transport?: 'http' | 'stdio' | 'sse' | 'unknown'
    target?: string
    auth?: string
    source?: 'cli-config' | 'runtime-bridge' | 'combined'
}

export type McpServersResponse = {
    success: boolean
    flavor?: string
    servers?: McpServerSummary[]
    checkedAt?: number
    warning?: string
    error?: string
}

export type PushSubscriptionKeys = {
    p256dh: string
    auth: string
}

export type PushSubscriptionPayload = {
    endpoint: string
    keys: PushSubscriptionKeys
}

export type PushUnsubscribePayload = {
    endpoint: string
}

export type PushVapidPublicKeyResponse = {
    publicKey: string
}

export type VisibilityPayload = {
    subscriptionId: string
    visibility: 'visible' | 'hidden'
}

export type SyncEvent = ProtocolSyncEvent
