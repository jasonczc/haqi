import type {
    DesktopHydrationState,
    CloudSecretAdapter,
    CloudSpawnPhase,
    CloudWorkspaceLeaseStatus,
    CloudWorkspaceStatus,
    RepoStatus,
    WorkspaceMode
} from '@hapi/protocol/types'

export type StoredSession = {
    id: string
    tag: string | null
    namespace: string
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    previewUrl: string | null
    todos: unknown | null
    todosUpdatedAt: number | null
    teamState: unknown | null
    teamStateUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
}

export type PreviewUrlHistoryEntry = {
    url: string
    createdAt: number
    lastUsedAt: number
}

export type StoredMachine = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredCloudSpawnRequest = {
    id: string
    namespace: string
    requestedMachineId: string | null
    selectedMachineId: string | null
    phase: CloudSpawnPhase
    request: unknown
    workspaceId: string | null
    sessionId: string | null
    reusedWorkspace: boolean
    createdAt: number
    updatedAt: number
    startedAt: number | null
    completedAt: number | null
    error: unknown | null
}

export type StoredCloudWorkspace = {
    id: string
    namespace: string
    machineId: string | null
    key: string | null
    name: string | null
    mode: WorkspaceMode | null
    status: CloudWorkspaceStatus
    source: unknown | null
    path: string | null
    repoVolumePath: string | null
    desktopStateVolumePath: string | null
    environmentId: string | null
    environmentVersion: string | null
    environment: unknown | null
    checkpointId: string | null
    workspaceBranch: string | null
    repoStatus: RepoStatus | null
    desktopState: DesktopHydrationState | null
    reused: boolean
    lastLeaseId: string | null
    lastUsedAt: number | null
    createdAt: number
    updatedAt: number
    error: unknown | null
}

export type StoredCloudWorkspaceLease = {
    id: string
    namespace: string
    workspaceId: string
    requestId: string | null
    machineId: string
    sessionId: string | null
    status: CloudWorkspaceLeaseStatus
    createdAt: number
    updatedAt: number
    expiresAt: number | null
    releasedAt: number | null
}

export type StoredCloudSecret = {
    id: string
    namespace: string
    name: string
    description: string | null
    mountAs: 'env' | 'file' | null
    envName: string | null
    filePath: string | null
    adapter: CloudSecretAdapter | null
    encryptedValue: string
    createdAt: number
    updatedAt: number
    lastAccessedAt: number | null
}

export type StoredCloudSecretAccessEvent = {
    id: string
    namespace: string
    secretId: string
    secretName: string
    requestId: string | null
    machineId: string | null
    sessionId: string | null
    createdAt: number
}

export type StoredCloudWorkerEnrollmentToken = {
    id: string
    namespace: string
    label: string | null
    machineId: string | null
    tokenHash: string
    tokenPreview: string
    createdAt: number
    expiresAt: number | null
    revokedAt: number | null
}

export type StoredCloudWorkerSessionToken = {
    id: string
    namespace: string
    machineId: string | null
    enrollmentTokenId: string | null
    tokenHash: string
    tokenPreview: string
    createdAt: number
    updatedAt: number
    expiresAt: number | null
    revokedAt: number | null
    lastUsedAt: number | null
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type StoredConversationTurn = {
    id: string
    sessionId: string
    turnIndex: number
    status: 'open' | 'closed'
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

export type StoredGroup = {
    id: string
    namespace: string
    name: string
    description: string | null
    noteSessionId: string | null
    createdAt: number
    updatedAt: number
}

export type StoredGroupMember = {
    id: number
    groupId: string
    namespace: string
    memberType: 'session' | 'human'
    sessionId: string | null
    userId: number | null
    role: string
    createdAt: number
}

export type StoredGroupMessageType = 'chat' | 'command' | 'task_state' | 'note_state' | 'system'

export type StoredGroupMessage = {
    id: string
    groupId: string
    namespace: string
    seq: number
    type: StoredGroupMessageType
    traceId: string | null
    taskId: string | null
    source: string
    actorSessionId: string | null
    actorName: string | null
    targetSessionIds: string[] | null
    quotedMessageId: string | null
    payload: unknown
    createdAt: number
}

export type StoredGroupConversationTurn = {
    id: string
    groupId: string
    namespace: string
    turnIndex: number
    status: 'open' | 'closed'
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

export type StoredGroupTaskStatus =
    | 'pending'
    | 'enqueued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'canceled'
    | 'manual_done'

export type StoredGroupTask = {
    id: string
    groupId: string
    namespace: string
    traceId: string
    source: string
    targetSessionId: string
    command: string
    status: StoredGroupTaskStatus
    dedupeKey: string | null
    expiresAt: number | null
    createdAt: number
    updatedAt: number
    startedAt: number | null
    completedAt: number | null
    error: string | null
}

export type StoredGroupNote = {
    groupId: string
    namespace: string
    content: string
    version: number
    updatedBy: string | null
    updatedAt: number
}

export type StoredReport = {
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
}

export type StoredReportAsset = {
    id: string
    reportId: string
    namespace: string
    fileName: string
    storageKey: string
    mimeType: string
    size: number
    caption: string | null
    createdAt: number
}

export type StoredReportShare = {
    id: string
    reportId: string
    namespace: string
    token: string
    createdBy: string | null
    createdAt: number
    expiresAt: number | null
    revokedAt: number | null
}

export type StoredUser = {
    id: number
    platform: string
    platformUserId: string
    namespace: string
    createdAt: number
}

export type StoredPushSubscription = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

// ---- ReviewLoop types ----

export type StoredReviewLoopStatus =
    | 'executing'
    | 'reviewing'
    | 'waiting_user'
    | 'paused'
    | 'accepted'
    | 'aborted'
    | 'canceled'

export type StoredReviewLoopUserPreference = 'auto' | 'verbose' | 'silent'

export type StoredReviewLoop = {
    id: string
    namespace: string
    workerSessionId: string
    reviewerSessionId: string
    requirement: string
    acceptanceCriteria: string
    status: StoredReviewLoopStatus
    userPreference: StoredReviewLoopUserPreference
    currentRound: number
    maxRounds: number
    createdAt: number
    updatedAt: number
}

export type StoredReviewRoundStatus =
    | 'instructed'
    | 'executing'
    | 'executed'
    | 'reviewed'
    | 'user_pending'

export type StoredReviewRound = {
    id: string
    loopId: string
    namespace: string
    round: number
    instruction: string
    workerOutput: unknown | null
    verdict: unknown | null
    status: StoredReviewRoundStatus
    startedAt: number
    completedAt: number | null
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
