/**
 * Sync Engine for HAPI Telegram Bot (Direct Connect)
 *
 * In the direct-connect architecture:
 * - hapi-hub is the hub (Socket.IO + REST)
 * - hapi CLI connects directly to the hub (no relay)
 * - No E2E encryption; data is stored as JSON in SQLite
 */

import { inferClaudeModelModeFromModel, isPermissionModeAllowedForFlavor } from '@hapi/protocol'
import type { DecryptedMessage, MachineMapping, ModelMode, PermissionMode, Session, SyncEvent } from '@hapi/protocol/types'
import { MachineMappingsSchema } from '@hapi/protocol/schemas'
import type { Server } from 'socket.io'
import type { PreviewUrlHistoryEntry, Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'
import { EventPublisher, type SyncEventListener } from './eventPublisher'
import { GroupService, type GroupWithDetails } from './groupService'
import { MachineCache, type Machine } from './machineCache'
import { MessageService } from './messageService'
import { withSwarmAutomationLock } from './swarmAutomationLock'
import {
    type RpcCodexQueueState,
    type RpcCodexQueueResponse,
    type RpcCodexStatusResponse,
    type RpcMcpServersResponse,
    RpcGateway,
    type RpcCommandResponse,
    type RpcDeleteUploadResponse,
    type RpcListDirectoryResponse,
    type RpcPathExistsResponse,
    type RpcReadFileResponse,
    type RpcUploadFileResponse
} from './rpcGateway'
import { SessionCache } from './sessionCache'

export type { Session, SyncEvent } from '@hapi/protocol/types'
export type { Machine } from './machineCache'
export type { SyncEventListener } from './eventPublisher'
export type {
    RpcCodexQueueResponse,
    RpcCodexStatusResponse,
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcMcpServersResponse,
    RpcListDirectoryResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse
} from './rpcGateway'

export type ResumeSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string; code: 'session_not_found' | 'access_denied' | 'no_machine_online' | 'resume_unavailable' | 'resume_failed' }

export type SpawnFromExistingSessionResult =
    | { type: 'success'; sessionId: string }
    | {
        type: 'error'
        message: string
        code: 'session_not_found' | 'access_denied' | 'no_machine_online' | 'spawn_unavailable' | 'spawn_failed' | 'history_copy_failed'
    }

type GroupRouteContext = {
    groupId: string
    taskId?: string
    traceId?: string
    source: string
    targetSessionIds?: string[]
}

type MessageEnvelope = {
    role: string
    contentType: string | null
    data: unknown
    meta: Record<string, unknown> | null
}

type MirroredPayload = {
    sessionId: string
    contentType: string
    text: string
    codexType?: string
    isCodexExecutionDetail?: boolean
    merged?: boolean
    chunkCount?: number
}

type BufferedCodexGroupMirror = {
    route: GroupRouteContext
    chunks: string[]
}

type SwarmMessageProjection = {
    role: string
    contentType: string | null
    text: string | null
}

const NOTE_REFRESH_TASK_PREFIX = 'note-refresh:'
const MAX_NOTE_REFRESH_CONTENT_LENGTH = 20_000
const MAX_GROUP_MIRROR_TEXT_LENGTH = 8_000
const GROUP_NOTE_FILE_SYNC_INTERVAL_MS = 3 * 60 * 1000
const CODEX_TOOL_PROCESS_EVENT_TYPES = new Set([
    'tool-call',
    'tool-call-result',
    'reasoning',
    'reasoning-delta',
    'token_count',
    'plan-update'
])

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
    return typeof value === 'string' ? value : null
}

function asStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
        return null
    }
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return items
}

function parseRouteContext(value: unknown): GroupRouteContext | null {
    const record = asRecord(value)
    if (!record) {
        return null
    }

    const groupId = asString(record.groupId)?.trim()
    const source = asString(record.source)?.trim()
    if (!groupId || !source) {
        return null
    }

    const taskId = asString(record.taskId)?.trim()
    const traceId = asString(record.traceId)?.trim()
    const targetSessionIds = asStringArray(record.targetSessionIds) ?? undefined

    return {
        groupId,
        ...(taskId ? { taskId } : {}),
        ...(traceId ? { traceId } : {}),
        source,
        ...(targetSessionIds ? { targetSessionIds } : {})
    }
}

function parseMessageEnvelope(content: unknown): MessageEnvelope | null {
    const root = asRecord(content)
    if (!root) {
        return null
    }

    const role = asString(root.role)?.trim()
    if (!role) {
        return null
    }

    const messageContent = asRecord(root.content)
    const contentType = messageContent ? asString(messageContent.type) : null
    const data = messageContent ? messageContent.data : undefined
    const meta = asRecord(root.meta)

    return {
        role,
        contentType,
        data,
        meta
    }
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text
    }
    return `${text.slice(0, maxLength)}...`
}

function extractClaudeText(
    data: unknown,
    options: { allowSummary?: boolean } = {}
): string | null {
    const record = asRecord(data)
    if (!record) {
        return null
    }
    const type = asString(record.type)
    if (type === 'summary') {
        if (!options.allowSummary) {
            // Summary payloads are metadata updates (e.g. title sync), not timeline chat content.
            return null
        }
        const summary = asString(record.summary)?.trim()
        return summary && summary.length > 0 ? summary : null
    }
    if (type !== 'assistant') {
        return null
    }

    const message = asRecord(record.message)
    const content = message?.content
    if (typeof content === 'string') {
        const text = content.trim()
        return text.length > 0 ? text : null
    }
    if (!Array.isArray(content)) {
        return null
    }

    const texts: string[] = []
    for (const block of content) {
        const item = asRecord(block)
        if (!item || item.type !== 'text') {
            continue
        }
        const text = asString(item.text)?.trim()
        if (text) {
            texts.push(text)
        }
    }

    if (texts.length === 0) {
        return null
    }
    return texts.join('\n')
}

function extractCodexText(data: unknown): string | null {
    const record = asRecord(data)
    if (!record) {
        return null
    }
    const type = asString(record.type)
    if (!type) {
        return null
    }

    const message = asString(record.message)?.trim()
    if (message && message.length > 0) {
        return message
    }
    const error = asString(record.error)?.trim()
    if (error && error.length > 0) {
        return `${type}: ${error}`
    }
    return null
}

function extractSwarmProjection(envelope: MessageEnvelope): SwarmMessageProjection | null {
    let text: string | null = null
    if (envelope.contentType === 'output') {
        text = extractClaudeText(envelope.data, { allowSummary: true })
    } else if (envelope.contentType === 'codex') {
        text = extractCodexText(envelope.data)
    } else if (envelope.contentType === 'text') {
        const record = asRecord(envelope.data)
        const candidate = asString(record?.text)?.trim()
        text = candidate && candidate.length > 0 ? candidate : null
    }

    if (envelope.role !== 'user' && envelope.role !== 'agent') {
        return null
    }

    return {
        role: envelope.role,
        contentType: envelope.contentType,
        text
    }
}

function isCodexExecutionDetailText(text: string): boolean {
    const normalized = text.trim().toLowerCase()
    if (!normalized) {
        return true
    }

    const isTitleToolProgress = /\b(changing|updating|setting|calling|initiating)\b.*\b(task title|chat title|session title|title change|change_title)\b/.test(normalized)
        || /\b(task title|chat title|session title|title change|change_title)\b.*\b(changing|updating|setting|calling|initiating)\b/.test(normalized)
        || normalized.includes('change_title')

    return normalized.startsWith('[model rerouted]')
        || normalized.startsWith('[context compacted]')
        || normalized === 'starting task...'
        || normalized === 'task completed'
        || normalized === 'turn aborted'
        || normalized.startsWith('task failed')
        || normalized.startsWith('title changed')
        || normalized.startsWith('title updated')
        || normalized.startsWith('chat title changed')
        || normalized.startsWith('session title changed')
        || isTitleToolProgress
}

function isTitleMutationNoiseText(text: string): boolean {
    const normalized = text.trim().toLowerCase()
    if (!normalized) {
        return false
    }

    return normalized.startsWith('title changed')
        || normalized.startsWith('title updated')
        || normalized.startsWith('chat title changed')
        || normalized.startsWith('session title changed')
        || normalized.startsWith('successfully changed chat title')
        || normalized.startsWith('failed to change chat title')
}

function isCodexToolProcessEventType(type: string): boolean {
    return CODEX_TOOL_PROCESS_EVENT_TYPES.has(type)
}

function detectRuntimeSwarmEffects(text: string | null, contentType: string | null): Array<{
    kind: 'progress' | 'file_change' | 'other'
    summary: string
    data?: Record<string, unknown>
}> {
    const normalized = text?.trim()
    if (!normalized) {
        return []
    }
    const effects: Array<{ kind: 'progress' | 'file_change' | 'other'; summary: string; data?: Record<string, unknown> }> = []
    if (/^diff --git\b/m.test(normalized) || (/^\+\+\+ .+/m.test(normalized) && /^--- .+/m.test(normalized))) {
        effects.push({
            kind: 'file_change',
            summary: truncateText(normalized.split('\n').slice(0, 6).join('\n'), 500),
            data: { contentType, detected: 'unified_diff' }
        })
    }
    if (/\b(typecheck|test|tests|lint|build)\b.*\b(pass|passed|success|ok|fail|failed|error)\b/i.test(normalized)) {
        effects.push({
            kind: 'other',
            summary: truncateText(normalized.replace(/\s+/g, ' '), 500),
            data: { contentType, detected: 'verification_result' }
        })
    }
    if (effects.length === 0 && normalized.length > 0) {
        effects.push({
            kind: 'progress',
            summary: truncateText(normalized.replace(/\s+/g, ' '), 280),
            data: { contentType }
        })
    }
    return effects
}

function extractCodexMirrorPayload(data: unknown): {
    text: string
    codexType: string
    isCodexExecutionDetail: boolean
} | null {
    const record = asRecord(data)
    if (!record) {
        return null
    }

    const codexType = asString(record.type)
    if (!codexType) {
        return null
    }
    if (isCodexToolProcessEventType(codexType)) {
        return null
    }

    const message = asString(record.message)?.trim()
    if (message && message.length > 0) {
        return {
            text: message,
            codexType,
            isCodexExecutionDetail: codexType !== 'message' || isCodexExecutionDetailText(message)
        }
    }

    const error = asString(record.error)?.trim()
    if (error && error.length > 0) {
        return {
            text: `${codexType}: ${error}`,
            codexType,
            isCodexExecutionDetail: true
        }
    }

    return null
}

function isReadyEvent(envelope: MessageEnvelope): boolean {
    if (envelope.contentType !== 'event') {
        return false
    }
    const eventData = asRecord(envelope.data)
    return asString(eventData?.type) === 'ready'
}

function buildMirroredPayload(
    sessionId: string,
    envelope: MessageEnvelope,
    route?: GroupRouteContext
): MirroredPayload | null {
    const contentType = envelope.contentType
    if (!contentType) {
        return null
    }

    let text: string | null = null
    let codexType: string | undefined
    let isCodexExecutionDetail: boolean | undefined
    if (contentType === 'output') {
        text = extractClaudeText(envelope.data, {
            allowSummary: isNoteRefreshTaskId(route?.taskId)
        })
    } else if (contentType === 'codex') {
        const codexPayload = extractCodexMirrorPayload(envelope.data)
        if (!codexPayload) {
            return null
        }
        text = codexPayload.text
        codexType = codexPayload.codexType
        isCodexExecutionDetail = codexPayload.isCodexExecutionDetail
    } else if (contentType === 'event') {
        const eventData = asRecord(envelope.data)
        if (asString(eventData?.type) !== 'message') {
            return null
        }
        text = asString(eventData?.message)?.trim() ?? null
    }

    if (!text || text.length === 0) {
        return null
    }

    return {
        sessionId,
        contentType,
        text: truncateText(text, MAX_GROUP_MIRROR_TEXT_LENGTH),
        ...(codexType ? { codexType } : {}),
        ...(isCodexExecutionDetail !== undefined ? { isCodexExecutionDetail } : {})
    }
}

function isNoteRefreshTaskId(taskId: string | undefined): boolean {
    return typeof taskId === 'string' && taskId.startsWith(NOTE_REFRESH_TASK_PREFIX)
}

function stripMarkdownCodeFence(content: string): string {
    const trimmed = content.trim()
    const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
    if (!fenced) {
        return trimmed
    }
    const inner = fenced[1]?.trim()
    return inner && inner.length > 0 ? inner : trimmed
}

function normalizeNoteRefreshContent(content: string): string {
    const normalized = stripMarkdownCodeFence(content).trim()
    if (!normalized) {
        return ''
    }
    return truncateText(normalized, MAX_NOTE_REFRESH_CONTENT_LENGTH)
}

export class SyncEngine {
    private readonly store: Store
    private readonly eventPublisher: EventPublisher
    private readonly sessionCache: SessionCache
    private readonly machineCache: MachineCache
    private readonly messageService: MessageService
    private readonly groupService: GroupService
    private readonly rpcGateway: RpcGateway
    private readonly autoApprovalInFlight: Set<string> = new Set()
    private readonly activeGroupRoutesBySession: Map<string, GroupRouteContext> = new Map()
    // Routes registered at queue-dispatch time for flavors (claude/gemini) that don't
    // echo routeContext in their user-message echo. Prevents the echo from clearing the route.
    private readonly queuePendingRoutes: Map<string, GroupRouteContext> = new Map()
    private readonly bufferedCodexMirrorsBySession: Map<string, BufferedCodexGroupMirror> = new Map()
    private readonly pendingNoteRefreshDraftByTaskKey: Map<string, string> = new Map()
    private readonly pendingNoteRefreshMirroredByTaskKey: Set<string> = new Set()
    private readonly localQueueTextBySession: Map<string, Map<string, string>> = new Map()
    private readonly localQueueTextBySessionPreview: Map<string, Map<string, string>> = new Map()
    private inactivityTimer: NodeJS.Timeout | null = null
    private groupNoteFileSyncTimer: NodeJS.Timeout | null = null

    constructor(
        store: Store,
        io: Server,
        rpcRegistry: RpcRegistry,
        sseManager: SSEManager
    ) {
        this.store = store
        this.eventPublisher = new EventPublisher(sseManager, (event) => this.resolveNamespace(event))
        this.sessionCache = new SessionCache(store, this.eventPublisher)
        this.machineCache = new MachineCache(store, this.eventPublisher)
        this.messageService = new MessageService(store, io, this.eventPublisher)
        this.groupService = new GroupService(
            store,
            this.eventPublisher,
            async (payload) => this.dispatchGroupTask(payload),
            async (payload) => this.executeNoteRefresh(payload),
            (sessionId, namespace) => {
                const session = this.getSessionByNamespace(sessionId, namespace)
                if (!session) {
                    return null
                }
                return { active: session.active }
            }
        )
        this.rpcGateway = new RpcGateway(io, rpcRegistry)
        this.reloadAll()
        this.syncGroupNoteMarkdownFiles()
        this.inactivityTimer = setInterval(() => this.expireInactive(), 5_000)
        this.groupNoteFileSyncTimer = setInterval(
            () => this.syncGroupNoteMarkdownFiles(),
            GROUP_NOTE_FILE_SYNC_INTERVAL_MS
        )
    }

