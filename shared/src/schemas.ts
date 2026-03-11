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

export const MachineMappingKindSchema = z.enum(['vscode', 'web', 'jupyter', 'ssh', 'custom'])
export const MachineMappingProviderSchema = z.enum(['ngrok', 'manual', 'cloudflared', 'relay'])
export const MachineMappingStatusSchema = z.enum(['online', 'offline', 'unknown'])
export const MachineMappingSourceSchema = z.enum(['manual', 'imported', 'managed'])

export const MachineMappingAuthSchema = z.object({
    type: z.enum(['none', 'basic-auth', 'oauth', 'oidc', 'ip-restriction']),
    summary: z.string().optional()
})

export const MachineMappingSchema = z.object({
    id: z.string(),
    name: z.string(),
    kind: MachineMappingKindSchema,
    provider: MachineMappingProviderSchema,
    localUrl: z.string(),
    publicUrl: z.string().optional(),
    status: MachineMappingStatusSchema,
    source: MachineMappingSourceSchema,
    auth: MachineMappingAuthSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    updatedAt: z.number().optional()
})

export const MachineMappingsSchema = z.array(MachineMappingSchema)

export const ProviderProfileSchema = z.object({
    provider: MachineMappingProviderSchema,
    enabled: z.boolean().optional(),
    managed: z.boolean().optional(),
    configured: z.boolean().optional(),
    hasAuthToken: z.boolean().optional(),
    authTokenLastFour: z.string().optional(),
    region: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
})

export const ProviderProfilesSchema = z.array(ProviderProfileSchema)

export const CreateManagedMappingRequestSchema = z.object({
    provider: MachineMappingProviderSchema,
    name: z.string().min(1),
    kind: MachineMappingKindSchema,
    localUrl: z.string().min(1),
    auth: MachineMappingAuthSchema.optional()
})

export const DeleteManagedMappingRequestSchema = z.object({
    provider: MachineMappingProviderSchema,
    mapping: MachineMappingSchema
})

export type MachineMappingAuth = z.infer<typeof MachineMappingAuthSchema>
export type MachineMapping = z.infer<typeof MachineMappingSchema>
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>

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
    worktree: WorktreeMetadataSchema.optional()
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

export const AgentStateSchema = z.object({
    controlledByUser: z.boolean().nullish(),
    requests: z.record(z.string(), AgentStateRequestSchema).nullish(),
    completedRequests: z.record(z.string(), AgentStateCompletedRequestSchema).nullish()
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

export const AttachmentMetadataSchema = z.object({
    id: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    path: z.string(),
    previewUrl: z.string().optional()
})

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>

export const DecryptedMessageSchema = z.object({
    id: z.string(),
    seq: z.number().nullable(),
    localId: z.string().nullable(),
    content: z.unknown(),
    createdAt: z.number()
})

export type DecryptedMessage = z.infer<typeof DecryptedMessageSchema>

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

const SwarmChangedSchema = SessionEventBaseSchema.extend({
    swarmId: z.string()
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

export const SwarmSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    title: z.string(),
    status: z.string(),
    currentPhase: z.string(),
    createdBy: z.string().nullable().optional(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmSubjectSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    kind: z.string(),
    summary: z.string(),
    successCriteria: z.string().nullable(),
    constraints: z.unknown().nullable(),
    status: z.string(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmParticipantSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    kind: z.enum(['human', 'agent', 'service']),
    refId: z.string().nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    capabilities: z.array(z.string()).nullable(),
    availability: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmOutcomeSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    subjectId: z.string().nullable(),
    workItemId: z.string().nullable(),
    namespace: z.string(),
    kind: z.string(),
    status: z.string(),
    createdByParticipantId: z.string().nullable(),
    content: z.unknown().nullable(),
    artifactRefs: z.array(z.string()).nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmWorkItemSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    subjectId: z.string().nullable(),
    namespace: z.string(),
    title: z.string(),
    intent: z.string().nullable(),
    status: z.string(),
    assignedParticipantId: z.string().nullable(),
    expectedArtifact: z.string().nullable(),
    doneCriteria: z.string().nullable(),
    lastDispatchAt: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmArtifactSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    workItemId: z.string().nullable(),
    namespace: z.string(),
    kind: z.string(),
    title: z.string(),
    content: z.unknown().nullable(),
    url: z.string().nullable(),
    status: z.string(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmTransitionSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    fromState: z.string().nullable(),
    toState: z.string(),
    reason: z.string().nullable(),
    byParticipantId: z.string().nullable(),
    createdAt: z.number()
})

export const SwarmEventSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    type: z.string(),
    payload: z.unknown().nullable(),
    createdAt: z.number()
})

export const SwarmEffectSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    workItemId: z.string().nullable(),
    namespace: z.string(),
    kind: z.string(),
    summary: z.string().nullable(),
    data: z.unknown().nullable(),
    raw: z.unknown().nullable(),
    createdAt: z.number()
})

export const SwarmActivitySchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    subjectId: z.string().nullable(),
    workItemId: z.string().nullable(),
    namespace: z.string(),
    kind: z.string(),
    status: z.string(),
    participantId: z.string().nullable(),
    content: z.unknown().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmRoleBindingSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    participantId: z.string(),
    role: z.string(),
    phase: z.string().nullable(),
    status: z.string(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmRoleBindingHistorySchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    participantId: z.string(),
    role: z.string(),
    phase: z.string().nullable(),
    action: z.string(),
    reason: z.string().nullable(),
    createdAt: z.number()
})

