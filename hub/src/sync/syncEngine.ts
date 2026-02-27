/**
 * Sync Engine for HAPI Telegram Bot (Direct Connect)
 *
 * In the direct-connect architecture:
 * - hapi-hub is the hub (Socket.IO + REST)
 * - hapi CLI connects directly to the hub (no relay)
 * - No E2E encryption; data is stored as JSON in SQLite
 */

import { inferClaudeModelModeFromModel, isPermissionModeAllowedForFlavor } from '@hapi/protocol'
import type { DecryptedMessage, ModelMode, PermissionMode, Session, SyncEvent } from '@hapi/protocol/types'
import type { Server } from 'socket.io'
import type { PreviewUrlHistoryEntry, Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'
import { EventPublisher, type SyncEventListener } from './eventPublisher'
import { GroupService, type GroupWithDetails } from './groupService'
import { MachineCache, type Machine } from './machineCache'
import { MessageService } from './messageService'
import {
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
        }
    ): Promise<void> {
        let applied: { permissionMode?: Session['permissionMode']; modelMode?: Session['modelMode']; model?: string } | undefined

        try {
            const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
            if (!result || typeof result !== 'object') {
                throw new Error('Invalid response from session config RPC')
            }
            const obj = result as { applied?: { permissionMode?: Session['permissionMode']; modelMode?: Session['modelMode']; model?: string } }
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
                model: config.model
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

        if (flavor === 'claude' && (applied.model !== undefined || config.model !== undefined)) {
            const rawModel = applied.model ?? config.model
            const model = (() => {
                if (typeof rawModel !== 'string') return undefined
                const trimmed = rawModel.trim()
                if (!trimmed) return undefined
                const lowered = trimmed.toLowerCase()
                return lowered === 'default' || lowered === 'auto' ? undefined : trimmed
            })()
            const fallbackMetadata = session?.metadata ?? { path: '', host: '' }
            await this.sessionCache.updateSessionMetadata(sessionId, (metadata) => ({
                ...(metadata ?? fallbackMetadata),
                model
            }))
        }

        if (applied.permissionMode === 'auto-approve') {
            void this.maybeAutoApprovePendingRequests(sessionId)
        }
    }

    private shouldFallbackSessionConfig(
        sessionId: string,
        config: { permissionMode?: PermissionMode; modelMode?: ModelMode; model?: string },
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
        agent: 'claude' | 'codex' | 'gemini' | 'opencode' = 'claude',
        model?: string,
        thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh',
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string,
        previewUrl?: string | null
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        const result = await this.rpcGateway.spawnSession(
            machineId,
            directory,
            agent,
            model,
            thinkEffort,
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
        const duplicatedName = this.buildDuplicateSessionName(sourceSession)

        const spawn = async (resumeSessionId?: string) => await this.spawnSession(
            machine.id,
            directory,
            flavor,
            model,
            undefined,
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

        if (sourcePermissionMode !== undefined) {
            const becameActive = await this.waitForSessionActive(spawnResult.sessionId)
            if (!becameActive) {
                console.warn(`[SyncEngine] Skipped copying permission mode for ${spawnResult.sessionId}: session not active`)
            } else {
                try {
                    await this.applySessionConfig(spawnResult.sessionId, { permissionMode: sourcePermissionMode })
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`[SyncEngine] Failed to copy permission mode to ${spawnResult.sessionId}: ${message}`)
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

    async getCodexQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.getCodexQueue(sessionId)
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
        return await this.rpcGateway.enqueueCodexMessage(sessionId, payload)
    }

    async removeCodexQueueItem(sessionId: string, id: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.removeCodexQueueItem(sessionId, id)
    }

    async moveCodexQueueItem(sessionId: string, id: string, toIndex: number): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.moveCodexQueueItem(sessionId, id, toIndex)
    }

    async clearCodexQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.clearCodexQueue(sessionId)
    }

    async getClaudeQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.getClaudeQueue(sessionId)
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
        return await this.rpcGateway.enqueueClaudeMessage(sessionId, payload)
    }

    async removeClaudeQueueItem(sessionId: string, id: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.removeClaudeQueueItem(sessionId, id)
    }

    async moveClaudeQueueItem(sessionId: string, id: string, toIndex: number): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.moveClaudeQueueItem(sessionId, id, toIndex)
    }

    async clearClaudeQueue(sessionId: string): Promise<RpcCodexQueueResponse> {
        return await this.rpcGateway.clearClaudeQueue(sessionId)
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
