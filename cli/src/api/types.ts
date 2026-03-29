import {
    AgentStateSchema,
    AttachmentMetadataSchema,
    MachineMetadataSchema as ProtocolMachineMetadataSchema,
    MachineSchema as ProtocolMachineSchema,
    MetadataSchema,
    ModelModeSchema,
    PermissionModeSchema,
    RunnerStateSchema as ProtocolRunnerStateSchema,
    SpawnResponseSchema,
    TodosSchema
} from '@hapi/protocol/schemas'
import type {
    Machine as ProtocolMachine,
    MachineMetadata as ProtocolMachineMetadata,
    ModelMode,
    PermissionMode,
    RunnerState as ProtocolRunnerState,
    SpawnResponse as ProtocolSpawnResponse
} from '@hapi/protocol/types'
import { z } from 'zod'
import { UsageSchema } from '@/claude/types'

export type Usage = z.infer<typeof UsageSchema>

export type {
    AgentState,
    AgentStateRunningAgent,
    AttachmentMetadata,
    ClaudePermissionMode,
    CodexPermissionMode,
    Metadata,
    Session,
    TeamMember,
    TeamState,
    TeamTask
} from '@hapi/protocol/types'
export type SessionPermissionMode = PermissionMode
export type SessionModelMode = ModelMode

export { AgentStateSchema, AttachmentMetadataSchema, MetadataSchema }
export {
    ProtocolMachineMetadataSchema as MachineMetadataSchema,
    ProtocolRunnerStateSchema as RunnerStateSchema,
    SpawnResponseSchema
}

export type MachineMetadata = ProtocolMachineMetadata
export type RunnerState = ProtocolRunnerState
export type Machine = ProtocolMachine

export const CliMessagesResponseSchema = z.object({
    messages: z.array(z.object({
        id: z.string(),
        seq: z.number(),
        createdAt: z.number(),
        localId: z.string().nullable().optional(),
        content: z.unknown()
    }))
})

export type CliMessagesResponse = z.infer<typeof CliMessagesResponseSchema>

export const CreateSessionResponseSchema = z.object({
    session: z.object({
        id: z.string(),
        namespace: z.string(),
        seq: z.number(),
        createdAt: z.number(),
        updatedAt: z.number(),
        active: z.boolean(),
        activeAt: z.number(),
        metadata: z.unknown().nullable(),
        metadataVersion: z.number(),
        agentState: z.unknown().nullable(),
        agentStateVersion: z.number(),
        thinking: z.boolean(),
        thinkingAt: z.number(),
        todos: TodosSchema.optional(),
        permissionMode: PermissionModeSchema.optional(),
        modelMode: ModelModeSchema.optional()
    })
})

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>

export const CreateMachineResponseSchema = z.object({
    machine: ProtocolMachineSchema
})

export type CreateMachineResponse = z.infer<typeof CreateMachineResponseSchema>
export type SpawnResponse = ProtocolSpawnResponse
export type {
    EnvironmentTemplate,
    ExecutionBackend,
    MachineSpawnRequest,
    PreviewTarget,
    RepositoryRef,
    RepositorySpec,
    RuntimeKind,
    SecretRef,
    WorkerCapabilities,
    WorkerLifecycle,
    WorkerResources,
    WorkspaceMode,
    WorkspaceSource,
    WorkspaceSpec
} from '@hapi/protocol/types'

export const MessageRouteContextSchema = z.object({
    groupId: z.string(),
    taskId: z.string().optional(),
    traceId: z.string().optional(),
    source: z.string(),
    targetSessionIds: z.array(z.string()).optional()
})

export type MessageRouteContext = z.infer<typeof MessageRouteContextSchema>

export const MessageMetaSchema = z.object({
    sentFrom: z.string().optional(),
    fallbackModel: z.string().nullable().optional(),
    customSystemPrompt: z.string().nullable().optional(),
    appendSystemPrompt: z.string().nullable().optional(),
    allowedTools: z.array(z.string()).nullable().optional(),
    disallowedTools: z.array(z.string()).nullable().optional(),
    routeContext: MessageRouteContextSchema.optional()
})

export type MessageMeta = z.infer<typeof MessageMetaSchema>

export const UserMessageSchema = z.object({
    role: z.literal('user'),
    content: z.object({
        type: z.literal('text'),
        text: z.string(),
        attachments: z.array(AttachmentMetadataSchema).optional()
    }),
    localKey: z.string().optional(),
    meta: MessageMetaSchema.optional()
})

export type UserMessage = z.infer<typeof UserMessageSchema>

export const AgentMessageSchema = z.object({
    role: z.literal('agent'),
    content: z.object({
        type: z.literal('output'),
        data: z.unknown()
    }),
    meta: MessageMetaSchema.optional()
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

export const MessageContentSchema = z.union([UserMessageSchema, AgentMessageSchema])

export type MessageContent = z.infer<typeof MessageContentSchema>
