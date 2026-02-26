import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Store, StoredGroup, StoredGroupMessage, StoredGroupNote, StoredGroupTask } from '../store'
import { EventPublisher } from './eventPublisher'

export type GroupWithDetails = {
    group: StoredGroup
    members: ReturnType<Store['groups']['getGroupMembersByNamespace']>
    note: StoredGroupNote | null
}

type GroupTaskDispatchPayload = {
    groupId: string
    namespace: string
    taskId: string
    traceId: string
    source: string
    targetSessionId: string
    command: string
}

type GroupNoteExecutor = (payload: {
    groupId: string
    namespace: string
    traceId: string
    noteSessionId: string
    source: string
    command: string
}) => Promise<{ accepted: boolean; reason?: string }>

type SessionRoutingState = {
    active: boolean
}

type ResolveSessionRoutingState = (sessionId: string, namespace: string) => SessionRoutingState | null

const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'expired', 'canceled', 'manual_done'])
const NOTE_REFRESH_TIMELINE_LIMIT = 120
const NOTE_REFRESH_TASK_LIMIT = 120
const NOTE_REFRESH_NOTE_MAX_LENGTH = 2_000
const NOTE_REFRESH_PAYLOAD_MAX_LENGTH = 500
const GROUP_NOTE_FILENAME = 'GROUP-NOTE.md'

function extractCommandText(payload: unknown): string {
    if (typeof payload === 'string') {
        return payload.trim()
    }
    if (!payload || typeof payload !== 'object') {
        return ''
    }
    const candidate = (payload as { text?: unknown }).text
    return typeof candidate === 'string' ? candidate.trim() : ''
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)))
}

function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value
    }
    return `${value.slice(0, maxLength)}...`
}

function stringifyPayload(payload: unknown): string {
    if (typeof payload === 'string') {
        return payload.trim()
    }
    if (!payload || typeof payload !== 'object') {
        return ''
    }

    const record = payload as Record<string, unknown>
    const textCandidate = record.text
    if (typeof textCandidate === 'string' && textCandidate.trim()) {
        return textCandidate.trim()
    }
    const commandCandidate = record.command
    if (typeof commandCandidate === 'string' && commandCandidate.trim()) {
        return commandCandidate.trim()
    }
    const messageCandidate = record.message
    if (typeof messageCandidate === 'string' && messageCandidate.trim()) {
        return messageCandidate.trim()
    }
    const statusCandidate = record.status
    const reasonCandidate = record.reason
    if (typeof statusCandidate === 'string' && statusCandidate.trim()) {
        const status = statusCandidate.trim()
        const reason = typeof reasonCandidate === 'string' && reasonCandidate.trim()
            ? ` (${reasonCandidate.trim()})`
            : ''
        return `${status}${reason}`
    }

    try {
        return JSON.stringify(payload)
    } catch {
        return ''
    }
}

function toPathSegment(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        return '_'
    }
    return trimmed.replace(/[^A-Za-z0-9._-]/g, '_')
}

function resolveHapiHomeDir(): string {
    const raw = process.env.HAPI_HOME?.trim()
    if (raw && raw.length > 0) {
        return raw.replace(/^~(?=\/|$)/, homedir())
    }
    return join(homedir(), '.hapi')
}

export class GroupService {
    private readonly maxPendingTasksPerSession: number
    private readonly dedupeBucketMs: number
    private readonly taskTtlMs: number

    constructor(
        private readonly store: Store,
        private readonly publisher: EventPublisher,
        private readonly dispatchTask: (payload: GroupTaskDispatchPayload) => Promise<void>,
        private readonly executeNoteRefresh?: GroupNoteExecutor,
        private readonly resolveSessionRoutingState?: ResolveSessionRoutingState,
        options?: {
            maxPendingTasksPerSession?: number
            dedupeBucketMs?: number
            taskTtlMs?: number
        }
    ) {
        this.maxPendingTasksPerSession = options?.maxPendingTasksPerSession ?? 3
        this.dedupeBucketMs = options?.dedupeBucketMs ?? 5 * 60 * 1000
        this.taskTtlMs = options?.taskTtlMs ?? 30 * 60 * 1000
    }

    getGroupsByNamespace(namespace: string): GroupWithDetails[] {
        return this.store.groups.getGroupsByNamespace(namespace).map((group) => ({
            group,
            members: this.store.groups.getGroupMembersByNamespace(group.id, namespace),
            note: this.store.groups.getGroupNote(group.id, namespace)
        }))
    }