export const SwarmRoleProfileSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    role: z.string(),
    instructionText: z.string().nullable(),
    preferredSkillIds: z.array(z.string()).nullable(),
    allowedTools: z.array(z.string()).nullable(),
    outputContract: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmThreadSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    title: z.string(),
    kind: z.string(),
    status: z.string(),
    summary: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmPolicySchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    namespace: z.string(),
    kind: z.string(),
    status: z.string(),
    config: z.unknown().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmReviewSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    workItemId: z.string().nullable(),
    artifactId: z.string().nullable(),
    namespace: z.string(),
    status: z.string(),
    verdict: z.string().nullable(),
    summary: z.string().nullable(),
    createdByParticipantId: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmThreadEntrySchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    threadId: z.string(),
    namespace: z.string(),
    kind: z.string(),
    participantId: z.string().nullable(),
    replyToEntryId: z.string().nullable(),
    citesEntryIds: z.array(z.string()).nullable(),
    content: z.unknown().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmWorkItemAssignmentSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    workItemId: z.string(),
    participantId: z.string(),
    namespace: z.string(),
    status: z.string(),
    assignedAt: z.number(),
    unassignedAt: z.number().nullable(),
    reason: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const SwarmParticipantLeaseSchema = z.object({
    id: z.string(),
    swarmId: z.string(),
    workItemId: z.string(),
    participantId: z.string(),
    namespace: z.string(),
    status: z.string(),
    assignedAt: z.number(),
    lastHeartbeatAt: z.number().nullable(),
    expiresAt: z.number().nullable(),
    releasedAt: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number()
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
    SwarmChangedSchema.extend({
        type: z.literal('swarm-added'),
        data: z.unknown().optional()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-updated'),
        data: z.unknown().optional()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-outcome-updated'),
        outcome: z.unknown()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-work-item-updated'),
        workItem: z.unknown()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-artifact-updated'),
        artifact: z.unknown()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-transition-created'),
        transition: z.unknown()
    }),
    SwarmChangedSchema.extend({
        type: z.literal('swarm-event-created'),
        event: z.unknown()
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
        type: z.literal('connection-changed'),
        data: z.object({
            status: z.string(),
            subscriptionId: z.string().optional()
        }).optional()
    })
])

export type SyncEvent = z.infer<typeof SyncEventSchema>
export type Swarm = z.infer<typeof SwarmSchema>
export type SwarmSubject = z.infer<typeof SwarmSubjectSchema>
export type SwarmParticipant = z.infer<typeof SwarmParticipantSchema>
export type SwarmOutcome = z.infer<typeof SwarmOutcomeSchema>
export type SwarmWorkItem = z.infer<typeof SwarmWorkItemSchema>
export type SwarmArtifact = z.infer<typeof SwarmArtifactSchema>
export type SwarmTransition = z.infer<typeof SwarmTransitionSchema>
export type SwarmEvent = z.infer<typeof SwarmEventSchema>
export type SwarmEffect = z.infer<typeof SwarmEffectSchema>
export type SwarmActivity = z.infer<typeof SwarmActivitySchema>
export type SwarmRoleBinding = z.infer<typeof SwarmRoleBindingSchema>
export type SwarmRoleBindingHistory = z.infer<typeof SwarmRoleBindingHistorySchema>
export type SwarmRoleProfile = z.infer<typeof SwarmRoleProfileSchema>
export type SwarmThread = z.infer<typeof SwarmThreadSchema>
export type SwarmPolicy = z.infer<typeof SwarmPolicySchema>
export type SwarmReview = z.infer<typeof SwarmReviewSchema>
export type SwarmThreadEntry = z.infer<typeof SwarmThreadEntrySchema>
export type SwarmWorkItemAssignment = z.infer<typeof SwarmWorkItemAssignmentSchema>
export type SwarmParticipantLease = z.infer<typeof SwarmParticipantLeaseSchema>