    stop(): void {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer)
            this.inactivityTimer = null
        }
        if (this.groupNoteFileSyncTimer) {
            clearInterval(this.groupNoteFileSyncTimer)
            this.groupNoteFileSyncTimer = null
        }
    }

    subscribe(listener: SyncEventListener): () => void {
        return this.eventPublisher.subscribe(listener)
    }

    private resolveNamespace(event: SyncEvent): string | undefined {
        if (event.namespace) {
            return event.namespace
        }
        if ('sessionId' in event) {
            return this.getSession(event.sessionId)?.namespace
        }
        if ('machineId' in event) {
            return this.machineCache.getMachine(event.machineId)?.namespace
        }
        if ('groupId' in event) {
            return this.store.groups.getGroup(event.groupId)?.namespace
        }
        if ('swarmId' in event) {
            return event.namespace
        }
        return undefined
    }

    getSessions(): Session[] {
        return this.sessionCache.getSessions()
    }

    getSessionsByNamespace(namespace: string): Session[] {
        return this.sessionCache.getSessionsByNamespace(namespace)
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    getSessionByNamespace(sessionId: string, namespace: string): Session | undefined {
        const session = this.sessionCache.getSessionByNamespace(sessionId, namespace)
            ?? this.sessionCache.refreshSession(sessionId)
        if (!session || session.namespace !== namespace) {
            return undefined
        }
        return session
    }

    resolveSessionAccess(
        sessionId: string,
        namespace: string
    ): { ok: true; sessionId: string; session: Session } | { ok: false; reason: 'not-found' | 'access-denied' } {
        return this.sessionCache.resolveSessionAccess(sessionId, namespace)
    }

    getActiveSessions(): Session[] {
        return this.sessionCache.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.machineCache.getMachines()
    }

    getMachinesByNamespace(namespace: string): Machine[] {
        return this.machineCache.getMachinesByNamespace(namespace)
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machineCache.getMachine(machineId)
    }

    getMachineByNamespace(machineId: string, namespace: string): Machine | undefined {
        return this.machineCache.getMachineByNamespace(machineId, namespace)
    }

    getOnlineMachines(): Machine[] {
        return this.machineCache.getOnlineMachines()
    }

    getOnlineMachinesByNamespace(namespace: string): Machine[] {
        return this.machineCache.getOnlineMachinesByNamespace(namespace)
    }

    getMachineMappingsByNamespace(machineId: string, namespace: string): MachineMapping[] {
        const machine = this.getMachineByNamespace(machineId, namespace)
        if (!machine) {
            throw new Error('Machine not found')
        }
        return Array.isArray(machine.metadata?.mappings) ? machine.metadata.mappings : []
    }

    updateMachineMappings(machineId: string, namespace: string, mappings: MachineMapping[]): MachineMapping[] {
        const machine = this.getMachineByNamespace(machineId, namespace)
        if (!machine) {
            throw new Error('Machine not found')
        }

        const parsed = MachineMappingsSchema.safeParse(mappings)
        if (!parsed.success) {
            throw new Error('Invalid mappings payload')
        }

        let expectedVersion = machine.metadataVersion
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const currentMachine = this.getMachineByNamespace(machineId, namespace)
            if (!currentMachine) {
                throw new Error('Machine not found')
            }

            const nextMetadata = {
                ...(currentMachine.metadata ?? {
                    host: 'unknown',
                    platform: 'unknown',
                    happyCliVersion: 'unknown'
                }),
                mappings: parsed.data
            }

            const result = this.store.machines.updateMachineMetadata(
                machineId,
                nextMetadata,
                expectedVersion,
                namespace
            )

            if (result.result === 'success') {
                this.machineCache.refreshMachine(machineId)
                return parsed.data
            }

            if (result.result === 'version-mismatch') {
                expectedVersion = result.version
                continue
            }

            throw new Error('Failed to update machine mappings')
        }

        throw new Error('Failed to update machine mappings due to concurrent updates')
    }

    async importNgrokMappings(machineId: string, namespace: string): Promise<{ mappings: MachineMapping[]; imported: number }> {
        const imported = await this.rpcGateway.getNgrokMappings(machineId)
        const existing = this.getMachineMappingsByNamespace(machineId, namespace)
        const preserved = existing.filter((mapping) => !(mapping.provider === 'ngrok' && mapping.source === 'imported'))
        const mappings = this.updateMachineMappings(machineId, namespace, [...preserved, ...imported])
        return { mappings, imported: imported.length }
    }

    async createManagedMachineMapping(input: {
        machineId: string
        namespace: string
        provider: MachineMapping['provider']
        name: string
        kind: MachineMapping['kind']
        localUrl: string
        auth?: MachineMapping['auth']
    }): Promise<MachineMapping[]> {
        const created = await this.rpcGateway.createManagedMapping(input.machineId, {
            provider: input.provider,
            name: input.name,
            kind: input.kind,
            localUrl: input.localUrl,
            auth: input.auth
        })

        const existing = this.getMachineMappingsByNamespace(input.machineId, input.namespace)
        const next = [...existing.filter((item) => item.id !== created.id), created]
        return this.updateMachineMappings(input.machineId, input.namespace, next)
    }

    async deleteManagedMachineMapping(input: {
        machineId: string
        namespace: string
        provider: MachineMapping['provider']
        mappingId: string
    }): Promise<MachineMapping[]> {
        const existing = this.getMachineMappingsByNamespace(input.machineId, input.namespace)
        const target = existing.find((item) => item.id === input.mappingId)
        if (!target) {
            return existing
        }

        if (target.provider === input.provider && target.source === 'managed') {
            await this.rpcGateway.deleteManagedMapping(input.machineId, {
                provider: input.provider,
                mapping: target
            })
        }

        return this.updateMachineMappings(
            input.machineId,
            input.namespace,
            existing.filter((item) => item.id !== input.mappingId)
        )
    }

    async refreshMachineMappings(machineId: string, namespace: string, provider: MachineMapping['provider'] = 'ngrok'): Promise<MachineMapping[]> {
        const existing = this.getMachineMappingsByNamespace(machineId, namespace)
        if (provider !== 'ngrok') {
            return existing
        }

        const live = await this.rpcGateway.getNgrokMappings(machineId)
        const liveByPublicUrl = new Map(live.map((item) => [item.publicUrl ?? item.id, item]))
        const next: MachineMapping[] = []
        const seen = new Set<string>()

        for (const item of existing) {
            if (item.provider !== provider) {
                next.push(item)
                continue
            }

            const key = item.publicUrl ?? item.id
            const liveItem = liveByPublicUrl.get(key)
            if (liveItem) {
                next.push({
                    ...item,
                    ...liveItem,
                    source: item.source,
                    auth: item.auth,
                    status: 'online',
                    updatedAt: Date.now()
                })
                seen.add(key)
            } else {
                next.push({
                    ...item,
                    status: 'offline',
                    updatedAt: Date.now()
                })
            }
        }

        for (const item of live) {
            const key = item.publicUrl ?? item.id
            if (seen.has(key)) {
                continue
            }
            next.push(item)
        }

        return this.updateMachineMappings(machineId, namespace, next)
    }

    getGroupsByNamespace(namespace: string): GroupWithDetails[] {
        return this.groupService.getGroupsByNamespace(namespace)
    }

    getGroupByNamespace(groupId: string, namespace: string): GroupWithDetails | null {
        return this.groupService.getGroupByNamespace(groupId, namespace)
    }

    createGroup(options: {
        namespace: string
        name: string
        description?: string | null
        noteSessionId?: string | null
        sessionMemberIds?: string[]
    }): GroupWithDetails {
        return this.groupService.createGroup(options)
    }

    getGroupMessagesPage(
        groupId: string,
        namespace: string,
        options: { limit: number; beforeSeq: number | null }
    ) {
        return this.groupService.getMessagesPage(groupId, namespace, options)
    }

    getGroupConversationTurnsPage(
        groupId: string,
        namespace: string,
        options: { limit: number; beforeTurnIndex: number | null }
    ) {
        return this.groupService.getConversationTurnsPage(groupId, namespace, options)
    }

    getGroupConversationTurnMessagesPage(
        groupId: string,
        namespace: string,
        turnId: string,
        options: { limit: number; beforeSeq: number | null }
    ) {
        return this.groupService.getConversationTurnMessagesPage(groupId, namespace, turnId, options)
    }

    async addGroupMessage(options: {
        groupId: string
        namespace: string
        type: 'chat' | 'command' | 'task_state' | 'note_state' | 'system'
        payload: unknown
        source?: string
        actorSessionId?: string | null
        actorName?: string | null
        traceId?: string | null
        taskId?: string | null
        targetSessionIds?: string[] | null
        quotedMessageId?: string | null
    }) {
        return this.groupService.addTimelineMessage(options)
    }

    getGroupNote(groupId: string, namespace: string) {
        return this.groupService.getGroupNote(groupId, namespace)
    }

    getGroupTasks(groupId: string, namespace: string, limit?: number) {
        return this.groupService.getGroupTasks(groupId, namespace, limit)
    }

    updateGroupNote(options: {
        groupId: string
        namespace: string
        content: string
        updatedBy?: string | null
    }) {
        return this.groupService.updateGroupNote(options)
    }

    refreshGroupNote(options: {
        groupId: string
        namespace: string
        source?: string
        command?: string
    }): Promise<{ triggered: boolean; reason?: string }> {
        return this.groupService.refreshGroupNote(options)
    }

    claimGroupTask(groupId: string, taskId: string, namespace: string) {
        return this.groupService.claimTask(groupId, taskId, namespace)
    }

    doneGroupTask(groupId: string, taskId: string, namespace: string) {
        return this.groupService.doneTask(groupId, taskId, namespace)
    }

    cancelGroupTask(groupId: string, taskId: string, namespace: string) {
        return this.groupService.cancelTask(groupId, taskId, namespace)
    }

    addGroupMember(groupId: string, namespace: string, sessionId: string): GroupWithDetails {
        return this.groupService.addMember({ groupId, namespace, sessionId })
    }

    removeGroupMember(groupId: string, namespace: string, sessionId: string): GroupWithDetails {
        return this.groupService.removeMember({ groupId, namespace, sessionId })
    }

    updateGroup(options: {
        groupId: string
        namespace: string
        name?: string
        description?: string | null
        noteSessionId?: string | null
    }): GroupWithDetails {
        return this.groupService.updateGroup(options)
    }

    deleteGroup(namespace: string, groupId: string, actorMachineId?: string): void {
        this.groupService.deleteGroup(namespace, groupId, actorMachineId)
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        return this.messageService.getMessagesPage(sessionId, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.messageService.getMessagesAfter(sessionId, options)
    }

    getConversationTurnsPage(sessionId: string, options: { limit: number; beforeTurnIndex: number | null }): {
        turns: Array<{
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
        }>
        page: {
            limit: number
            beforeTurnIndex: number | null
            nextBeforeTurnIndex: number | null
            hasMore: boolean
        }
    } {
        return this.messageService.getConversationTurnsPage(sessionId, options)
    }

    getConversationTurnMessagesPage(
        sessionId: string,
        turnId: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        turn: {
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
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
            startSeq: number | null
            endSeq: number | null
        }
    } | null {
        return this.messageService.getConversationTurnMessagesPage(sessionId, turnId, options)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        if (event.type === 'session-updated' && event.sessionId) {
            const refreshed = this.sessionCache.refreshSession(event.sessionId)
            if (refreshed?.permissionMode === 'auto-approve') {
                void this.maybeAutoApprovePendingRequests(event.sessionId)
            }
            return
        }

        if (event.type === 'machine-updated' && event.machineId) {
            this.machineCache.refreshMachine(event.machineId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            const session = this.getSession(event.sessionId) ?? this.sessionCache.refreshSession(event.sessionId)
            if (session) {
                this.handleGroupRoutedMessage(event.sessionId, session.namespace, event.message)
                this.handleSwarmParticipantMessage(event.sessionId, session.namespace, event.message)
            }
        }

        this.eventPublisher.emit(event)
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        mode?: 'local' | 'remote'
        permissionMode?: PermissionMode
        modelMode?: ModelMode
    }): void {
        this.sessionCache.handleSessionAlive(payload)
        const session = this.getSession(payload.sid)
        if (session?.permissionMode === 'auto-approve') {
            void this.maybeAutoApprovePendingRequests(payload.sid)
        }
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.sessionCache.handleSessionEnd(payload)
        const activeRoute = this.activeGroupRoutesBySession.get(payload.sid)
        if (activeRoute) {
            this.clearPendingNoteRefreshDraft(activeRoute)
        }
        const pendingRoute = this.queuePendingRoutes.get(payload.sid)
        if (pendingRoute) {
            this.clearPendingNoteRefreshDraft(pendingRoute)
        }
        this.activeGroupRoutesBySession.delete(payload.sid)
        this.queuePendingRoutes.delete(payload.sid)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.machineCache.handleMachineAlive(payload)
    }

    private expireInactive(): void {
        this.sessionCache.expireInactive()
        this.machineCache.expireInactive()
        void this.reassignExpiredSwarmLeases()
    }

    private syncGroupNoteMarkdownFiles(): void {
        try {
            const result = this.groupService.syncGroupNoteMarkdownFiles()
            if (result.errors > 0) {
                console.warn(
                    `[SyncEngine] Group note markdown sync completed with ${result.errors} error(s)`
                )
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[SyncEngine] Failed to run group note markdown sync: ${message}`)
        }
    }

    private handleSwarmParticipantMessage(
        sessionId: string,
        namespace: string,
        message: DecryptedMessage
    ): void {
        const envelope = parseMessageEnvelope(message.content)
        if (!envelope) {
            return
        }

        const projection = extractSwarmProjection(envelope)
        if (!projection) {
            return
        }

        const metaSwarmId = asString(envelope.meta?.swarmId)?.trim() ?? null
        const metaWorkItemId = asString(envelope.meta?.swarmWorkItemId)?.trim() ?? null
        const swarms = metaSwarmId
            ? [this.store.swarms.getSwarmByNamespace(metaSwarmId, namespace)].filter((item): item is NonNullable<typeof item> => Boolean(item))
            : this.store.swarms.getSwarmsByParticipantRef(namespace, sessionId)
        if (swarms.length === 0) {
            return
        }

        for (const swarm of swarms) {
            const participant = this.store.swarms.getSwarmParticipantByRef(swarm.id, namespace, sessionId)
            this.store.swarms.addSwarmActivity({
                swarmId: swarm.id,
                namespace,
                subjectId: this.store.swarms.getSwarmSubject(swarm.id, namespace)?.id ?? null,
                workItemId: metaWorkItemId,
                kind: projection.role === 'agent' ? 'implement' : 'coordinate',
                status: projection.role === 'agent' ? 'running' : 'open',
                participantId: participant?.id ?? null,
                content: {
                    sessionId,
                    messageId: message.id,
                    text: projection.text ? truncateText(projection.text, 1000) : null
                }
            })
            const outcome = this.store.swarms.addSwarmOutcome({
                swarmId: swarm.id,
                namespace,
                subjectId: this.store.swarms.getSwarmSubject(swarm.id, namespace)?.id ?? null,
                workItemId: metaWorkItemId,
                kind: projection.role === 'agent' ? 'session_output' : 'session_input',
                status: 'open',
                createdByParticipantId: participant?.id ?? null,
                content: {
                    sessionId,
                    messageId: message.id,
                    seq: message.seq,
                    role: projection.role,
                    contentType: projection.contentType,
                    text: projection.text ? truncateText(projection.text, 4000) : null,
                    createdAt: message.createdAt
                }
            })

            const runtimeEffects = detectRuntimeSwarmEffects(projection.text, projection.contentType)
            for (const effect of runtimeEffects) {
                this.store.swarms.addSwarmEffect({
                    swarmId: swarm.id,
                    namespace,
                    workItemId: metaWorkItemId,
                    kind: effect.kind,
                    summary: effect.summary,
                    data: {
                        ...effect.data,
                        sessionId,
                        messageId: message.id,
                        role: projection.role
                    },
                    raw: envelope.data
                })
            }

            this.eventPublisher.emit({
                type: 'swarm-outcome-updated',
                swarmId: swarm.id,
                namespace,
                outcome
            })

            if (metaWorkItemId) {
                const existingWorkItem = this.store.swarms.getSwarmWorkItemById(swarm.id, namespace, metaWorkItemId)
                const workItem = this.store.swarms.updateSwarmWorkItem({
                    swarmId: swarm.id,
                    namespace,
                    workItemId: metaWorkItemId,
                    status: projection.role === 'agent' ? 'running' : 'active',
                    assignedParticipantId: participant?.id ?? null
                })
                if (workItem) {
                    if (existingWorkItem && existingWorkItem.status !== workItem.status) {
                        const transition = this.store.swarms.addSwarmTransition({
                            swarmId: swarm.id,
                            namespace,
                            entityType: 'work_item',
                            entityId: workItem.id,
                            fromState: existingWorkItem.status,
                            toState: workItem.status,
                            reason: `session-message:${projection.role}`,
                            byParticipantId: participant?.id ?? null
                        })
                        this.eventPublisher.emit({
                            type: 'swarm-transition-created',
                            swarmId: swarm.id,
                            namespace,
                            transition
                        })
                    }
                    this.store.swarms.upsertSwarmParticipantLease({
                        swarmId: swarm.id,
                        workItemId: metaWorkItemId,
                        participantId: participant?.id ?? sessionId,
                        namespace,
                        status: workItem.status === 'completed' ? 'released' : 'active',
                        lastHeartbeatAt: message.createdAt,
                        expiresAt: message.createdAt + 30 * 60 * 1000
                    })
                    this.eventPublisher.emit({
                        type: 'swarm-work-item-updated',
                        swarmId: swarm.id,
                        namespace,
                        workItem
                    })
                }
            }

            const latestText = projection.text?.trim()
            if (latestText && latestText.length > 0) {
                const eventPayload = {
                    sessionId,
                    participantId: participant?.id ?? null,
                    role: projection.role,
                    preview: truncateText(latestText.replace(/\s+/g, ' '), 280)
                }
                const event = this.store.swarms.addSwarmEvent({
                    swarmId: swarm.id,
                    namespace,
                    type: 'participant-message',
                    payload: eventPayload
                })
                this.eventPublisher.emit({
                    type: 'swarm-event-created',
                    swarmId: swarm.id,
                    namespace,
                    event
                })
            }

            const sessionState = this.getSession(sessionId)
            if (sessionState) {
                const transition = this.store.swarms.addSwarmTransition({
                    swarmId: swarm.id,
                    namespace,
                    entityType: 'participant',
                    entityId: participant?.id ?? sessionId,
                    fromState: null,
                    toState: sessionState.active ? 'active' : 'inactive',
                    reason: `session-message:${projection.role}`,
                    byParticipantId: participant?.id ?? null
                })
                this.eventPublisher.emit({
                    type: 'swarm-transition-created',
                    swarmId: swarm.id,
                    namespace,
                    transition
                })
            }

            this.recomputeSwarmLifecycle(swarm.id, namespace)
        }
    }

    private recomputeSwarmLifecycle(swarmId: string, namespace: string): void {
        this.recomputeSwarmLifecycleNow(swarmId, namespace)
        void this.runSwarmPolicies(swarmId, namespace)
    }

    private recomputeSwarmLifecycleNow(swarmId: string, namespace: string): void {
        const swarm = this.store.swarms.getSwarmByNamespace(swarmId, namespace)
        if (!swarm) {
            return
        }
        const workItems = this.store.swarms.getSwarmWorkItems(swarmId, namespace)
        const outcomes = this.store.swarms.getSwarmOutcomes(swarmId, namespace)
        let currentPhase = swarm.currentPhase
        let status = swarm.status

        if (workItems.length === 0) {
            currentPhase = 'define'
            status = 'active'
        } else if (workItems.some((item) => item.status === 'running' || item.status === 'active' || item.status === 'dispatched')) {
            currentPhase = 'execute'
            status = 'active'
        } else if (outcomes.some((item) => item.kind === 'decision')) {
            currentPhase = 'decide'
            status = 'active'
        } else if (workItems.some((item) => item.status === 'blocked')) {
            currentPhase = 'execute'
            status = 'blocked'
        } else if (workItems.every((item) => item.status === 'completed' || item.status === 'canceled')) {
            currentPhase = 'deliver'
            status = workItems.some((item) => item.status === 'completed') ? 'completed' : 'canceled'
        } else {
            currentPhase = 'explore'
            status = 'active'
        }

        if (currentPhase !== swarm.currentPhase || status !== swarm.status) {
            const updated = this.store.swarms.updateSwarm({
                swarmId,
                namespace,
                currentPhase,
                status
            })
            this.syncSwarmRoleBindings(swarmId, namespace)
            if (updated) {
                this.eventPublisher.emit({
                    type: 'swarm-updated',
                    swarmId,
                    namespace,
                    data: updated
                })
            }
            return
        }
        this.syncSwarmRoleBindings(swarmId, namespace)
    }

    private syncSwarmRoleBindings(swarmId: string, namespace: string): void {
        const swarm = this.store.swarms.getSwarmByNamespace(swarmId, namespace)
        if (!swarm) {
            return
        }
        const previousBindings = this.store.swarms.getSwarmRoleBindings(swarmId, namespace)
        const participants = this.store.swarms.getSwarmParticipants(swarmId, namespace)
        const workItems = this.store.swarms.getSwarmWorkItems(swarmId, namespace)
        const reviews = this.store.swarms.getSwarmReviews(swarmId, namespace)
        const activeAgents = participants.filter((participant) => participant.kind === 'agent' && participant.refId)
        const assignedIds = new Set(workItems.map((item) => item.assignedParticipantId).filter((item): item is string => Boolean(item)))
        const reviewerIds = new Set(reviews.map((item) => item.createdByParticipantId).filter((item): item is string => Boolean(item)))
        const planner = activeAgents.find((participant) => (participant.capabilities ?? []).some((item) => item.toLowerCase() === 'planning')) ?? activeAgents[0]
        const coordinator = activeAgents.find((participant) => participant.id !== planner?.id) ?? planner
        const reviewer = activeAgents.find((participant) => (participant.capabilities ?? []).some((item) => item.toLowerCase() === 'review'))
            ?? activeAgents.find((participant) => !assignedIds.has(participant.id))
            ?? activeAgents[0]
        const nextBindings = new Map<string, { participantId: string; role: string; phase?: string | null; status?: string }>()
        if (planner) {
            nextBindings.set(`${planner.id}:planner:${swarm.currentPhase}`, { participantId: planner.id, role: 'planner', phase: swarm.currentPhase, status: 'active' })
        }
        if (coordinator) {
            nextBindings.set(`${coordinator.id}:coordinator:${swarm.currentPhase}`, { participantId: coordinator.id, role: 'coordinator', phase: swarm.currentPhase, status: 'active' })
        }
        for (const participantId of assignedIds) {
            nextBindings.set(`${participantId}:implementer:${swarm.currentPhase}`, { participantId, role: 'implementer', phase: swarm.currentPhase, status: 'active' })
        }
        if (swarm.currentPhase === 'deliver' || reviewerIds.size > 0 || workItems.some((item) => item.status === 'completed')) {
            if (reviewer) {
                nextBindings.set(`${reviewer.id}:reviewer:${swarm.currentPhase}`, { participantId: reviewer.id, role: 'reviewer', phase: swarm.currentPhase, status: 'active' })
            }
        }
        this.store.swarms.resetSwarmRoleBindings({ swarmId, namespace })
        for (const binding of previousBindings) {
            this.store.swarms.addSwarmRoleBindingHistory({
                swarmId,
                namespace,
                participantId: binding.participantId,
                role: binding.role,
                phase: binding.phase,
                action: 'unbind',
                reason: 'runtime-rebind'
            })
        }
        for (const binding of nextBindings.values()) {
            const current = this.store.swarms.addSwarmRoleBinding({
                swarmId,
                namespace,
                participantId: binding.participantId,
                role: binding.role,
                phase: binding.phase,
                status: binding.status
            })
            this.store.swarms.addSwarmRoleBindingHistory({
                swarmId,
                namespace,
                participantId: current.participantId,
                role: current.role,
                phase: current.phase,
                action: 'bind',
                reason: 'runtime-rebind'
            })
        }
    }

    private async runSwarmPolicies(swarmId: string, namespace: string): Promise<void> {
        await withSwarmAutomationLock(swarmId, namespace, async () => {
            await this.applySwarmPoliciesNow(swarmId, namespace)
            this.recomputeSwarmLifecycleNow(swarmId, namespace)
        })
    }

    private async applySwarmPoliciesNow(swarmId: string, namespace: string): Promise<void> {
        const swarm = this.store.swarms.getSwarmByNamespace(swarmId, namespace)
        if (!swarm) {
            return
        }
        const subjectId = this.store.swarms.getSwarmSubject(swarmId, namespace)?.id ?? null
        const policies = this.store.swarms.getSwarmPolicies(swarmId, namespace).filter((item) => item.status !== 'disabled')
        if (policies.length === 0) {
            return
        }
        const workItems = this.store.swarms.getSwarmWorkItems(swarmId, namespace)
        const roleBindings = this.store.swarms.getSwarmRoleBindings(swarmId, namespace)
        const threads = this.store.swarms.getSwarmThreads(swarmId, namespace)
        const threadEntries = this.store.swarms.getSwarmThreadEntries(swarmId, namespace)
        const reviews = this.store.swarms.getSwarmReviews(swarmId, namespace)
        const participants = this.store.swarms.getSwarmParticipants(swarmId, namespace)
        const plannerBinding = roleBindings.find((item) => item.role === 'planner')
        const coordinatorBinding = roleBindings.find((item) => item.role === 'coordinator')
        const reviewerBinding = roleBindings.find((item) => item.role === 'reviewer')
        const autonomyConfig = this.getSwarmPolicyConfig<{
            auto?: boolean
            autoPlanOnDefine?: boolean
            autoDispatchOnPlan?: boolean
            autoPlanMaxItems?: number
            maxAutoDispatches?: number
            stopOnDeliver?: boolean
        }>(swarmId, namespace, 'autonomy')
        const hasPolicy = (...kinds: string[]) => {
            const normalized = new Set(kinds.map((item) => item.toLowerCase()))
            return policies.some((item) => normalized.has(item.kind.toLowerCase()))
        }

        const events = this.store.swarms.getSwarmEvents(swarmId, namespace)
        const autoDispatchCount = events.filter((event) => event.type === 'auto-dispatch-requested').length
        if (autonomyConfig.stopOnDeliver && (swarm.currentPhase === 'deliver' || swarm.status === 'completed' || swarm.status === 'canceled')) {
            return
        }
        if (workItems.length === 0 && this.store.swarms.getSwarmSubject(swarmId, namespace)?.summary?.trim()) {
            if (autonomyConfig.auto === true && autonomyConfig.autoPlanOnDefine !== false) {
                const exceeded = typeof autonomyConfig.maxAutoDispatches === 'number' && autoDispatchCount >= autonomyConfig.maxAutoDispatches
                if (!exceeded) {
                    await this.createSwarmAutoPlan(swarmId, namespace, {
                        maxItems: Math.max(1, Math.min(autonomyConfig.autoPlanMaxItems ?? 3, 8)),
                        dispatch: autonomyConfig.autoDispatchOnPlan === true
                    })
                }
            }
        }

        if (hasPolicy('escalation')) {
            for (const workItem of workItems.filter((item) => item.status === 'blocked')) {
                const exists = threadEntries.some((entry) => {
                    if (entry.kind !== 'blocker') return false
                    const content = entry.content && typeof entry.content === 'object' ? entry.content as Record<string, unknown> : null
                    return content?.workItemId === workItem.id && content?.source === 'policy:escalation'
                })
                if (exists) continue
                const blockerThread = threads.find((thread) => thread.kind === 'blocker' && thread.summary?.includes(workItem.id))
                    ?? this.store.swarms.addSwarmThread({
                        swarmId,
                        namespace,
                        title: `Blocker: ${workItem.title}`,
                        kind: 'blocker',
                        status: 'open',
                        summary: `Auto escalation for work item ${workItem.id}`
                    })
                const blockerEntry = this.store.swarms.addSwarmThreadEntry({
                    swarmId,
                    threadId: blockerThread.id,
                    namespace,
                    kind: 'blocker',
                    participantId: coordinatorBinding?.participantId ?? null,
                    content: {
                        source: 'policy:escalation',
                        workItemId: workItem.id
                    }
                })
                this.store.swarms.addSwarmOutcome({
                    swarmId,
                    namespace,
                    subjectId,
                    workItemId: workItem.id,
                    kind: 'blocker',
                    status: 'blocked',
                    createdByParticipantId: coordinatorBinding?.participantId ?? null,
                    content: {
                        source: 'policy:escalation',
                        threadId: blockerThread.id,
                        threadEntryId: blockerEntry.id
                    }
                })
            }
        }

        if (hasPolicy('deliberation', 'debate', 'rebuttal')) {
            const deliberationPolicy = this.getSwarmPolicyConfig<{ maxRebuttalsPerThread?: number }>(swarmId, namespace, 'deliberation')
            for (const blockerEntry of threadEntries.filter((entry) => entry.kind === 'blocker')) {
                const rebuttalExists = threadEntries.some((entry) =>
                    entry.threadId === blockerEntry.threadId
                    && entry.kind === 'rebuttal'
                    && (entry.replyToEntryId === blockerEntry.id || (entry.citesEntryIds ?? []).includes(blockerEntry.id))
                )
                if (rebuttalExists) continue
                const content = blockerEntry.content && typeof blockerEntry.content === 'object' ? blockerEntry.content as Record<string, unknown> : null
                this.store.swarms.addSwarmThreadEntry({
                    swarmId,
                    threadId: blockerEntry.threadId,
                    namespace,
                    kind: 'rebuttal',
                    participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                    replyToEntryId: blockerEntry.id,
                    citesEntryIds: [blockerEntry.id],
                    content: {
                        source: 'policy:auto-rebuttal',
                        workItemId: typeof content?.workItemId === 'string' ? content.workItemId : null,
                        suggestion: 'Split scope or reassign to a different participant.'
                    }
                })
            }
            const allThreadEntries = this.store.swarms.getSwarmThreadEntries(swarmId, namespace)
            for (const thread of threads) {
                const entries = allThreadEntries.filter((entry) => entry.threadId === thread.id)
                const proposalCount = entries.filter((entry) => entry.kind === 'proposal').length
                const rebuttalCount = entries.filter((entry) => entry.kind === 'rebuttal').length
                const decisionExists = entries.some((entry) => entry.kind === 'decision')
                if (decisionExists || proposalCount === 0 || rebuttalCount === 0) {
                    continue
                }
                if (typeof deliberationPolicy.maxRebuttalsPerThread === 'number' && rebuttalCount < deliberationPolicy.maxRebuttalsPerThread) {
                    continue
                }
                const latestProposal = [...entries].reverse().find((entry) => entry.kind === 'proposal') ?? entries[0] ?? null
                const decisionEntry = this.store.swarms.addSwarmThreadEntry({
                    swarmId,
                    threadId: thread.id,
                    namespace,
                    kind: 'decision',
                    participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                    replyToEntryId: latestProposal?.id ?? null,
                    citesEntryIds: latestProposal ? [latestProposal.id] : [],
                    content: {
                        source: 'policy:auto-decision',
                        proposalCount,
                        rebuttalCount,
                        selectedEntryId: latestProposal?.id ?? null,
                        resolution: 'Sufficient deliberation reached; converge on current proposal.'
                    }
                })
                this.store.swarms.addSwarmOutcome({
                    swarmId,
                    namespace,
                    subjectId,
                    kind: 'decision',
                    status: 'completed',
                    createdByParticipantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                    content: {
                        source: 'policy:auto-decision',
                        threadId: thread.id,
                        threadEntryId: decisionEntry.id
                    }
                })
                this.store.swarms.addSwarmActivity({
                    swarmId,
                    namespace,
                    subjectId,
                    kind: 'summarize',
                    status: 'completed',
                    participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                    content: {
                        source: 'policy:auto-decision',
                        threadId: thread.id,
                        threadEntryId: decisionEntry.id
                    }
                })
            }
        }

        if (hasPolicy('review', 'verification')) {
            for (const workItem of workItems.filter((item) => item.status === 'completed')) {
                if (reviews.some((review) => review.workItemId === workItem.id)) {
                    continue
                }
                const reviewThread = threads.find((thread) => thread.kind === 'review' && thread.summary?.includes(workItem.id))
                    ?? this.store.swarms.addSwarmThread({
                        swarmId,
                        namespace,
                        title: `Review: ${workItem.title}`,
                        kind: 'review',
                        status: 'open',
                        summary: `Auto review request for work item ${workItem.id}`
                    })
                const existingRequest = threadEntries.some((entry) => {
                    if (entry.threadId !== reviewThread.id || entry.kind !== 'review_request') return false
                    const content = entry.content && typeof entry.content === 'object' ? entry.content as Record<string, unknown> : null
                    return content?.workItemId === workItem.id
                })
                if (existingRequest) {
                    continue
                }
                this.store.swarms.addSwarmThreadEntry({
                    swarmId,
                    threadId: reviewThread.id,
                    namespace,
                    kind: 'review_request',
                    participantId: reviewerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                    content: {
                        source: 'policy:review',
                        workItemId: workItem.id
                    }
                })
                const reviewer = reviewerBinding ? participants.find((item) => item.id === reviewerBinding.participantId) : null
                if (reviewer?.refId) {
                    const roleExecutionContext = this.buildSwarmRoleExecutionContext(swarmId, namespace, reviewer.id)
                    await this.sendMessage(reviewer.refId, {
                        text: `[SWARM_CONTEXT]\nSwarm: ${swarm.title}\nSwarm ID: ${swarmId}\nCurrent phase: ${swarm.currentPhase}\nReview requested for: ${workItem.title}\nWork item ID: ${workItem.id}\n[/SWARM_CONTEXT]${this.buildSwarmRoleExecutionBlocks(roleExecutionContext, { swarmId, workItemId: workItem.id })}\n\nPlease review this work item and produce a verdict.`,
                        sentFrom: 'webapp',
                        meta: {
                            swarmId,
                            participantId: reviewer.id,
                            swarmWorkItemId: workItem.id,
                            swarmRoles: roleExecutionContext.activeRoles,
                            swarmPreferredSkillIds: roleExecutionContext.preferredSkillIds,
                            swarmAllowedTools: roleExecutionContext.allowedTools,
                            swarmOutputContracts: roleExecutionContext.outputContracts
                        }
                    })
                }
            }
        }
    }

    private pickBestSwarmParticipant(
        swarmId: string,
        namespace: string,
        options: {
            text?: string | null
            expectedArtifact?: string | null
            doneCriteria?: string | null
            excludeParticipantIds?: string[]
        }
    ) {
        const participants = this.store.swarms.getSwarmParticipants(swarmId, namespace)
        const assignments = this.store.swarms.getSwarmWorkItemAssignments(swarmId, namespace)
        const leases = this.store.swarms.getSwarmParticipantLeases(swarmId, namespace)
        const excluded = new Set(options.excludeParticipantIds ?? [])
        const bag = `${options.text ?? ''}\n${options.expectedArtifact ?? ''}\n${options.doneCriteria ?? ''}`.toLowerCase()
        const requiredCapabilities = new Set<string>()
        if (/(code|implement|refactor|fix|bug|patch|typescript|javascript|react|component|api|route)/.test(bag)) requiredCapabilities.add('coding')
        if (/(test|verify|assert|qa|coverage|vitest|unit test|integration)/.test(bag)) requiredCapabilities.add('testing')
        if (/(research|investigate|analyze|plan|design|spec|proposal|decision)/.test(bag)) requiredCapabilities.add('planning')
        if (/(review|audit|check|lint|inspect)/.test(bag)) requiredCapabilities.add('review')
        if (/(report|summary|document|docs|markdown|writeup)/.test(bag)) requiredCapabilities.add('documentation')

        let best: (typeof participants)[number] | null = null
        let bestScore = Number.NEGATIVE_INFINITY
        for (const participant of participants) {
            if (excluded.has(participant.id) || participant.kind !== 'agent' || !participant.refId) {
                continue
            }
            const session = this.getSessionByNamespace(participant.refId, namespace)
            if (!session?.active) {
                continue
            }
            const capabilities = new Set((participant.capabilities ?? []).map((item) => item.toLowerCase()))
            const assignmentLoad = assignments.filter((item) => item.participantId === participant.id && item.status !== 'released').length
            const leaseLoad = leases.filter((item) => item.participantId === participant.id && item.status === 'active' && (!item.expiresAt || item.expiresAt > Date.now())).length
            let score = participant.availability === 'active' ? 2 : 0
            for (const capability of requiredCapabilities) {
                score += capabilities.has(capability) ? 4 : -1
            }
            score -= assignmentLoad * 2
            score -= leaseLoad
            score += participant.model ? 0.5 : 0
            if (score > bestScore) {
                best = participant
                bestScore = score
            }
        }
        return best
    }

    private getSwarmPolicyConfig<T extends Record<string, unknown>>(swarmId: string, namespace: string, kind: string): T {
        const policy = this.store.swarms.getSwarmPolicies(swarmId, namespace)
            .find((item) => item.kind.toLowerCase() === kind.toLowerCase() && item.status !== 'disabled')
        return ((policy?.config && typeof policy.config === 'object') ? policy.config : {}) as T
    }

    private inferSwarmPlanCapabilities(text: string): string[] {
        const bag = text.toLowerCase()
        const requiredCapabilities = new Set<string>()
        if (/(code|implement|refactor|fix|bug|patch|typescript|javascript|react|component|api|route)/.test(bag)) requiredCapabilities.add('coding')
        if (/(test|verify|assert|qa|coverage|vitest|unit test|integration)/.test(bag)) requiredCapabilities.add('testing')
        if (/(research|investigate|analyze|plan|design|spec|proposal|decision)/.test(bag)) requiredCapabilities.add('planning')
        if (/(review|audit|check|lint|inspect)/.test(bag)) requiredCapabilities.add('review')
        if (/(report|summary|document|docs|markdown|writeup)/.test(bag)) requiredCapabilities.add('documentation')
        return [...requiredCapabilities]
    }

    private buildSwarmRoleExecutionContext(swarmId: string, namespace: string, participantId: string) {
        const roleBindings = this.store.swarms.getSwarmRoleBindings(swarmId, namespace).filter((item) => item.participantId === participantId)
        const activeRoles = roleBindings.map((item) => item.role)
        const profiles = this.store.swarms.getSwarmRoleProfiles(swarmId, namespace).filter((profile) => activeRoles.includes(profile.role))
        const instructionText = profiles
            .map((profile) => profile.instructionText?.trim())
            .filter((item): item is string => Boolean(item))
            .join('\n\n')
        return {
            activeRoles,
            preferredSkillIds: [...new Set(profiles.flatMap((profile) => profile.preferredSkillIds ?? []))],
            allowedTools: [...new Set(profiles.flatMap((profile) => profile.allowedTools ?? []))],
            outputContracts: [...new Set(profiles.map((profile) => profile.outputContract).filter((item): item is string => Boolean(item)))],
            instructionText
        }
    }

    private buildSwarmRoleExecutionBlocks(
        context: ReturnType<SyncEngine['buildSwarmRoleExecutionContext']>,
        refs?: { swarmId?: string | null; subjectId?: string | null; workItemId?: string | null }
    ): string {
        const toolCallBlock = refs?.swarmId
            ? `\n[SWARM_TOOL_CALLS]\nUse HAQI tools only for stage effects.\n- record_outcome: proposals, blockers, decisions, summaries\n- record_artifact: diff, patch, report, document, test artifact\n- record_review: approved / changes_requested / commented verdicts\n- record_activity: stage start/completion for explore/implement/verify/coordinate\n- record_effect: fallback only when no stricter tool fits\nUse swarm_id=${refs.swarmId}${refs.subjectId ? `, subject_id=${refs.subjectId}` : ''}${refs.workItemId ? `, work_item_id=${refs.workItemId}` : ''}.\nDo not call tools for every message; only for stage effects.\n[/SWARM_TOOL_CALLS]`
            : ''
        return `${context.activeRoles.length > 0 ? `\n[SWARM_ROLE]\nRoles: ${context.activeRoles.join(', ')}\n[/SWARM_ROLE]` : ''}${context.instructionText ? `\n[SWARM_ROLE_INSTRUCTIONS]\n${context.instructionText}\n[/SWARM_ROLE_INSTRUCTIONS]` : ''}${context.preferredSkillIds.length > 0 ? `\n[SWARM_SKILLS]\nUse these skills if available: ${context.preferredSkillIds.map((item) => `$${item}`).join(', ')}\n[/SWARM_SKILLS]` : ''}${context.allowedTools.length > 0 ? `\n[SWARM_TOOL_POLICY]\nAllowed tools: ${context.allowedTools.join(', ')}\n[/SWARM_TOOL_POLICY]` : ''}${context.outputContracts.length > 0 ? `\n[SWARM_OUTPUT_CONTRACT]\n${context.outputContracts.join('; ')}\n[/SWARM_OUTPUT_CONTRACT]` : ''}${toolCallBlock}`
    }

    private getSwarmRoleProfilePreferredSkillIds(swarmId: string, namespace: string, role: string): string[] {
        return [
            ...new Set(
                this.store.swarms.getSwarmRoleProfiles(swarmId, namespace)
                    .filter((profile) => profile.role === role)
                    .flatMap((profile) => profile.preferredSkillIds ?? [])
            )
        ]
    }

    private async pickBestSwarmParticipantWithSkills(
        swarmId: string,
        namespace: string,
        options: Parameters<SyncEngine['pickBestSwarmParticipant']>[2] & { preferredSkillIds?: string[] }
    ) {
        const base = this.pickBestSwarmParticipant(swarmId, namespace, options)
        const preferred = new Set((options.preferredSkillIds ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
        if (preferred.size === 0) {
            return base
        }
        const participants = this.store.swarms.getSwarmParticipants(swarmId, namespace).filter((item) => item.kind === 'agent' && item.refId)
        let best = base
        let bestBonus = -1
        for (const participant of participants) {
            if (options.excludeParticipantIds?.includes(participant.id)) {
                continue
            }
            const session = this.getSessionByNamespace(participant.refId!, namespace)
            if (!session?.active) {
                continue
            }
            const result = await this.listSkills(participant.refId!)
            if (!result.success || !result.skills) {
                continue
            }
            const skillSet = new Set(result.skills.map((item) => item.name.trim().toLowerCase()))
            let bonus = 0
            for (const skill of preferred) {
                if (skillSet.has(skill)) {
                    bonus += 3
                }
            }
            bonus += this.scoreSwarmAllowedToolsBonus(swarmId, namespace, participant.id, options.expectedArtifact, options.text)
            if (bonus > bestBonus) {
                best = participant
                bestBonus = bonus
            }
        }
        return best
    }

    private scoreSwarmAllowedToolsBonus(swarmId: string, namespace: string, participantId: string, expectedArtifact?: string | null, text?: string | null): number {
        const context = this.buildSwarmRoleExecutionContext(swarmId, namespace, participantId)
        const allowed = new Set(context.allowedTools.map((item) => item.trim().toLowerCase()))
        const bag = `${expectedArtifact ?? ''}\n${text ?? ''}`.toLowerCase()
        let score = 0
        if (/(test|verify|coverage|assert)/.test(bag) && allowed.has('run_tests')) score += 2
        if (/(code|implement|patch|fix|refactor)/.test(bag) && allowed.has('edit_file')) score += 2
        if (/(research|summary|proposal|decision|report)/.test(bag) && allowed.has('read_file')) score += 1
        return score
    }

    private deriveSwarmPlanSteps(summary: string, maxItems: number): string[] {
        const normalized = summary
            .split(/\n+/)
            .map((line) => line.replace(/^[-*]\s*/, '').trim())
            .filter((line) => line.length > 0)
        const candidates = normalized.length > 1
            ? normalized
            : summary
                .split(/(?:[。！？!?]|\\. )+/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
        const sliced = candidates.slice(0, maxItems)
        if (sliced.length > 0) {
            return sliced
        }
        return [summary.trim()].filter((item) => item.length > 0)
    }

    private deriveSwarmWorkItemStatusFromArtifactWithContract(status: string | undefined, outputContracts: string[]): string | null {
        const normalized = status?.trim().toLowerCase()
        if (outputContracts.some((item) => item.toLowerCase().includes('review verdict'))) {
            return 'running'
        }
        if (!normalized) {
            return 'running'
        }
        if (['completed', 'complete', 'final', 'published', 'ready'].includes(normalized)) {
            return 'completed'
        }
        if (normalized === 'blocked') {
            return 'blocked'
        }
        if (normalized === 'canceled') {
            return 'canceled'
        }
        return 'running'
    }

    private async createSwarmAutoPlan(
        swarmId: string,
        namespace: string,
        options: {
            maxItems: number
            dispatch: boolean
        }
    ): Promise<void> {
        const swarm = this.store.swarms.getSwarmByNamespace(swarmId, namespace)
        const subject = this.store.swarms.getSwarmSubject(swarmId, namespace)
        if (!swarm || !subject?.summary?.trim()) {
            return
        }
        if (this.store.swarms.getSwarmWorkItems(swarmId, namespace).length > 0) {
            return
        }
        if (this.store.swarms.getSwarmActivities(swarmId, namespace).some((item) => item.kind === 'plan')) {
            return
        }
        const summary = subject.summary.trim()
        const threads = this.store.swarms.getSwarmThreads(swarmId, namespace)
        const planningThread = threads.find((item) => item.kind === 'planning')
            ?? this.store.swarms.addSwarmThread({
                swarmId,
                namespace,
                title: 'Planning',
                kind: 'planning',
                status: 'active',
                summary: 'Auto-generated planning thread'
            })
        const planner = await this.pickBestSwarmParticipantWithSkills(swarmId, namespace, {
            text: summary,
            expectedArtifact: 'plan',
            preferredSkillIds: this.getSwarmRoleProfilePreferredSkillIds(swarmId, namespace, 'planner')
        })
        const steps = this.deriveSwarmPlanSteps(summary, options.maxItems)
        const plannedItems = steps.map((step, index) => {
            const requiredCapabilities = this.inferSwarmPlanCapabilities(step)
            return {
                index: index + 1,
                title: step.slice(0, 120),
                intent: step,
                requiredCapabilities,
                expectedArtifact: requiredCapabilities.includes('documentation')
                    ? 'report'
                    : requiredCapabilities.includes('testing')
                        ? 'test-result'
                        : requiredCapabilities.includes('planning')
                            ? 'proposal'
                            : 'code-change',
                doneCriteria: requiredCapabilities.includes('testing')
                    ? 'Evidence or tests recorded'
                    : requiredCapabilities.includes('planning')
                        ? 'Proposal or decision recorded'
                        : 'Artifact or implementation result recorded'
            }
        })
        const plannerActivity = this.store.swarms.addSwarmActivity({
            swarmId,
            namespace,
            subjectId: subject.id,
            kind: 'plan',
            status: 'completed',
            participantId: planner?.id ?? null,
            content: {
                source: 'policy:auto-plan',
                plannerParticipantId: planner?.id ?? null,
                stepCount: plannedItems.length,
                plannedItems
            }
        })
        for (const planItem of plannedItems) {
            const candidate = await this.pickBestSwarmParticipantWithSkills(swarmId, namespace, {
                text: planItem.intent,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria,
                preferredSkillIds: this.getSwarmRoleProfilePreferredSkillIds(swarmId, namespace, 'implementer')
            })
            const workItem = this.store.swarms.addSwarmWorkItem({
                swarmId,
                namespace,
                subjectId: subject.id,
                title: planItem.title,
                intent: planItem.intent,
                status: options.dispatch && candidate ? 'dispatched' : 'open',
                assignedParticipantId: candidate?.id ?? null,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria,
                lastDispatchAt: options.dispatch && candidate ? Date.now() : null
            })
            const entry = this.store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId: planningThread.id,
                namespace,
                kind: 'proposal',
                participantId: planner?.id ?? null,
                content: {
                    source: 'policy:auto-plan',
                    index: planItem.index,
                    title: planItem.title,
                    workItemId: workItem.id,
                    intent: planItem.intent,
                    requiredCapabilities: planItem.requiredCapabilities,
                    expectedArtifact: planItem.expectedArtifact,
                    doneCriteria: planItem.doneCriteria,
                    assignedParticipantId: candidate?.id ?? null
                }
            })
            this.store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId: subject.id,
                workItemId: workItem.id,
                kind: 'proposal',
                status: 'open',
                createdByParticipantId: planner?.id ?? null,
                content: {
                    source: 'policy:auto-plan',
                    threadId: planningThread.id,
                    threadEntryId: entry.id,
                    title: planItem.title,
                    intent: planItem.intent,
                    requiredCapabilities: planItem.requiredCapabilities,
                    expectedArtifact: planItem.expectedArtifact,
                    doneCriteria: planItem.doneCriteria
                }
            })
            if (options.dispatch && candidate?.refId) {
                const dispatchAt = Date.now()
                this.store.swarms.releaseSwarmWorkItemAssignments({
                    swarmId,
                    workItemId: workItem.id,
                    namespace,
                    reason: 'policy:auto-plan-dispatch'
                })
                const assignment = this.store.swarms.addSwarmWorkItemAssignment({
                    swarmId,
                    workItemId: workItem.id,
                    participantId: candidate.id,
                    namespace,
                    status: 'active',
                    reason: 'policy:auto-plan-dispatch'
                })
                this.store.swarms.upsertSwarmParticipantLease({
                    swarmId,
                    workItemId: workItem.id,
                    participantId: candidate.id,
                    namespace,
                    status: 'active',
                    lastHeartbeatAt: dispatchAt,
                    expiresAt: dispatchAt + 30 * 60 * 1000
                })
                const roleExecutionContext = this.buildSwarmRoleExecutionContext(swarmId, namespace, candidate.id)
                await this.sendMessage(candidate.refId, {
                    text: `[SWARM_CONTEXT]\nSwarm: ${swarm.title}\nSwarm ID: ${swarmId}\nSubject: ${summary}\nCurrent phase: ${swarm.currentPhase}\nWork item ID: ${workItem.id}\nExpected artifact: ${planItem.expectedArtifact}\n[/SWARM_CONTEXT]${this.buildSwarmRoleExecutionBlocks(roleExecutionContext, { swarmId, workItemId: workItem.id })}\n\n${planItem.intent}`,
                    sentFrom: 'webapp',
                    meta: {
                        swarmId,
                        participantId: candidate.id,
                        swarmWorkItemId: workItem.id,
                        plannerActivityId: plannerActivity.id,
                        swarmRoles: roleExecutionContext.activeRoles,
                        swarmPreferredSkillIds: roleExecutionContext.preferredSkillIds,
                        swarmAllowedTools: roleExecutionContext.allowedTools,
                        swarmOutputContracts: roleExecutionContext.outputContracts
                    }
                })
                this.store.swarms.addSwarmEvent({
                    swarmId,
                    namespace,
                    type: 'auto-dispatch-requested',
                    payload: {
                        source: 'policy:auto-plan',
                        workItemId: workItem.id,
                        participantId: candidate.id,
                        sessionId: candidate.refId,
                        assignmentId: assignment.id
                    }
                })
            }
        }
    }

    private async reassignExpiredSwarmLeases(): Promise<void> {
        const namespaces = [...new Set(this.getSessions().map((session) => session.namespace))]
        const now = Date.now()
        for (const namespace of namespaces) {
            const swarms = this.store.swarms.getSwarmsByNamespace(namespace)
            for (const swarm of swarms) {
                await withSwarmAutomationLock(swarm.id, namespace, async () => {
                    let swarmChanged = false
                    const currentSwarm = this.store.swarms.getSwarmByNamespace(swarm.id, namespace)
                    if (!currentSwarm) {
                        return
                    }
                    const autonomyConfig = this.getSwarmPolicyConfig<{
                        maxAutoReassignments?: number
                        stopOnDeliver?: boolean
                    }>(swarm.id, namespace, 'autonomy')
                    if (autonomyConfig.stopOnDeliver && (currentSwarm.currentPhase === 'deliver' || currentSwarm.status === 'completed' || currentSwarm.status === 'canceled')) {
                        return
                    }
                    const reassignCount = this.store.swarms.getSwarmEvents(swarm.id, namespace)
                        .filter((event) => event.type === 'work-item-reassigned').length
                    const reassignBudgetExceeded = typeof autonomyConfig.maxAutoReassignments === 'number'
                        && reassignCount >= autonomyConfig.maxAutoReassignments
                    const leases = this.store.swarms.getSwarmParticipantLeases(swarm.id, namespace)
                    for (const lease of leases) {
                        if (lease.status !== 'active' || !lease.expiresAt || lease.expiresAt > now) {
                            continue
                        }
                        const workItem = this.store.swarms.getSwarmWorkItemById(swarm.id, namespace, lease.workItemId)
                        if (!workItem || workItem.status === 'completed' || workItem.status === 'canceled') {
                            this.store.swarms.upsertSwarmParticipantLease({
                                swarmId: swarm.id,
                                workItemId: lease.workItemId,
                                participantId: lease.participantId,
                                namespace,
                                status: 'released',
                                releasedAt: now,
                                expiresAt: lease.expiresAt,
                                lastHeartbeatAt: lease.lastHeartbeatAt
                            })
                            swarmChanged = true
                            continue
                        }

                        this.store.swarms.upsertSwarmParticipantLease({
                            swarmId: swarm.id,
                            workItemId: lease.workItemId,
                            participantId: lease.participantId,
                            namespace,
                            status: 'expired',
                            releasedAt: now,
                            expiresAt: lease.expiresAt,
                            lastHeartbeatAt: lease.lastHeartbeatAt
                        })
                        this.store.swarms.releaseSwarmWorkItemAssignments({
                            swarmId: swarm.id,
                            workItemId: lease.workItemId,
                            participantId: lease.participantId,
                            namespace,
                            reason: 'lease-expired'
                        })
                        swarmChanged = true

                        const expiredEvent = this.store.swarms.addSwarmEvent({
                            swarmId: swarm.id,
                            namespace,
                            type: 'lease-expired',
                            payload: {
                                workItemId: lease.workItemId,
                                participantId: lease.participantId,
                                expiresAt: lease.expiresAt
                            }
                        })
                        this.eventPublisher.emit({
                            type: 'swarm-event-created',
                            swarmId: swarm.id,
                            namespace,
                            event: expiredEvent
                        })

                        const expiredTransition = this.store.swarms.addSwarmTransition({
                            swarmId: swarm.id,
                            namespace,
                            entityType: 'work_item',
                            entityId: lease.workItemId,
                            fromState: workItem.status,
                            toState: 'blocked',
                            reason: 'lease-expired',
                            byParticipantId: lease.participantId
                        })
                        this.eventPublisher.emit({
                            type: 'swarm-transition-created',
                            swarmId: swarm.id,
                            namespace,
                            transition: expiredTransition
                        })

                        if (reassignBudgetExceeded) {
                            const paused = this.store.swarms.addSwarmEvent({
                                swarmId: swarm.id,
                                namespace,
                                type: 'autonomy-paused',
                                payload: {
                                    reason: 'max-auto-reassignments',
                                    workItemId: workItem.id
                                }
                            })
                            this.eventPublisher.emit({
                                type: 'swarm-event-created',
                                swarmId: swarm.id,
                                namespace,
                                event: paused
                            })
                            const blocked = this.store.swarms.updateSwarmWorkItem({
                                swarmId: swarm.id,
                                namespace,
                                workItemId: workItem.id,
                                status: 'blocked'
                            })
                            if (blocked) {
                                this.eventPublisher.emit({
                                    type: 'swarm-work-item-updated',
                                    swarmId: swarm.id,
                                    namespace,
                                    workItem: blocked
                                })
                            }
                            this.recomputeSwarmLifecycleNow(swarm.id, namespace)
                            continue
                        }

                        const candidate = await this.pickBestSwarmParticipantWithSkills(swarm.id, namespace, {
                            text: workItem.intent,
                            expectedArtifact: workItem.expectedArtifact,
                            doneCriteria: workItem.doneCriteria,
                            excludeParticipantIds: [lease.participantId],
                            preferredSkillIds: this.getSwarmRoleProfilePreferredSkillIds(swarm.id, namespace, 'implementer')
                        })
                        if (!candidate?.refId) {
                            const blocked = this.store.swarms.updateSwarmWorkItem({
                                swarmId: swarm.id,
                                namespace,
                                workItemId: workItem.id,
                                status: 'blocked'
                            })
                            if (blocked) {
                                this.eventPublisher.emit({
                                    type: 'swarm-work-item-updated',
                                    swarmId: swarm.id,
                                    namespace,
                                    workItem: blocked
                                })
                            }
                            this.recomputeSwarmLifecycleNow(swarm.id, namespace)
                            continue
                        }

                        try {
                            const dispatchAt = Date.now()
                            const reassigned = this.store.swarms.updateSwarmWorkItem({
                                swarmId: swarm.id,
                                namespace,
                                workItemId: workItem.id,
                                status: 'dispatched',
                                assignedParticipantId: candidate.id,
                                lastDispatchAt: dispatchAt
                            })
                            const assignment = this.store.swarms.addSwarmWorkItemAssignment({
                                swarmId: swarm.id,
                                workItemId: workItem.id,
                                participantId: candidate.id,
                                namespace,
                                status: 'active',
                                reason: 'lease-expired-reassign'
                            })
                            this.store.swarms.upsertSwarmParticipantLease({
                                swarmId: swarm.id,
                                workItemId: workItem.id,
                                participantId: candidate.id,
                                namespace,
                                status: 'active',
                                lastHeartbeatAt: dispatchAt,
                                expiresAt: dispatchAt + 30 * 60 * 1000,
                                releasedAt: null
                            })
                            const roleExecutionContext = this.buildSwarmRoleExecutionContext(swarm.id, namespace, candidate.id)
                            await this.sendMessage(candidate.refId, {
                                text: `[SWARM_CONTEXT]\nSwarm: ${currentSwarm.title}\nSwarm ID: ${currentSwarm.id}\nCurrent phase: ${currentSwarm.currentPhase}\nReassigned work item: ${workItem.title}\nWork item ID: ${workItem.id}\n[/SWARM_CONTEXT]${this.buildSwarmRoleExecutionBlocks(roleExecutionContext, { swarmId: currentSwarm.id, workItemId: workItem.id })}\n\n${workItem.intent?.trim() || workItem.title}`,
                                sentFrom: 'webapp',
                                meta: {
                                    swarmId: currentSwarm.id,
                                    participantId: candidate.id,
                                    swarmWorkItemId: workItem.id,
                                    reassignedFromParticipantId: lease.participantId,
                                    swarmRoles: roleExecutionContext.activeRoles,
                                    swarmPreferredSkillIds: roleExecutionContext.preferredSkillIds,
                                    swarmAllowedTools: roleExecutionContext.allowedTools,
                                    swarmOutputContracts: roleExecutionContext.outputContracts
                                }
                            })
                            this.store.swarms.addSwarmActivity({
                                swarmId: swarm.id,
                                namespace,
                                subjectId: this.store.swarms.getSwarmSubject(swarm.id, namespace)?.id ?? null,
                                workItemId: workItem.id,
                                kind: 'coordinate',
                                status: 'dispatched',
                                participantId: candidate.id,
                                content: {
                                    reason: 'lease-expired-reassign',
                                    fromParticipantId: lease.participantId,
                                    assignmentId: assignment.id
                                }
                            })
                            if (reassigned) {
                                this.eventPublisher.emit({
                                    type: 'swarm-work-item-updated',
                                    swarmId: swarm.id,
                                    namespace,
                                    workItem: reassigned
                                })
                            }
                            const reassignEvent = this.store.swarms.addSwarmEvent({
                                swarmId: swarm.id,
                                namespace,
                                type: 'work-item-reassigned',
                                payload: {
                                    workItemId: workItem.id,
                                    fromParticipantId: lease.participantId,
                                    toParticipantId: candidate.id,
                                    assignmentId: assignment.id
                                }
                            })
                            this.eventPublisher.emit({
                                type: 'swarm-event-created',
                                swarmId: swarm.id,
                                namespace,
                                event: reassignEvent
                            })
                        } catch {
                            const blocked = this.store.swarms.updateSwarmWorkItem({
                                swarmId: swarm.id,
                                namespace,
                                workItemId: workItem.id,
                                status: 'blocked'
                            })
                            if (blocked) {
                                this.eventPublisher.emit({
                                    type: 'swarm-work-item-updated',
                                    swarmId: swarm.id,
                                    namespace,
                                    workItem: blocked
                                })
                            }
                        }

                        this.recomputeSwarmLifecycleNow(swarm.id, namespace)
                    }
                    if (swarmChanged) {
                        await this.applySwarmPoliciesNow(swarm.id, namespace)
                        this.recomputeSwarmLifecycleNow(swarm.id, namespace)
                    }
                })
            }
        }
    }

    private reloadAll(): void {
        this.sessionCache.reloadAll()
        this.machineCache.reloadAll()
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string): Session {
        return this.sessionCache.getOrCreateSession(tag, metadata, agentState, namespace)
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown, namespace: string): Machine {
        return this.machineCache.getOrCreateMachine(id, metadata, runnerState, namespace)
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'telegram-bot' | 'webapp'
            meta?: Record<string, unknown>
        }
    ): Promise<void> {
        await this.messageService.sendMessage(sessionId, payload)
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.rpcGateway.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.rpcGateway.denyPermission(sessionId, requestId, decision)
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.rpcGateway.abortSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<void> {
        await this.rpcGateway.killSession(sessionId)
        this.handleSessionEnd({ sid: sessionId, time: Date.now() })
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<void> {
        await this.rpcGateway.switchSession(sessionId, to)
    }

    async renameSession(sessionId: string, name: string): Promise<void> {
        await this.sessionCache.renameSession(sessionId, name)
    }

    async setSessionPreviewUrl(sessionId: string, previewUrl: string | null): Promise<void> {
        await this.sessionCache.setPreviewUrl(sessionId, previewUrl)
    }

    getPreviewUrlHistory(namespace: string, limit?: number): PreviewUrlHistoryEntry[] {
        return this.sessionCache.getPreviewUrlHistory(namespace, limit)
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.sessionCache.deleteSession(sessionId)
    }

    async applySessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            modelMode?: ModelMode
            model?: string
            thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
            serviceTier?: 'fast' | 'flex'
            collaborationMode?: string | null
        }
    ): Promise<void> {
        let applied: {
            permissionMode?: Session['permissionMode']
            modelMode?: Session['modelMode']
            model?: string
            thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
            serviceTier?: 'fast' | 'flex'
            collaborationMode?: string
        } | undefined

        try {
            const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
            if (!result || typeof result !== 'object') {
                throw new Error('Invalid response from session config RPC')
            }
            const obj = result as {
                applied?: {
                    permissionMode?: Session['permissionMode']
                    modelMode?: Session['modelMode']
                    model?: string
                    thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
                    serviceTier?: 'fast' | 'flex'
                    collaborationMode?: string
                }
            }
            const fromRpc = obj.applied
            if (!fromRpc || typeof fromRpc !== 'object') {
                throw new Error('Missing applied session config')
            }
            applied = fromRpc
        } catch (error) {
            if (!this.shouldFallbackSessionConfig(sessionId, config, error)) {
                throw error
            }
            applied = {
                permissionMode: config.permissionMode,
                modelMode: config.modelMode,
                model: config.model,
                thinkEffort: config.thinkEffort,
                serviceTier: config.serviceTier,
                collaborationMode: config.collaborationMode ?? undefined
            }
        }

        const session = this.getSession(sessionId)
        const flavor = session?.metadata?.flavor ?? null
        const resolvedModelMode = applied.modelMode
            ?? (flavor === 'claude' ? inferClaudeModelModeFromModel(applied.model) : undefined)

        this.sessionCache.applySessionConfig(sessionId, {
            permissionMode: applied.permissionMode,
            modelMode: resolvedModelMode
        })

        const shouldUpdateModelMetadata = flavor === 'claude' && (applied.model !== undefined || config.model !== undefined)
        const shouldUpdateThinkEffortMetadata = (flavor === 'claude' || flavor === 'codex')
            && (applied.thinkEffort !== undefined || config.thinkEffort !== undefined)
        const shouldUpdateServiceTierMetadata = flavor === 'codex'
            && (applied.serviceTier !== undefined || config.serviceTier !== undefined)
        const shouldUpdateCollaborationModeMetadata = flavor === 'codex'
            && (applied.collaborationMode !== undefined || config.collaborationMode !== undefined)

        if (shouldUpdateModelMetadata || shouldUpdateThinkEffortMetadata || shouldUpdateServiceTierMetadata || shouldUpdateCollaborationModeMetadata) {
            const rawModel = applied.model ?? config.model
            const model = (() => {
                if (typeof rawModel !== 'string') return undefined
                const trimmed = rawModel.trim()
                if (!trimmed) return undefined
                const lowered = trimmed.toLowerCase()
                return lowered === 'default' || lowered === 'auto' ? undefined : trimmed
            })()
            const thinkEffort = this.normalizeThinkEffortForFlavor(
                applied.thinkEffort ?? config.thinkEffort,
                flavor
            )
            const collaborationMode = this.normalizeCollaborationModeForFlavor(
                applied.collaborationMode ?? config.collaborationMode,
                flavor
            )
            const serviceTier = this.normalizeServiceTierForFlavor(
                applied.serviceTier ?? config.serviceTier,
                flavor
            )
            const fallbackMetadata = session?.metadata ?? { path: '', host: '' }
            await this.sessionCache.updateSessionMetadata(sessionId, (metadata) => {
                const source = metadata ?? fallbackMetadata
                const next: typeof source = { ...source }

                if (shouldUpdateModelMetadata) {
                    if (model) {
                        next.model = model
                    } else {
                        delete next.model
                    }
                }

                if (shouldUpdateThinkEffortMetadata) {
                    if (thinkEffort) {
                        next.thinkEffort = thinkEffort
                    } else {
                        delete next.thinkEffort
                    }
                }

                if (shouldUpdateServiceTierMetadata) {
                    if (serviceTier) {
                        next.serviceTier = serviceTier
                    } else {
                        delete next.serviceTier
                    }
                }

                if (shouldUpdateCollaborationModeMetadata) {
                    if (collaborationMode) {
                        next.collaborationMode = collaborationMode
                    } else {
                        delete next.collaborationMode
                    }
                }

                return next
            })
        }

        if (applied.permissionMode === 'auto-approve') {
            void this.maybeAutoApprovePendingRequests(sessionId)
        }
    }

    private shouldFallbackSessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            modelMode?: ModelMode
            model?: string
            thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
            serviceTier?: 'fast' | 'flex'
            collaborationMode?: string | null
        },
        error: unknown
    ): boolean {
        if (config.permissionMode !== 'auto-approve') {
            return false
        }

        const message = error instanceof Error ? error.message : ''
        if (message !== 'Missing applied session config' && message !== 'Invalid response from session config RPC') {
            return false
        }

        const session = this.getSession(sessionId)
        return session?.metadata?.flavor === 'codex'
    }

    private normalizeThinkEffortForFlavor(
        value: string | undefined,
        flavor: string | null
    ): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
        if (typeof value !== 'string') {
            return undefined
        }

        const normalized = value.trim().toLowerCase()
        if (!normalized || normalized === 'auto') {
            return undefined
        }
        if (normalized !== 'low' && normalized !== 'medium' && normalized !== 'high' && normalized !== 'xhigh') {
            return undefined
        }
        if (flavor === 'claude' && normalized === 'xhigh') {
            return undefined
        }
        if (flavor !== 'claude' && flavor !== 'codex') {
            return undefined
        }
        return normalized
    }

    private normalizeCollaborationModeForFlavor(
        value: string | null | undefined,
        flavor: string | null
    ): string | undefined {
        if (flavor !== 'codex') {
            return undefined
        }

        if (typeof value !== 'string') {
            return undefined
        }

        const normalized = value.trim().toLowerCase()
        if (!normalized || normalized === 'default' || normalized === 'code' || normalized === 'normal') {
            return undefined
        }

        return normalized
    }

    private normalizeServiceTierForFlavor(
        value: string | undefined,
        flavor: string | null
    ): 'fast' | 'flex' | undefined {
        if (flavor !== 'codex' || typeof value !== 'string') {
            return undefined
        }
        const normalized = value.trim().toLowerCase()
        if (normalized === 'fast' || normalized === 'flex') {
            return normalized
        }
        return undefined
    }

    private async maybeAutoApprovePendingRequests(sessionId: string): Promise<void> {
        const session = this.getSession(sessionId)
        if (!session || session.permissionMode !== 'auto-approve') {
            return
        }

        const requests = session.agentState?.requests
        if (!requests || typeof requests !== 'object') {
            return
        }
        const completedRequests = session.agentState?.completedRequests

        for (const requestId of Object.keys(requests)) {
            if (completedRequests && requestId in completedRequests) {
                continue
            }

            const lockKey = `${sessionId}:${requestId}`
            if (this.autoApprovalInFlight.has(lockKey)) {
                continue
            }

            this.autoApprovalInFlight.add(lockKey)
            try {
                await this.rpcGateway.approvePermission(
                    sessionId,
                    requestId,
                    undefined,
                    undefined,
                    'approved'
                )
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`[SyncEngine] Failed to auto-approve request ${requestId} for ${sessionId}: ${message}`)
            } finally {
                this.autoApprovalInFlight.delete(lockKey)
            }
        }
    }

    private getPendingNoteRefreshTaskKey(route: GroupRouteContext): string | null {
        if (!route.taskId || !isNoteRefreshTaskId(route.taskId)) {
            return null
        }
        return `${route.groupId}:${route.taskId}`
    }

    private clearPendingNoteRefreshDraft(route: GroupRouteContext): void {
        const key = this.getPendingNoteRefreshTaskKey(route)
        if (!key) {
            return
        }
        this.pendingNoteRefreshDraftByTaskKey.delete(key)
        this.pendingNoteRefreshMirroredByTaskKey.delete(key)
    }

    private capturePendingNoteRefreshDraft(route: GroupRouteContext, envelope: MessageEnvelope): void {
        const key = this.getPendingNoteRefreshTaskKey(route)
        if (!key) {
            return
        }

        let text: string | null = null
        if (envelope.contentType === 'output') {
            text = extractClaudeText(envelope.data, { allowSummary: true })
        } else if (envelope.contentType === 'codex') {
            const data = asRecord(envelope.data)
            if (asString(data?.type) !== 'message') {
                return
            }
            text = extractCodexText(envelope.data)
        } else {
            return
        }

        if (!text) {
            return
        }

        const normalized = normalizeNoteRefreshContent(text)
        if (!normalized) {
            return
        }

        const existing = this.pendingNoteRefreshDraftByTaskKey.get(key)
        if (!existing || normalized.length >= existing.length) {
            this.pendingNoteRefreshDraftByTaskKey.set(key, normalized)
        }
    }

    private applyPendingNoteRefreshDraft(route: GroupRouteContext, namespace: string, sessionId: string): void {
        const key = this.getPendingNoteRefreshTaskKey(route)
        if (!key) {
            return
        }

        const content = this.pendingNoteRefreshDraftByTaskKey.get(key)
        this.pendingNoteRefreshDraftByTaskKey.delete(key)
        const hadMirroredTimelineOutput = this.pendingNoteRefreshMirroredByTaskKey.has(key)
        this.pendingNoteRefreshMirroredByTaskKey.delete(key)
        if (!content) {
            return
        }

        const group = this.groupService.getGroupByNamespace(route.groupId, namespace)
        if (!group) {
            return
        }
        if (group.group.noteSessionId !== sessionId) {
            return
        }

        try {
            this.groupService.updateGroupNote({
                groupId: route.groupId,
                namespace,
                content,
                updatedBy: `session:${sessionId}`
            })
            if (!hadMirroredTimelineOutput) {
                this.emitMirroredGroupMessage(route, sessionId, namespace, {
                    sessionId,
                    contentType: 'output',
                    text: truncateText(content, MAX_GROUP_MIRROR_TEXT_LENGTH)
                })
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[SyncEngine] Failed to update group note from note refresh task ${route.taskId}: ${message}`)
        }
    }

    private isSameGroupRoute(left: GroupRouteContext, right: GroupRouteContext): boolean {
        return left.groupId === right.groupId
            && (left.taskId ?? null) === (right.taskId ?? null)
            && (left.traceId ?? null) === (right.traceId ?? null)
    }

    private isCodexGroupSession(sessionId: string, namespace: string): boolean {
        const session = this.getSessionByNamespace(sessionId, namespace)
        return session?.metadata?.flavor === 'codex'
    }

    private emitMirroredGroupMessage(
        route: GroupRouteContext,
        sessionId: string,
        namespace: string,
        payload: MirroredPayload
    ): void {
        const noteRefreshTaskKey = this.getPendingNoteRefreshTaskKey(route)
        if (noteRefreshTaskKey) {
            this.pendingNoteRefreshMirroredByTaskKey.add(noteRefreshTaskKey)
        }

        void this.groupService.addTimelineMessage({
            groupId: route.groupId,
            namespace,
            type: 'chat',
            source: `session:${sessionId}`,
            actorSessionId: sessionId,
            traceId: route.traceId ?? null,
            taskId: route.taskId ?? null,
            targetSessionIds: route.targetSessionIds ?? null,
            payload
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[SyncEngine] Failed to mirror group message for ${sessionId}: ${message}`)
        })
    }

    private flushBufferedCodexMirror(sessionId: string, namespace: string): void {
        const buffered = this.bufferedCodexMirrorsBySession.get(sessionId)
        if (!buffered) {
            return
        }
        this.bufferedCodexMirrorsBySession.delete(sessionId)

        const merged = truncateText(
            buffered.chunks.join('\n\n').trim(),
            MAX_GROUP_MIRROR_TEXT_LENGTH
        )
        if (!merged) {
            return
        }

        this.emitMirroredGroupMessage(
            buffered.route,
            sessionId,
            namespace,
            {
                sessionId,
                contentType: 'codex',
                text: merged,
                merged: true,
                chunkCount: buffered.chunks.length
            }
        )
    }

    private bufferCodexMirror(
        sessionId: string,
        namespace: string,
        route: GroupRouteContext,
        text: string
    ): void {
        const normalized = text.trim()
        if (!normalized) {
            return
        }

        const existing = this.bufferedCodexMirrorsBySession.get(sessionId)
        if (existing && !this.isSameGroupRoute(existing.route, route)) {
            this.flushBufferedCodexMirror(sessionId, namespace)
        }

        const active = this.bufferedCodexMirrorsBySession.get(sessionId)
        if (!active) {
            this.bufferedCodexMirrorsBySession.set(sessionId, {
                route,
                chunks: [normalized]
            })
            return
        }

        const lastChunk = active.chunks[active.chunks.length - 1]
        if (lastChunk === normalized) {
            return
        }
        active.chunks.push(normalized)
    }

    private handleGroupRoutedMessage(
        sessionId: string,
        namespace: string,
        message: DecryptedMessage
    ): void {
        const envelope = parseMessageEnvelope(message.content)
        if (!envelope) {
            return
        }

        const routeFromMeta = parseRouteContext(envelope.meta?.routeContext)
        const isCodexSession = this.isCodexGroupSession(sessionId, namespace)
        if (envelope.role === 'user') {
            if (routeFromMeta) {
                const group = this.groupService.getGroupByNamespace(routeFromMeta.groupId, namespace)
                if (!group) {
                    this.clearPendingNoteRefreshDraft(routeFromMeta)
                    if (isCodexSession) {
                        this.flushBufferedCodexMirror(sessionId, namespace)
                    }
                    this.activeGroupRoutesBySession.delete(sessionId)
                    return
                }
                if (isCodexSession) {
                    const activeRoute = this.activeGroupRoutesBySession.get(sessionId)
                    if (activeRoute && !this.isSameGroupRoute(activeRoute, routeFromMeta)) {
                        this.flushBufferedCodexMirror(sessionId, namespace)
                    }
                }
                this.activeGroupRoutesBySession.set(sessionId, routeFromMeta)
                if (routeFromMeta.taskId) {
                    this.groupService.updateTaskExecutionStatus({
                        groupId: routeFromMeta.groupId,
                        taskId: routeFromMeta.taskId,
                        namespace,
                        status: 'running'
                    })
                }
            } else {
                // No routeContext in this user message. If a queue-pending route
                // exists (claude/gemini don't echo routeContext in their user echo),
                // keep the route alive rather than clearing it.
                const pendingRoute = this.queuePendingRoutes.get(sessionId)
                if (pendingRoute) {
                    this.activeGroupRoutesBySession.set(sessionId, pendingRoute)
                } else {
                    const activeRoute = this.activeGroupRoutesBySession.get(sessionId)
                    if (activeRoute) {
                        this.clearPendingNoteRefreshDraft(activeRoute)
                    }
                    if (isCodexSession) {
                        this.flushBufferedCodexMirror(sessionId, namespace)
                    }
                    this.activeGroupRoutesBySession.delete(sessionId)
                }
            }
            return
        }

        if (envelope.role !== 'agent') {
            return
        }

        const route = routeFromMeta ?? this.activeGroupRoutesBySession.get(sessionId)
        if (!route) {
            if (isCodexSession) {
                this.flushBufferedCodexMirror(sessionId, namespace)
            }
            return
        }

        const group = this.groupService.getGroupByNamespace(route.groupId, namespace)
        if (!group) {
            this.clearPendingNoteRefreshDraft(route)
            if (isCodexSession) {
                this.flushBufferedCodexMirror(sessionId, namespace)
            }
            this.activeGroupRoutesBySession.delete(sessionId)
            this.queuePendingRoutes.delete(sessionId)
            return
        }

        if (routeFromMeta) {
            if (isCodexSession) {
                const activeRoute = this.activeGroupRoutesBySession.get(sessionId)
                if (activeRoute && !this.isSameGroupRoute(activeRoute, route)) {
                    this.flushBufferedCodexMirror(sessionId, namespace)
                }
            }
            this.activeGroupRoutesBySession.set(sessionId, route)
        }

        if (route.taskId) {
            this.groupService.updateTaskExecutionStatus({
                groupId: route.groupId,
                taskId: route.taskId,
                namespace,
                status: 'running'
            })
        }

        this.capturePendingNoteRefreshDraft(route, envelope)

        if (isReadyEvent(envelope)) {
            if (isCodexSession) {
                this.flushBufferedCodexMirror(sessionId, namespace)
            }
            this.applyPendingNoteRefreshDraft(route, namespace, sessionId)
            if (route.taskId) {
                this.groupService.updateTaskExecutionStatus({
                    groupId: route.groupId,
                    taskId: route.taskId,
                    namespace,
                    status: 'completed'
                })
            }
            this.activeGroupRoutesBySession.delete(sessionId)
            this.queuePendingRoutes.delete(sessionId)
            return
        }

        const payload = buildMirroredPayload(sessionId, envelope, route)
        if (!payload) {
            return
        }

        if (isTitleMutationNoiseText(payload.text)) {
            return
        }

        if (isCodexSession && payload.contentType === 'codex') {
            if (payload.isCodexExecutionDetail) {
                return
            }
            this.bufferCodexMirror(sessionId, namespace, route, payload.text)
            return
        }

        if (isCodexSession && payload.contentType === 'event' && isCodexExecutionDetailText(payload.text)) {
            return
        }

        this.emitMirroredGroupMessage(route, sessionId, namespace, payload)
    }

    private async dispatchGroupTask(payload: {
        groupId: string
        namespace: string
        taskId: string
        traceId: string
        source: string
        targetSessionId: string
        command: string
    }): Promise<void> {
        const session = this.getSession(payload.targetSessionId)
        if (!session) {
            throw new Error('Target session not found')
        }
        if (session.namespace !== payload.namespace) {
            throw new Error('Target session access denied')
        }
        if (!session.active) {
            throw new Error('Target session is inactive')
        }

        const flavor = session.metadata?.flavor
        const routeContext = {
            groupId: payload.groupId,
            taskId: payload.taskId,
            traceId: payload.traceId,
            source: payload.source,
            targetSessionIds: [payload.targetSessionId]
        }

        if (flavor === 'claude') {
            // Pre-register route in both maps. queuePendingRoutes prevents the
            // user-message echo (which lacks routeContext) from clearing the route.
            this.activeGroupRoutesBySession.set(payload.targetSessionId, routeContext)
            this.queuePendingRoutes.set(payload.targetSessionId, routeContext)
            const result = await this.enqueueClaudeMessage(payload.targetSessionId, {
                text: payload.command,
                meta: { routeContext }
            })
            if (!result.success) {
                this.activeGroupRoutesBySession.delete(payload.targetSessionId)
                this.queuePendingRoutes.delete(payload.targetSessionId)
                throw new Error(result.error ?? 'Failed to enqueue Claude task')
            }
            return
        }

        if (flavor === 'gemini') {
            // Same treatment as claude
            this.activeGroupRoutesBySession.set(payload.targetSessionId, routeContext)
            this.queuePendingRoutes.set(payload.targetSessionId, routeContext)
            const result = await this.enqueueCodexMessage(payload.targetSessionId, {
                text: payload.command,
                meta: { routeContext }
            })
            if (!result.success) {
                this.activeGroupRoutesBySession.delete(payload.targetSessionId)
                this.queuePendingRoutes.delete(payload.targetSessionId)
                throw new Error(result.error ?? 'Failed to enqueue Gemini task')
            }
            return
        }

        if (flavor === 'codex') {
            // Codex echoes routeContext in its messages, so no pre-registration needed
            const result = await this.enqueueCodexMessage(payload.targetSessionId, {
                text: payload.command,
                meta: { routeContext }
            })
            if (!result.success) {
                throw new Error(result.error ?? 'Failed to enqueue Codex task')
            }
            return
        }

        // opencode and unknown flavors: fall back to direct send
        await this.sendMessage(payload.targetSessionId, {
            text: payload.command,
            sentFrom: 'webapp',
            meta: { routeContext }
        })
    }

    private async executeNoteRefresh(payload: {
        groupId: string
        namespace: string
        traceId: string
        noteSessionId: string
        source: string
        command: string
    }): Promise<{ accepted: boolean; reason?: string }> {
        try {
            await this.dispatchGroupTask({
                groupId: payload.groupId,
                namespace: payload.namespace,
                taskId: `note-refresh:${payload.traceId}`,
                traceId: payload.traceId,
                source: payload.source,
                targetSessionId: payload.noteSessionId,
                command: payload.command
            })
            return { accepted: true }
        } catch (error) {
            return {
                accepted: false,
                reason: error instanceof Error ? error.message : String(error)
            }
        }
    }

    async broadcastGroupNote(
        groupId: string,
        namespace: string,
        options: { source: string; broadcastedBy?: string }
    ): Promise<void> {
        const detail = this.groupService.getGroupByNamespace(groupId, namespace)
        const note = detail?.note

        if (!detail || !note?.content) {
            throw new Error('No group note to broadcast')
        }

        const members = detail.members.filter((m: any) => m.sessionId)
        if (members.length === 0) {
            throw new Error('No active members to broadcast to')
        }

        // 并行发送给所有成员
        await Promise.all(members.map(async (member: any) => {
            const traceId = `broadcast-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const routeContext = {
                groupId,
                traceId,
                source: options.source,
                targetSessionIds: [member.sessionId!]
            }

            const message = {
                text: `📝 **Group Note Broadcast**

**Group**: ${detail.group.name}
**Broadcasted by**: ${options.broadcastedBy ?? options.source}

## Current Group Note (v${note.version}):

${note.content}

---
*This is a manual broadcast. You can reference this information for current group context.*`,
                meta: { routeContext }
            }

            // 根据session类型选择队列
            const session = this.sessionCache.getSession(member.sessionId!)
            const flavor = session?.metadata?.flavor ?? 'claude'

            if (flavor === 'claude') {
                // Pre-register route for claude (similar to dispatchGroupTask)
                this.activeGroupRoutesBySession.set(member.sessionId!, routeContext)
                this.queuePendingRoutes.set(member.sessionId!, routeContext)
                const result = await this.enqueueClaudeMessage(member.sessionId!, message)
                if (!result.success) {
                    // Clean up on failure
                    this.activeGroupRoutesBySession.delete(member.sessionId!)
                    this.queuePendingRoutes.delete(member.sessionId!)
                    console.warn(`[SyncEngine] Failed to broadcast note to claude session ${member.sessionId}: ${result.error}`)
                }
            } else if (flavor === 'gemini') {
                // Same treatment as claude
                this.activeGroupRoutesBySession.set(member.sessionId!, routeContext)
                this.queuePendingRoutes.set(member.sessionId!, routeContext)
                const result = await this.enqueueCodexMessage(member.sessionId!, message)
                if (!result.success) {
                    // Clean up on failure
                    this.activeGroupRoutesBySession.delete(member.sessionId!)
                    this.queuePendingRoutes.delete(member.sessionId!)
                    console.warn(`[SyncEngine] Failed to broadcast note to gemini session ${member.sessionId}: ${result.error}`)
                }
            } else if (flavor === 'codex') {
                // Codex echoes routeContext in its messages, so no pre-registration needed
                const result = await this.enqueueCodexMessage(member.sessionId!, message)
                if (!result.success) {
                    console.warn(`[SyncEngine] Failed to broadcast note to codex session ${member.sessionId}: ${result.error}`)
                }
            } else {
                // Fallback for other flavors
                try {
                    await this.sendMessage(member.sessionId!, {
                        text: message.text,
                        sentFrom: 'webapp'
                    })
                } catch (error) {
                    console.warn(`[SyncEngine] Failed to broadcast note to session ${member.sessionId}:`, error)
                }
            }
        }))

        // 在timeline中记录广播事件
        this.store.groups.addGroupMessage({
            groupId,
            namespace,
            type: 'system',
            source: options.source,
            payload: {
                action: 'note_broadcasted',
                noteVersion: note.version,
                targetCount: members.length,
                broadcastedBy: options.broadcastedBy
            }
        })
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent?: 'claude' | 'codex' | 'gemini' | 'opencode',
        model?: string,
        thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh',
        serviceTier?: 'fast' | 'flex',
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string,
        previewUrl?: string | null
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        const resolvedAgent = agent ?? this.inferSpawnFlavor(machineId, directory)
        const result = await this.rpcGateway.spawnSession(
            machineId,
            directory,
            resolvedAgent,
            model,
            thinkEffort,
            serviceTier,
            yolo,
            sessionType,
            worktreeName,
            resumeSessionId
        )

        if (result.type === 'success' && previewUrl) {
            try {
                await this.persistSessionPreviewUrlWithRetry(result.sessionId, previewUrl)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`[SyncEngine] Failed to persist preview URL for ${result.sessionId}: ${message}`)
            }
        }

        return result
    }

    async spawnSessionFromExisting(
        sourceSessionId: string,
        namespace: string,
        options: { inheritHistory: boolean }
    ): Promise<SpawnFromExistingSessionResult> {
        const access = this.sessionCache.resolveSessionAccess(sourceSessionId, namespace)
        if (!access.ok) {
            return {
                type: 'error',
                message: access.reason === 'access-denied' ? 'Session access denied' : 'Session not found',
                code: access.reason === 'access-denied' ? 'access_denied' : 'session_not_found'
            }
        }

        const sourceSession = access.session
        const metadata = sourceSession.metadata
        if (!metadata || typeof metadata.path !== 'string' || !metadata.path.trim()) {
            return { type: 'error', message: 'Session metadata missing path', code: 'spawn_unavailable' }
        }

        const onlineMachines = this.machineCache.getOnlineMachinesByNamespace(namespace)
        if (onlineMachines.length === 0) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const machine = (() => {
            if (metadata.machineId) {
                const exactMatch = onlineMachines.find((item) => item.id === metadata.machineId)
                if (exactMatch) return exactMatch
            }
            if (metadata.host) {
                const hostMatch = onlineMachines.find((item) => item.metadata?.host === metadata.host)
                if (hostMatch) return hostMatch
            }
            return onlineMachines[0] ?? null
        })()

        if (!machine) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const flavor = this.normalizeSpawnFlavor(metadata.flavor)
        const model = typeof metadata.model === 'string' && metadata.model.trim()
            ? metadata.model.trim()
            : undefined
        const thinkEffort = (() => {
            const value = typeof metadata.thinkEffort === 'string'
                ? metadata.thinkEffort.trim().toLowerCase()
                : ''
            if (value !== 'auto' && value !== 'low' && value !== 'medium' && value !== 'high' && value !== 'xhigh') {
                return undefined
            }
            if (flavor === 'claude' && value === 'xhigh') {
                return undefined
            }
            return value
        })()
        const serviceTier = (() => {
            const value = typeof metadata.serviceTier === 'string'
                ? metadata.serviceTier.trim().toLowerCase()
                : ''
            if (value !== 'fast' && value !== 'flex') {
                return undefined
            }
            return value
        })()
        const sessionType: 'simple' | 'worktree' = metadata.worktree ? 'worktree' : 'simple'
        const directory = metadata.worktree?.basePath?.trim() || metadata.path.trim()
        if (!directory) {
            return { type: 'error', message: 'Session metadata missing path', code: 'spawn_unavailable' }
        }

        const previewUrl = sourceSession.previewUrl ?? undefined
        const resumeToken = options.inheritHistory
            ? this.resolveResumeToken(flavor, metadata)
            : undefined
        const sourcePermissionMode = sourceSession.permissionMode
            && isPermissionModeAllowedForFlavor(sourceSession.permissionMode, flavor)
            ? sourceSession.permissionMode
            : undefined
        const sourceCollaborationMode = flavor === 'codex' && typeof metadata.collaborationMode === 'string'
            ? (metadata.collaborationMode.trim().toLowerCase() === 'plan' ? 'plan' : undefined)
            : undefined
        const duplicatedName = this.buildDuplicateSessionName(sourceSession)

        const spawn = async (resumeSessionId?: string) => await this.spawnSession(
            machine.id,
            directory,
            flavor,
            model,
            thinkEffort,
            serviceTier,
            undefined,
            sessionType,
            undefined,
            resumeSessionId,
            previewUrl
        )

        let spawnResult = await spawn(resumeToken)
        if (spawnResult.type !== 'success' && resumeToken) {
            spawnResult = await spawn(undefined)
        }

        if (spawnResult.type !== 'success') {
            return { type: 'error', message: spawnResult.message, code: 'spawn_failed' }
        }

        const becameAvailable = await this.waitForSessionAvailable(spawnResult.sessionId)
        if (!becameAvailable) {
            return { type: 'error', message: 'Session failed to initialize', code: 'spawn_failed' }
        }

        if (options.inheritHistory) {
            try {
                await this.sessionCache.copySessionHistory(access.sessionId, spawnResult.sessionId, namespace)
            } catch (error) {
                return {
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Failed to copy history',
                    code: 'history_copy_failed'
                }
            }
        }

        if (duplicatedName) {
            try {
                await this.sessionCache.renameSession(spawnResult.sessionId, duplicatedName)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`[SyncEngine] Failed to rename duplicated session ${spawnResult.sessionId}: ${message}`)
            }
        }

        if (sourcePermissionMode !== undefined || sourceCollaborationMode !== undefined) {
            const becameActive = await this.waitForSessionActive(spawnResult.sessionId)
            if (!becameActive) {
                console.warn(`[SyncEngine] Skipped copying session config for ${spawnResult.sessionId}: session not active`)
            } else {
                try {
                    await this.applySessionConfig(spawnResult.sessionId, {
                        permissionMode: sourcePermissionMode,
                        collaborationMode: sourceCollaborationMode
                    })
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`[SyncEngine] Failed to copy session config to ${spawnResult.sessionId}: ${message}`)
                }
            }
        }

        return { type: 'success', sessionId: spawnResult.sessionId }
    }

    async waitForSessionAvailable(sessionId: string, timeoutMs: number = 15_000): Promise<boolean> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            const session = this.getSession(sessionId)
            if (session) {
                return true
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        return false
    }

    private inferSpawnFlavor(machineId: string, directory: string): 'claude' | 'codex' | 'gemini' | 'opencode' {
        const normalizedDirectory = directory.trim()
        const sessions = this.sessionCache.getSessions()

        const sameDirectoryFlavor = sessions
            .filter((session) => {
                if (session.metadata?.machineId !== machineId) {
                    return false
                }
                const sessionDirectory = this.resolveSpawnDirectory(session)
                return sessionDirectory.length > 0 && sessionDirectory === normalizedDirectory
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((session) => this.readSessionFlavor(session))
            .find((value): value is 'claude' | 'codex' | 'gemini' | 'opencode' => value !== undefined)
        if (sameDirectoryFlavor) {
            return sameDirectoryFlavor
        }

        const sameMachineFlavor = sessions
            .filter((session) => session.metadata?.machineId === machineId)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((session) => this.readSessionFlavor(session))
            .find((value): value is 'claude' | 'codex' | 'gemini' | 'opencode' => value !== undefined)
        if (sameMachineFlavor) {
            return sameMachineFlavor
        }

        return 'claude'
    }

    private resolveSpawnDirectory(session: Session): string {
        const worktreeBasePath = session.metadata?.worktree?.basePath?.trim()
        if (worktreeBasePath) {
            return worktreeBasePath
        }
        const path = session.metadata?.path?.trim()
        return path ?? ''
    }

    private readSessionFlavor(session: Session): 'claude' | 'codex' | 'gemini' | 'opencode' | undefined {
        const flavor = session.metadata?.flavor
        if (flavor === 'claude' || flavor === 'codex' || flavor === 'gemini' || flavor === 'opencode') {
            return flavor
        }
        return undefined
    }

    private normalizeSpawnFlavor(value: string | null | undefined): 'claude' | 'codex' | 'gemini' | 'opencode' {
        return value === 'codex' || value === 'gemini' || value === 'opencode'
            ? value
            : 'claude'
    }

    private resolveResumeToken(
        flavor: 'claude' | 'codex' | 'gemini' | 'opencode',
        metadata: Session['metadata']
    ): string | undefined {
        if (!metadata) {
            return undefined
        }
        return flavor === 'codex'
            ? metadata.codexSessionId
            : flavor === 'gemini'
                ? metadata.geminiSessionId
                : flavor === 'opencode'
                    ? metadata.opencodeSessionId
                    : metadata.claudeSessionId
    }

    private buildDuplicateSessionName(session: Session): string | undefined {
        const baseName = this.resolveSessionDisplayName(session)
        if (!baseName) {
            return undefined
        }
        return this.withIncrementedDuplicateSuffix(baseName)
    }

    private resolveSessionDisplayName(session: Session): string | undefined {
        const metadata = session.metadata
        if (!metadata) {
            return undefined
        }

        const name = metadata.name?.trim()
        if (name) {
            return name
        }

        const summary = metadata.summary?.text?.trim()
        if (summary) {
            return summary
        }

        const path = metadata.path?.trim()
        if (!path) {
            return undefined
        }
        const normalized = path.replace(/[\\/]+$/, '')
        const parts = normalized.split(/[\\/]+/).filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : normalized
    }

    private withIncrementedDuplicateSuffix(name: string): string {
        const trimmed = name.trim()
        if (!trimmed) {
            return 'Session (1)'
        }

        const asciiMatch = trimmed.match(/^(.*?)(?:\s*)\((\d+)\)\s*$/)
        if (asciiMatch) {
            const next = Number.parseInt(asciiMatch[2], 10)
            if (Number.isFinite(next)) {
                return `${asciiMatch[1].trimEnd()} (${next + 1})`
            }
        }

        const fullWidthMatch = trimmed.match(/^(.*?)(?:\s*)（(\d+)）\s*$/)
        if (fullWidthMatch) {
            const next = Number.parseInt(fullWidthMatch[2], 10)
            if (Number.isFinite(next)) {
                return `${fullWidthMatch[1].trimEnd()}（${next + 1}）`
            }
        }

        return `${trimmed} (1)`
    }

    async resumeSession(sessionId: string, namespace: string): Promise<ResumeSessionResult> {
        const access = this.sessionCache.resolveSessionAccess(sessionId, namespace)
        if (!access.ok) {
            return {
                type: 'error',
                message: access.reason === 'access-denied' ? 'Session access denied' : 'Session not found',
                code: access.reason === 'access-denied' ? 'access_denied' : 'session_not_found'
            }
        }

        const session = access.session
        if (session.active) {
            return { type: 'success', sessionId: access.sessionId }
        }

        const metadata = session.metadata
        if (!metadata || typeof metadata.path !== 'string') {
            return { type: 'error', message: 'Session metadata missing path', code: 'resume_unavailable' }
        }

        const flavor = metadata.flavor === 'codex' || metadata.flavor === 'gemini' || metadata.flavor === 'opencode'
            ? metadata.flavor
            : 'claude'
        const resumeToken = flavor === 'codex'
            ? metadata.codexSessionId
            : flavor === 'gemini'
                ? metadata.geminiSessionId
                : flavor === 'opencode'
                    ? metadata.opencodeSessionId
                    : metadata.claudeSessionId

        if (!resumeToken) {
            return { type: 'error', message: 'Resume session ID unavailable', code: 'resume_unavailable' }
        }

        const onlineMachines = this.machineCache.getOnlineMachinesByNamespace(namespace)
        if (onlineMachines.length === 0) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const targetMachine = (() => {
            if (metadata.machineId) {
                const exact = onlineMachines.find((machine) => machine.id === metadata.machineId)
                if (exact) return exact
            }
            if (metadata.host) {
                const hostMatch = onlineMachines.find((machine) => machine.metadata?.host === metadata.host)
                if (hostMatch) return hostMatch
            }
            return null
        })()

        if (!targetMachine) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const spawnResult = await this.rpcGateway.spawnSession(
            targetMachine.id,
            metadata.path,
            flavor,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            resumeToken
        )

        if (spawnResult.type !== 'success') {
            return { type: 'error', message: spawnResult.message, code: 'resume_failed' }
        }

        const becameActive = await this.waitForSessionActive(spawnResult.sessionId)
        if (!becameActive) {
            return { type: 'error', message: 'Session failed to become active', code: 'resume_failed' }
        }

        if (spawnResult.sessionId !== access.sessionId) {
            try {
                await this.sessionCache.mergeSessions(access.sessionId, spawnResult.sessionId, namespace)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to merge resumed session'
                return { type: 'error', message, code: 'resume_failed' }
            }
        }

        return { type: 'success', sessionId: spawnResult.sessionId }
    }

    async waitForSessionActive(sessionId: string, timeoutMs: number = 15_000): Promise<boolean> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            const session = this.getSession(sessionId)
            if (session?.active) {
                return true
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        return false
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.rpcGateway.checkPathsExist(machineId, paths)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffFile(sessionId, options)
    }

    async getCodexStatus(sessionId: string): Promise<RpcCodexStatusResponse> {
        return await this.rpcGateway.getCodexStatus(sessionId)
    }

    private normalizeQueueText(value: string | undefined): string | undefined {
        if (typeof value !== 'string') {
            return undefined
        }
        const normalized = value.trim()
        return normalized.length > 0 ? normalized : undefined
    }

    private normalizeQueuePreview(value: string | undefined): string | undefined {
        if (typeof value !== 'string') {
            return undefined
        }
        const normalized = value.trim()
        return normalized.length > 0 ? normalized : undefined
    }

    private buildQueuePreviewFromText(text: string | undefined): string | undefined {
        const normalized = this.normalizeQueueText(text)
        if (!normalized) {
            return undefined
        }
        const compact = normalized.replace(/\s+/g, ' ')
        return compact.length <= 180 ? compact : `${compact.slice(0, 180)}...`
    }

    private attachLocalQueueText(
        sessionId: string,
        queue: RpcCodexQueueState | undefined,
        enqueuedText?: string
    ): RpcCodexQueueState | undefined {
        if (!queue) {
            this.localQueueTextBySession.delete(sessionId)
            this.localQueueTextBySessionPreview.delete(sessionId)
            return queue
        }

        const previousMap = this.localQueueTextBySession.get(sessionId) ?? new Map<string, string>()
        const previousPreviewMap = this.localQueueTextBySessionPreview.get(sessionId) ?? new Map<string, string>()
        const nextMap = new Map<string, string>()
        const nextPreviewMap = new Map<string, string>()
        const nextEntries = queue.entries.map((entry) => {
            const normalizedFromEntry = this.normalizeQueueText(entry.fullText)
            const normalizedFromLocal = previousMap.get(entry.id)
            const previewKey = this.normalizeQueuePreview(entry.preview)
            const normalizedFromPreview = previewKey ? previousPreviewMap.get(previewKey) : undefined
            const resolvedFullText = normalizedFromEntry ?? normalizedFromLocal ?? normalizedFromPreview
            if (resolvedFullText) {
                nextMap.set(entry.id, resolvedFullText)
                if (previewKey) {
                    nextPreviewMap.set(previewKey, resolvedFullText)
                }
            }
            return resolvedFullText
                ? { ...entry, fullText: resolvedFullText }
                : entry
        })

        const normalizedEnqueuedText = this.normalizeQueueText(enqueuedText)
        if (normalizedEnqueuedText) {
            const previewKeyFromEnqueue = this.buildQueuePreviewFromText(normalizedEnqueuedText)
            if (previewKeyFromEnqueue) {
                nextPreviewMap.set(previewKeyFromEnqueue, normalizedEnqueuedText)
            }
            const unseenCandidates = nextEntries
                .map((entry, index) => ({ entry, index }))
                .filter(({ entry }) => !previousMap.has(entry.id))
            const missingFullTextCandidates = nextEntries
                .map((entry, index) => ({ entry, index }))
                .filter(({ entry }) => !this.normalizeQueueText(entry.fullText))
            const candidates = unseenCandidates.length > 0 ? unseenCandidates : missingFullTextCandidates

            let candidate: { entry: RpcCodexQueueState['entries'][number]; index: number } | null = null
            for (const current of candidates) {
                if (!candidate) {
                    candidate = current
                    continue
                }
                if (current.entry.enqueuedAt > candidate.entry.enqueuedAt) {
                    candidate = current
                    continue
                }
                if (current.entry.enqueuedAt === candidate.entry.enqueuedAt && current.index > candidate.index) {
                    candidate = current
                }
            }

            if (candidate) {
                const target = nextEntries[candidate.index]
                if (target) {
                    nextEntries[candidate.index] = {
                        ...target,
                        fullText: normalizedEnqueuedText
                    }
                    nextMap.set(target.id, normalizedEnqueuedText)
                    const previewKey = this.normalizeQueuePreview(target.preview)
                    if (previewKey) {
                        nextPreviewMap.set(previewKey, normalizedEnqueuedText)
                    }
                }
            }
        }

        if (nextMap.size > 0) {
            this.localQueueTextBySession.set(sessionId, nextMap)
        } else {
            this.localQueueTextBySession.delete(sessionId)
        }
        if (nextPreviewMap.size > 0) {
            this.localQueueTextBySessionPreview.set(sessionId, nextPreviewMap)
        } else {
            this.localQueueTextBySessionPreview.delete(sessionId)
        }

        return {
            ...queue,
            entries: nextEntries
        }
    }

    private attachLocalQueueTextToResponse(
        sessionId: string,
        response: RpcCodexQueueResponse,
        enqueuedText?: string
    ): RpcCodexQueueResponse {
        return {
            ...response,
            queue: this.attachLocalQueueText(sessionId, response.queue, enqueuedText)
        }
    }

    async getCodexQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.getCodexQueue(sessionId)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async enqueueCodexMessage(
        sessionId: string,
        payload: {
            text: string
            meta?: {
                routeContext?: {
                    groupId: string
                    taskId?: string
                    traceId?: string
                    source: string
                    targetSessionIds?: string[]
                }
            }
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
        }
    ): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.enqueueCodexMessage(sessionId, payload)
        return this.attachLocalQueueTextToResponse(sessionId, response, payload.text)
    }

    async removeCodexQueueItem(sessionId: string, id: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.removeCodexQueueItem(sessionId, id)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async moveCodexQueueItem(sessionId: string, id: string, toIndex: number): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.moveCodexQueueItem(sessionId, id, toIndex)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async clearCodexQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.clearCodexQueue(sessionId)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async getClaudeQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.getClaudeQueue(sessionId)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async enqueueClaudeMessage(
        sessionId: string,
        payload: {
            text: string
            meta?: {
                routeContext?: {
                    groupId: string
                    taskId?: string
                    traceId?: string
                    source: string
                    targetSessionIds?: string[]
                }
            }
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
        }
    ): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.enqueueClaudeMessage(sessionId, payload)
        return this.attachLocalQueueTextToResponse(sessionId, response, payload.text)
    }

    async removeClaudeQueueItem(sessionId: string, id: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.removeClaudeQueueItem(sessionId, id)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async moveClaudeQueueItem(sessionId: string, id: string, toIndex: number): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.moveClaudeQueueItem(sessionId, id, toIndex)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async clearClaudeQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        const response = await this.rpcGateway.clearClaudeQueue(sessionId)
        return this.attachLocalQueueTextToResponse(sessionId, response)
    }

    async readSessionFile(
        sessionId: string,
        path: string,
        options?: { maxBytes?: number; allowOutsideWorkingDirectory?: boolean }
    ): Promise<RpcReadFileResponse> {
        return await this.rpcGateway.readSessionFile(sessionId, path, options)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.rpcGateway.listDirectory(sessionId, path)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.rpcGateway.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.rpcGateway.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.runRipgrep(sessionId, args, cwd)
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' }>
        error?: string
    }> {
        return await this.rpcGateway.listSlashCommands(sessionId, agent)
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.rpcGateway.listSkills(sessionId)
    }

    async listMcpServers(sessionId: string): Promise<RpcMcpServersResponse> {
        return await this.rpcGateway.listMcpServers(sessionId)
    }

    private async persistSessionPreviewUrlWithRetry(sessionId: string, previewUrl: string): Promise<void> {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            try {
                await this.sessionCache.setPreviewUrl(sessionId, previewUrl)
                return
            } catch (error) {
                if (attempt >= 9) {
                    throw error
                }
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }
    }
}