    getGroupByNamespace(groupId: string, namespace: string): GroupWithDetails | null {
        const group = this.store.groups.getGroupByNamespace(groupId, namespace)
        if (!group) {
            return null
        }
        return {
            group,
            members: this.store.groups.getGroupMembersByNamespace(group.id, namespace),
            note: this.store.groups.getGroupNote(group.id, namespace)
        }
    }

    createGroup(options: {
        namespace: string
        name: string
        description?: string | null
        noteSessionId?: string | null
        sessionMemberIds?: string[]
    }): GroupWithDetails {
        const sessionMemberIds = uniqueStrings(options.sessionMemberIds ?? [])
        const resolvedNoteSessionId = options.noteSessionId ?? sessionMemberIds[0] ?? null

        const members = sessionMemberIds.map((sessionId) => ({
            memberType: 'session' as const,
            sessionId,
            role: sessionId === resolvedNoteSessionId ? 'note_executor' : 'member'
        }))
        const group = this.store.groups.createGroup({
            namespace: options.namespace,
            name: options.name,
            description: options.description ?? null,
            noteSessionId: resolvedNoteSessionId,
            members
        })

        const groupData = {
            group,
            members: this.store.groups.getGroupMembersByNamespace(group.id, group.namespace),
            note: this.store.groups.getGroupNote(group.id, group.namespace)
        }
        this.publisher.emit({
            type: 'group-added',
            groupId: group.id,
            data: groupData
        })
        return groupData
    }

    addMember(options: {
        groupId: string
        namespace: string
        sessionId: string
    }): GroupWithDetails {
        const group = this.requireGroup(options.groupId, options.namespace)

        // If this is the first session member and no noteSessionId is set, make this session the note executor
        const shouldSetAsNoteSession = !group.noteSessionId

        this.store.groups.addGroupMember({
            groupId: options.groupId,
            namespace: options.namespace,
            sessionId: options.sessionId,
            role: shouldSetAsNoteSession ? 'note_executor' : 'member'
        })

        // Auto-set first session as note executor
        if (shouldSetAsNoteSession) {
            this.store.groups.updateGroup({
                groupId: options.groupId,
                namespace: options.namespace,
                noteSessionId: options.sessionId
            })
        }

        const groupData = this.getGroupByNamespace(options.groupId, options.namespace)
        if (!groupData) {
            throw new Error('Group not found after adding member')
        }
        this.publisher.emit({
            type: 'group-updated',
            groupId: options.groupId,
            data: groupData
        })
        return groupData
    }

    updateGroup(options: {
        groupId: string
        namespace: string
        name?: string
        description?: string | null
        noteSessionId?: string | null
    }): GroupWithDetails {
        this.requireGroup(options.groupId, options.namespace)
        if (options.noteSessionId !== undefined && options.noteSessionId !== null) {
            const isSessionMember = this.store.groups
                .getGroupMembersByNamespace(options.groupId, options.namespace)
                .some((member) => member.memberType === 'session' && member.sessionId === options.noteSessionId)
            if (!isSessionMember) {
                throw new Error('Note session must be a group session member')
            }
        }
        const updated = this.store.groups.updateGroup(options)
        if (!updated) {
            throw new Error('Group not found')
        }
        const groupData = {
            group: updated,
            members: this.store.groups.getGroupMembersByNamespace(updated.id, updated.namespace),
            note: this.store.groups.getGroupNote(updated.id, updated.namespace)
        }
        this.publisher.emit({
            type: 'group-updated',
            groupId: options.groupId,
            data: groupData
        })
        return groupData
    }

