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

export type StoredSwarm = {
    id: string
    namespace: string
    title: string
    status: string
    currentPhase: string
    createdBy: string | null
    createdAt: number
    updatedAt: number
}

export type StoredSwarmSubject = {
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

export type StoredSwarmParticipant = {
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

export type StoredSwarmOutcome = {
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

export type StoredSwarmWorkItem = {
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

export type StoredSwarmArtifact = {
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

export type StoredSwarmTransition = {
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

export type StoredSwarmEvent = {
    id: string
    swarmId: string
    namespace: string
    type: string
    payload: unknown | null
    createdAt: number
}

export type StoredSwarmEffect = {
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

export type StoredSwarmActivity = {
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

export type StoredSwarmRoleBinding = {
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

export type StoredSwarmRoleBindingHistory = {
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

export type StoredSwarmRoleProfile = {
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

export type StoredSwarmThread = {
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

export type StoredSwarmPolicy = {
    id: string
    swarmId: string
    namespace: string
    kind: string
    status: string
    config: unknown | null
    createdAt: number
    updatedAt: number
}

export type StoredSwarmReview = {
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

export type StoredSwarmThreadEntry = {
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

export type StoredSwarmWorkItemAssignment = {
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

export type StoredSwarmParticipantLease = {
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

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