    getMessagesPage(
        groupId: string,
        namespace: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        messages: StoredGroupMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        this.requireGroup(groupId, namespace)
        const messages = this.store.groups.getGroupMessages(groupId, namespace, options.limit, options.beforeSeq ?? undefined)

        let oldestSeq: number | null = null
        for (const message of messages) {
            if (oldestSeq === null || message.seq < oldestSeq) {
                oldestSeq = message.seq
            }
        }

        const nextBeforeSeq = oldestSeq
        const hasMore = nextBeforeSeq !== null
            && this.store.groups.getGroupMessages(groupId, namespace, 1, nextBeforeSeq).length > 0

        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq,
                hasMore
            }
        }
    }

    async addTimelineMessage(options: {
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
    }): Promise<{
        message: StoredGroupMessage
        createdTasks: StoredGroupTask[]
    }> {
        this.requireGroup(options.groupId, options.namespace)
        const source = options.source ?? 'user:web'
        const message = this.store.groups.addGroupMessage({
            groupId: options.groupId,
            namespace: options.namespace,
            type: options.type,
            payload: options.payload,
            source,
            actorSessionId: options.actorSessionId ?? null,
            actorName: options.actorName ?? null,
            traceId: options.traceId ?? null,
            taskId: options.taskId ?? null,
            targetSessionIds: options.targetSessionIds ?? null
        })
        this.emitMessageEvent(message)

        if (options.type !== 'command') {
            return { message, createdTasks: [] }
        }

        const command = extractCommandText(options.payload)
        if (!command) {
            return { message, createdTasks: [] }
        }

        const targetSessionIds = this.resolveCommandTargets(
            options.groupId,
            options.namespace,
            command,
            options.targetSessionIds ?? null
        )
        if (targetSessionIds.length === 0) {
            return { message, createdTasks: [] }
        }

        const traceId = options.traceId ?? message.traceId ?? randomUUID()
        const createdTasks = await this.createAndDispatchTasks({
            groupId: options.groupId,
            namespace: options.namespace,
            source,
            command,
            traceId,
            targetSessionIds
        })
        return { message, createdTasks }
    }

    getGroupNote(groupId: string, namespace: string): StoredGroupNote | null {
        this.requireGroup(groupId, namespace)
        return this.store.groups.getGroupNote(groupId, namespace)
    }

    getGroupTasks(groupId: string, namespace: string, limit: number = 200): StoredGroupTask[] {
        this.requireGroup(groupId, namespace)
        return this.store.groups.getGroupTasks(groupId, namespace, limit)
    }

    updateGroupNote(options: {
        groupId: string
        namespace: string
        content: string
        updatedBy?: string | null
    }): StoredGroupNote {
        this.requireGroup(options.groupId, options.namespace)
        const note = this.store.groups.updateGroupNote(options)
        this.publisher.emit({
            type: 'group-note-updated',
            groupId: options.groupId,
            note
        })

        const noteStateMessage = this.store.groups.addGroupMessage({
            groupId: options.groupId,
            namespace: options.namespace,
            type: 'note_state',
            source: options.updatedBy ?? 'system:note',
            payload: {
                version: note.version,
                updatedAt: note.updatedAt,
                updatedBy: note.updatedBy
            }
        })
        this.emitMessageEvent(noteStateMessage)
        this.persistGroupNoteMarkdown(note)
        return note
    }

    async refreshGroupNote(options: {
        groupId: string
        namespace: string
        source?: string
        command?: string
    }): Promise<{ triggered: boolean; reason?: string }> {
        const detail = this.getGroupByNamespace(options.groupId, options.namespace)
        if (!detail) {
            throw new Error('Group not found')
        }
        const noteSessionId = detail.group.noteSessionId
        if (!noteSessionId) {
            return { triggered: false, reason: 'note session not configured' }
        }
        if (!this.executeNoteRefresh) {
            return { triggered: false, reason: 'note executor unavailable' }
        }

        const traceId = randomUUID()
        const source = options.source ?? 'user:web'
        const command = options.command ?? this.buildNoteRefreshCommand(detail, source)
        const result = await this.executeNoteRefresh({
            groupId: options.groupId,
            namespace: options.namespace,
            traceId,
            noteSessionId,
            source,
            command
        })

        const payload = {
            traceId,
            noteSessionId,
            status: result.accepted ? 'enqueued' : 'rejected',
            reason: result.reason ?? null
        }

        const event = this.store.groups.addGroupMessage({
            groupId: options.groupId,
            namespace: options.namespace,
            type: 'system',
            traceId,
            source,
            payload
        })
        this.emitMessageEvent(event)
        return {
            triggered: result.accepted,
            reason: result.reason
        }
    }

    private buildNoteRefreshCommand(detail: GroupWithDetails, source: string): string {
        const memberSessionIds = detail.members
            .filter((member): member is typeof member & { sessionId: string } => member.memberType === 'session' && typeof member.sessionId === 'string')
            .map((member) => member.sessionId)

        const timeline = this.store.groups.getGroupMessages(
            detail.group.id,
            detail.group.namespace,
            NOTE_REFRESH_TIMELINE_LIMIT
        )
        const tasks = this.store.groups.getGroupTasks(
            detail.group.id,
            detail.group.namespace,
            NOTE_REFRESH_TASK_LIMIT
        ).slice().reverse()

        const memberLines = memberSessionIds.length > 0
            ? memberSessionIds.map((sessionId) => `- ${sessionId}${sessionId === detail.group.noteSessionId ? ' (note_executor)' : ''}`).join('\n')
            : '- (no session members)'

        const timelineLines = timeline.length > 0
            ? timeline.map((message) => {
                const actor = message.actorSessionId
                    ?? (message.source.startsWith('session:') ? message.source.slice('session:'.length) : message.source)
                const payload = truncateText(stringifyPayload(message.payload), NOTE_REFRESH_PAYLOAD_MAX_LENGTH)
                const targets = message.targetSessionIds && message.targetSessionIds.length > 0
                    ? ` targets=${message.targetSessionIds.join(',')}`
                    : ''
                const trace = message.traceId ? ` trace=${message.traceId}` : ''
                const task = message.taskId ? ` task=${message.taskId}` : ''
                return `- [${new Date(message.createdAt).toISOString()}] type=${message.type} actor=${actor}${targets}${trace}${task} | ${payload || '(empty)'}`
            }).join('\n')
            : '- (no timeline messages)'

        const taskLines = tasks.length > 0
            ? tasks.map((task) => {
                const error = task.error ? ` error=${truncateText(task.error, 180)}` : ''
                return `- [${new Date(task.createdAt).toISOString()}] status=${task.status} target=${task.targetSessionId} command=${truncateText(task.command, 240)}${error}`
            }).join('\n')
            : '- (no tasks)'

        const existingNote = detail.note?.content
            ? truncateText(detail.note.content, NOTE_REFRESH_NOTE_MAX_LENGTH)
            : '(empty)'
        const noteFilePath = this.getGroupNoteFilePath(detail.group.namespace, detail.group.id)

        return [
            '你是 HAQI Group 的 note 执行器。',
            '请基于给定的 Group Timeline 和 Task 状态，输出最新 Group Note。',
            '要求：',
            '1. 只输出最终 Markdown 正文，不要额外解释。',
            '2. 必须包含以下两大部分：',
            '   - 每个agent的职责',
            '   - 当前目标、进展以及待办事项',
            '3. 只根据提供信息总结；不确定项标注“待确认”。',
            '4. 待办事项使用 `- [ ]`，并尽量标注责任 session。',
            '',
            '建议结构：',
            '## 每个agent的职责',
            '- <sessionId>: 职责 | 当前状态 | 依据',
            '',
            '## 当前目标、进展以及待办事项',
            '### 当前目标',
            '- ...',
            '### 当前进展',
            '- ...',
            '### 待办事项',
            '- [ ] ... (@sessionId)',
            '### 风险/阻塞',
            '- ...',
            '',
            `Group: ${detail.group.name} (${detail.group.id})`,
            `Refresh Source: ${source}`,
            `Current Note Executor: ${detail.group.noteSessionId ?? 'not-configured'}`,
            `Group Note Markdown Path: ${noteFilePath ?? '(disabled: in-memory store)'}`,
            '你可以自行决定是否读取该文件，读取时以最新文件内容为准。',
            '',
            'Group Members (session):',
            memberLines,
            '',
            'Current Group Note:',
            existingNote,
            '',
            'Recent Group Timeline (oldest -> newest):',
            timelineLines,
            '',
            'Recent Group Tasks (oldest -> newest):',
            taskLines
        ].join('\n')
    }

    private getGroupNoteFilePath(namespace: string, groupId: string): string | null {
        const dbPath = this.store.getDatabasePath()
        if (dbPath === ':memory:' || dbPath.startsWith('file::memory:')) {
            return null
        }
        const hapiHome = resolveHapiHomeDir()
        return join(hapiHome, 'memory', 'groups', toPathSegment(namespace), groupId, GROUP_NOTE_FILENAME)
    }

    private persistGroupNoteMarkdown(note: StoredGroupNote): void {
        const filePath = this.getGroupNoteFilePath(note.namespace, note.groupId)
        if (!filePath) {
            return
        }
        const normalizedContent = note.content.length > 0 ? note.content : ''
        try {
            mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
            writeFileSync(filePath, normalizedContent, { encoding: 'utf8' })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[GroupService] Failed to persist group note markdown at ${filePath}: ${message}`)
        }
    }

    claimTask(groupId: string, taskId: string, namespace: string): StoredGroupTask {
        this.requireGroup(groupId, namespace)
        const existing = this.requireTask(groupId, taskId, namespace)
        if (TERMINAL_TASK_STATUSES.has(existing.status)) {
            return existing
        }
        const task = this.store.groups.updateGroupTaskStatus({
            groupId,
            taskId,
            namespace,
            status: 'running'
        })
        if (!task) {
            throw new Error('Task not found')
        }
        this.emitTaskUpdate(task)
        return task
    }

    doneTask(groupId: string, taskId: string, namespace: string): StoredGroupTask {
        this.requireGroup(groupId, namespace)
        const existing = this.requireTask(groupId, taskId, namespace)
        if (TERMINAL_TASK_STATUSES.has(existing.status)) {
            return existing
        }
        const task = this.store.groups.updateGroupTaskStatus({
            groupId,
            taskId,
            namespace,
            status: 'manual_done'
        })
        if (!task) {
            throw new Error('Task not found')
        }
        this.emitTaskUpdate(task)
        return task
    }

    cancelTask(groupId: string, taskId: string, namespace: string): StoredGroupTask {
        this.requireGroup(groupId, namespace)
        const existing = this.requireTask(groupId, taskId, namespace)
        if (TERMINAL_TASK_STATUSES.has(existing.status)) {
            return existing
        }
        const task = this.store.groups.updateGroupTaskStatus({
            groupId,
            taskId,
            namespace,
            status: 'canceled'
        })
        if (!task) {
            throw new Error('Task not found')
        }
        this.emitTaskUpdate(task)
        return task
    }

    updateTaskExecutionStatus(options: {
        groupId: string
        taskId: string
        namespace: string
        status: 'running' | 'completed' | 'failed'
        error?: string | null
    }): StoredGroupTask | null {
        this.requireGroup(options.groupId, options.namespace)
        const existing = this.store.groups.getGroupTaskByNamespace(options.groupId, options.taskId, options.namespace)
        if (!existing) {
            return null
        }
        if (existing.status === options.status) {
            return existing
        }
        if (TERMINAL_TASK_STATUSES.has(existing.status)) {
            return existing
        }

        const task = this.store.groups.updateGroupTaskStatus({
            groupId: options.groupId,
            taskId: options.taskId,
            namespace: options.namespace,
            status: options.status,
            error: options.error
        })
        if (!task) {
            return null
        }
        this.emitTaskUpdate(task)
        return task
    }

    private async createAndDispatchTasks(options: {
        groupId: string
        namespace: string
        command: string
        traceId: string
        source: string
        targetSessionIds: string[]
    }): Promise<StoredGroupTask[]> {
        const createdTasks: StoredGroupTask[] = []
        const now = Date.now()
        const expiresAt = now + this.taskTtlMs
        const bucket = Math.floor(now / this.dedupeBucketMs)
        const normalizedCommand = options.command.replace(/\s+/g, ' ').trim().toLowerCase()

        for (const targetSessionId of options.targetSessionIds) {
            const openTasks = this.store.groups.countOpenGroupTasksForSession(
                options.groupId,
                targetSessionId,
                options.namespace
            )
            if (openTasks >= this.maxPendingTasksPerSession) {
                const warning = this.store.groups.addGroupMessage({
                    groupId: options.groupId,
                    namespace: options.namespace,
                    type: 'system',
                    traceId: options.traceId,
                    source: options.source,
                    payload: {
                        type: 'task_rejected',
                        targetSessionId,
                        reason: `max pending tasks reached (${this.maxPendingTasksPerSession})`
                    }
                })
                this.emitMessageEvent(warning)
                continue
            }

            const dedupeKey = `${options.groupId}:${targetSessionId}:${normalizedCommand}:${bucket}`
            const existing = this.store.groups.getGroupTaskByDedupeKey(
                options.groupId,
                options.namespace,
                dedupeKey
            )
            if (existing) {
                createdTasks.push(existing)
                continue
            }

            const task = this.store.groups.addGroupTask({
                groupId: options.groupId,
                namespace: options.namespace,
                traceId: options.traceId,
                source: options.source,
                targetSessionId,
                command: options.command,
                status: 'pending',
                dedupeKey,
                expiresAt
            })
            createdTasks.push(task)
            this.emitTaskUpdate(task)

            try {
                await this.dispatchTask({
                    groupId: options.groupId,
                    namespace: options.namespace,
                    taskId: task.id,
                    traceId: task.traceId,
                    source: task.source,
                    targetSessionId: task.targetSessionId,
                    command: task.command
                })

                const enqueued = this.store.groups.updateGroupTaskStatus({
                    groupId: options.groupId,
                    taskId: task.id,
                    namespace: options.namespace,
                    status: 'enqueued'
                })
                if (enqueued) {
                    this.emitTaskUpdate(enqueued)
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const failed = this.store.groups.updateGroupTaskStatus({
                    groupId: options.groupId,
                    taskId: task.id,
                    namespace: options.namespace,
                    status: 'failed',
                    error: message
                })
                if (failed) {
                    this.emitTaskUpdate(failed)
                }
            }
        }

        return createdTasks
    }

    private resolveCommandTargets(
        groupId: string,
        namespace: string,
        command: string,
        explicitTargets: string[] | null
    ): string[] {
        const sessionMembers = this.store.groups
            .getGroupMembersByNamespace(groupId, namespace)
            .filter((member) => member.memberType === 'session' && typeof member.sessionId === 'string')
            .map((member) => member.sessionId as string)

        if (sessionMembers.length === 0) {
            return []
        }

        const onlineSessionMembers = sessionMembers.filter((sessionId) => this.isSessionMentionable(sessionId, namespace))

        if (explicitTargets && explicitTargets.length > 0) {
            return uniqueStrings(explicitTargets).filter(
                (sessionId) => onlineSessionMembers.includes(sessionId)
            )
        }

        if (/\B@all\b/i.test(command)) {
            return onlineSessionMembers
        }

        const mentions = Array.from(command.matchAll(/\B@([A-Za-z0-9._:-]+)/g))
            .map((match) => match[1])

        return uniqueStrings(mentions.filter((id) => onlineSessionMembers.includes(id)))
    }

    private isSessionMentionable(sessionId: string, namespace: string): boolean {
        const session = this.resolveSessionRoutingState?.(sessionId, namespace)
        if (!session) {
            return false
        }
        return session.active
    }

    private emitMessageEvent(message: StoredGroupMessage): void {
        this.publisher.emit({
            type: 'group-message-received',
            groupId: message.groupId,
            message: this.toTimelineMessage(message)
        })
    }

    private emitTaskUpdate(task: StoredGroupTask): void {
        this.publisher.emit({
            type: 'group-task-updated',
            groupId: task.groupId,
            task
        })

        const timeline = this.store.groups.addGroupMessage({
            groupId: task.groupId,
            namespace: task.namespace,
            type: 'task_state',
            traceId: task.traceId,
            taskId: task.id,
            source: task.source,
            targetSessionIds: [task.targetSessionId],
            payload: {
                taskId: task.id,
                status: task.status,
                targetSessionId: task.targetSessionId,
                command: task.command,
                error: task.error
            }
        })
        this.emitMessageEvent(timeline)
    }

    private toTimelineMessage(message: StoredGroupMessage): {
        id: string
        groupId: string
        namespace: string
        seq: number
        type: StoredGroupMessage['type']
        traceId?: string
        taskId?: string
        source: string
        actorSessionId?: string
        actorName?: string
        targetSessionIds?: string[]
        payload: unknown
        createdAt: number
    } {
        return {
            id: message.id,
            groupId: message.groupId,
            namespace: message.namespace,
            seq: message.seq,
            type: message.type,
            ...(message.traceId ? { traceId: message.traceId } : {}),
            ...(message.taskId ? { taskId: message.taskId } : {}),
            source: message.source,
            ...(message.actorSessionId ? { actorSessionId: message.actorSessionId } : {}),
            ...(message.actorName ? { actorName: message.actorName } : {}),
            ...(message.targetSessionIds ? { targetSessionIds: message.targetSessionIds } : {}),
            payload: message.payload,
            createdAt: message.createdAt
        }
    }

    private requireGroup(groupId: string, namespace: string): StoredGroup {
        const group = this.store.groups.getGroupByNamespace(groupId, namespace)
        if (!group) {
            throw new Error('Group not found')
        }
        return group
    }

    private requireTask(groupId: string, taskId: string, namespace: string): StoredGroupTask {
        const task = this.store.groups.getGroupTaskByNamespace(groupId, taskId, namespace)
        if (!task) {
            throw new Error('Task not found')
        }
        return task
    }
}
