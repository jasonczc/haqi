import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'
import type { SyncEvent } from '@hapi/protocol/types'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../store'
import type { SSEManager } from '../sse/sseManager'
import { EventPublisher } from './eventPublisher'
import { GroupService } from './groupService'

type ExecuteNoteRefreshPayload = {
    groupId: string
    namespace: string
    traceId: string
    noteSessionId: string
    source: string
    command: string
}

function closeStore(store: Store): void {
    const db = (store as unknown as { db: Database }).db
    db.close()
}

function createService(
    store: Store,
    options?: {
        executeNoteRefresh?: (payload: ExecuteNoteRefreshPayload) => Promise<{ accepted: boolean; reason?: string }>
        events?: SyncEvent[]
        dispatchTask?: (payload: {
            groupId: string
            namespace: string
            taskId: string
            traceId: string
            source: string
            targetSessionId: string
            command: string
        }) => Promise<void>
        resolveSessionRoutingState?: (sessionId: string, namespace: string) => { active: boolean } | null
    }
): GroupService {
    const publisher = new EventPublisher(
        {
            broadcast: (event: SyncEvent) => {
                if (options?.events) {
                    options.events.push(event)
                }
            }
        } as unknown as SSEManager,
        () => 'default'
    )

    return new GroupService(
        store,
        publisher,
        options?.dispatchTask ?? (async () => {}),
        options?.executeNoteRefresh,
        options?.resolveSessionRoutingState
    )
}

describe('GroupService createGroup', () => {
    it('sets the first session member as note executor when noteSessionId is omitted', () => {
        const store = new Store(':memory:')
        const first = store.sessions.getOrCreateSession('session-1', { path: '/repo/a' }, null, 'default')
        const second = store.sessions.getOrCreateSession('session-2', { path: '/repo/b' }, null, 'default')
        const service = createService(store)

        const result = service.createGroup({
            namespace: 'default',
            name: 'Team Alpha',
            sessionMemberIds: [first.id, second.id]
        })

        expect(result.group.noteSessionId).toBe(first.id)

        const firstMember = result.members.find((member) => member.sessionId === first.id)
        const secondMember = result.members.find((member) => member.sessionId === second.id)

        expect(firstMember?.role).toBe('note_executor')
        expect(secondMember?.role).toBe('member')
    })

    it('marks the first manually added member as note executor', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('session-3', { path: '/repo/c' }, null, 'default')
        const service = createService(store)

        const created = service.createGroup({
            namespace: 'default',
            name: 'Team Beta'
        })

        const updated = service.addMember({
            groupId: created.group.id,
            namespace: 'default',
            sessionId: session.id
        })
        const addedMember = updated.members.find((member) => member.sessionId === session.id)

        expect(updated.group.noteSessionId).toBe(session.id)
        expect(addedMember?.role).toBe('note_executor')
    })

    it('validates note executor must be a group member session', () => {
        const store = new Store(':memory:')
        const member = store.sessions.getOrCreateSession('session-4', { path: '/repo/d' }, null, 'default')
        const outsider = store.sessions.getOrCreateSession('session-5', { path: '/repo/e' }, null, 'default')
        const service = createService(store)

        const created = service.createGroup({
            namespace: 'default',
            name: 'Team Gamma',
            sessionMemberIds: [member.id]
        })

        expect(() => service.updateGroup({
            groupId: created.group.id,
            namespace: 'default',
            noteSessionId: outsider.id
        })).toThrow('Note session must be a group session member')
    })

    it('returns quoted metadata and dispatches command with quoted context', async () => {
        const store = new Store(':memory:')
        const worker = store.sessions.getOrCreateSession('session-quote-worker', { path: '/repo/quote' }, null, 'default')
        const dispatched: Array<{ command: string; targetSessionId: string }> = []
        const service = createService(store, {
            dispatchTask: async (payload) => {
                dispatched.push({
                    command: payload.command,
                    targetSessionId: payload.targetSessionId
                })
            },
            resolveSessionRoutingState: (sessionId) => (sessionId === worker.id ? { active: true } : null)
        })

        const created = service.createGroup({
            namespace: 'default',
            name: 'Quote Group',
            sessionMemberIds: [worker.id]
        })

        const referenced = await service.addTimelineMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'chat',
            source: `session:${worker.id}`,
            actorSessionId: worker.id,
            actorName: 'Worker',
            payload: { text: '需要保留的引用上下文' }
        })

        const reply = await service.addTimelineMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'command',
            source: 'user:web',
            payload: { text: `@${worker.id} 继续实现` },
            quotedMessageId: referenced.message.id
        })

        expect(reply.message.quotedMessageId).toBe(referenced.message.id)
        expect(reply.message.quotedMessage?.text).toBe('需要保留的引用上下文')
        expect(reply.message.quotedMessage?.actorName).toBe('Worker')
        expect(reply.createdTasks).toHaveLength(1)
        expect(dispatched).toHaveLength(1)
        expect(dispatched[0]?.targetSessionId).toBe(worker.id)
        expect(dispatched[0]?.command).toContain('> Worker: 需要保留的引用上下文')
        expect(dispatched[0]?.command).toContain(`@${worker.id} 继续实现`)

        const page = service.getMessagesPage(created.group.id, 'default', {
            limit: 20,
            beforeSeq: null
        })
        const repliedMessage = page.messages.find((message) => message.id === reply.message.id)
        expect(repliedMessage?.quotedMessageId).toBe(referenced.message.id)
        expect(repliedMessage?.quotedMessage?.text).toBe('需要保留的引用上下文')
    })

    it('dispatches session-origin chat mentions using member aliases', async () => {
        const store = new Store(':memory:')
        const delegator = store.sessions.getOrCreateSession(
            'session-delegator',
            { path: '/repo/delegator', name: 'AgentA' },
            null,
            'default'
        )
        const worker = store.sessions.getOrCreateSession(
            'session-worker-target',
            { path: '/repo/worker', name: 'AgentB' },
            null,
            'default'
        )
        const dispatched: Array<{ command: string; targetSessionId: string }> = []
        const service = createService(store, {
            dispatchTask: async (payload) => {
                dispatched.push({
                    command: payload.command,
                    targetSessionId: payload.targetSessionId
                })
            },
            resolveSessionRoutingState: (sessionId) => (
                sessionId === delegator.id || sessionId === worker.id
                    ? { active: true }
                    : null
            )
        })

        const created = service.createGroup({
            namespace: 'default',
            name: 'Delegation Group',
            sessionMemberIds: [delegator.id, worker.id]
        })

        const result = await service.addTimelineMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'chat',
            source: `session:${delegator.id}`,
            actorSessionId: delegator.id,
            actorName: 'AgentA',
            payload: { text: '@AgentB 请接手 API 对接' }
        })

        expect(result.message.type).toBe('chat')
        expect(result.createdTasks).toHaveLength(1)
        expect(result.createdTasks[0]?.targetSessionId).toBe(worker.id)
        expect(dispatched).toHaveLength(1)
        expect(dispatched[0]?.targetSessionId).toBe(worker.id)
        expect(dispatched[0]?.command).toContain('@AgentB')
    })

    it('does not dispatch user-origin chat mentions', async () => {
        const store = new Store(':memory:')
        const worker = store.sessions.getOrCreateSession('session-chat-worker', { path: '/repo/chat-worker' }, null, 'default')
        const dispatched: Array<{ command: string; targetSessionId: string }> = []
        const service = createService(store, {
            dispatchTask: async (payload) => {
                dispatched.push({
                    command: payload.command,
                    targetSessionId: payload.targetSessionId
                })
            },
            resolveSessionRoutingState: (sessionId) => (sessionId === worker.id ? { active: true } : null)
        })

        const created = service.createGroup({
            namespace: 'default',
            name: 'User Chat Group',
            sessionMemberIds: [worker.id]
        })

        const result = await service.addTimelineMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'chat',
            source: 'user:web',
            payload: { text: `@${worker.id} 这是一条普通聊天` }
        })

        expect(result.createdTasks).toHaveLength(0)
        expect(dispatched).toHaveLength(0)
    })

    it('builds structured note refresh prompt from timeline and tasks', async () => {
        const store = new Store(':memory:')
        const noteExecutor = store.sessions.getOrCreateSession('session-note', { path: '/repo/note' }, null, 'default')
        const worker = store.sessions.getOrCreateSession('session-worker', { path: '/repo/work' }, null, 'default')
        const capturedPayloads: ExecuteNoteRefreshPayload[] = []
        const service = createService(store, {
            executeNoteRefresh: async (payload) => {
                capturedPayloads.push(payload)
                return { accepted: true }
            }
        })

        const created = service.createGroup({
            namespace: 'default',
            name: 'Team Delta',
            noteSessionId: noteExecutor.id,
            sessionMemberIds: [noteExecutor.id, worker.id]
        })

        store.groups.addGroupMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'command',
            source: 'user:web',
            targetSessionIds: [worker.id],
            payload: { text: '@session-worker finish dashboard api migration' }
        })
        store.groups.addGroupTask({
            groupId: created.group.id,
            namespace: 'default',
            traceId: 'trace-1',
            source: 'user:web',
            targetSessionId: worker.id,
            command: 'finish dashboard api migration',
            status: 'running'
        })

        const refreshResult = await service.refreshGroupNote({
            groupId: created.group.id,
            namespace: 'default',
            source: 'user:web'
        })

        expect(refreshResult.triggered).toBe(true)
        expect(capturedPayloads.length).toBe(1)
        const captured = capturedPayloads[0]
        if (!captured) {
            throw new Error('expected refresh payload to be captured')
        }
        expect(captured.noteSessionId).toBe(noteExecutor.id)
        expect(captured.command).toContain('## 每个agent的职责')
        expect(captured.command).toContain('## 当前目标、进展以及待办事项')
        expect(captured.command).toContain('Recent Group Timeline')
        expect(captured.command).toContain(worker.id)

        const timeline = service.getMessagesPage(created.group.id, 'default', {
            limit: 20,
            beforeSeq: null
        }).messages
        const refreshSystem = timeline.find((message) => message.type === 'system' && message.traceId === captured.traceId)
        const refreshPayload = refreshSystem?.payload as { text?: unknown } | undefined
        expect(refreshPayload?.text).toBe('Generating group note...')
    })

    it('persists group note markdown to disk when store is file-backed', () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-group-note-md-'))
        const previousHapiHome = process.env.HAPI_HOME
        process.env.HAPI_HOME = dir
        const dbPath = join(dir, 'hapi.db')
        const store = new Store(dbPath)
        try {
            const service = createService(store)
            const content = '## Note\n- [ ] verify group note markdown'

            const created = service.createGroup({
                namespace: 'default',
                name: 'File Backed Group'
            })
            service.updateGroupNote({
                groupId: created.group.id,
                namespace: 'default',
                content,
                updatedBy: 'test'
            })

            const notePath = join(dir, 'memory', 'groups', 'default', created.group.id, 'GROUP-NOTE.md')
            const fileContent = readFileSync(notePath, 'utf8')
            expect(fileContent).toBe(content)
        } finally {
            closeStore(store)
            if (previousHapiHome === undefined) {
                delete process.env.HAPI_HOME
            } else {
                process.env.HAPI_HOME = previousHapiHome
            }
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('syncs newer markdown file content back into group note', () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-group-note-sync-pull-'))
        const previousHapiHome = process.env.HAPI_HOME
        process.env.HAPI_HOME = dir
        const dbPath = join(dir, 'hapi.db')
        const store = new Store(dbPath)
        try {
            const service = createService(store)
            const created = service.createGroup({
                namespace: 'default',
                name: 'File Sync Pull Group'
            })

            service.updateGroupNote({
                groupId: created.group.id,
                namespace: 'default',
                content: '## Old note content',
                updatedBy: 'test'
            })

            const notePath = join(dir, 'memory', 'groups', 'default', created.group.id, 'GROUP-NOTE.md')
            const before = store.groups.getGroupNote(created.group.id, 'default')
            const waitUntil = (before?.updatedAt ?? Date.now()) + 5
            while (Date.now() <= waitUntil) {
                // Busy wait to ensure file mtime is newer than note.updatedAt.
            }

            const finalMarkdown = '## 每个agent的职责\n- session-a: 完成同步\n\n## 当前目标、进展以及待办事项\n- [ ] 验收'
            writeFileSync(notePath, finalMarkdown, { encoding: 'utf8' })

            const syncResult = service.syncGroupNoteMarkdownFiles()
            expect(syncResult.pulledFromFile).toBe(1)

            const note = store.groups.getGroupNote(created.group.id, 'default')
            expect(note?.content).toBe(finalMarkdown)
            expect(note?.updatedBy).toBe('system:file-sync')
        } finally {
            closeStore(store)
            if (previousHapiHome === undefined) {
                delete process.env.HAPI_HOME
            } else {
                process.env.HAPI_HOME = previousHapiHome
            }
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('recreates missing markdown file from stored group note', () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-group-note-sync-push-'))
        const previousHapiHome = process.env.HAPI_HOME
        process.env.HAPI_HOME = dir
        const dbPath = join(dir, 'hapi.db')
        const store = new Store(dbPath)
        try {
            const service = createService(store)
            const content = '## Canonical note\n- persisted in db'

            const created = service.createGroup({
                namespace: 'default',
                name: 'File Sync Push Group'
            })
            service.updateGroupNote({
                groupId: created.group.id,
                namespace: 'default',
                content,
                updatedBy: 'test'
            })

            const notePath = join(dir, 'memory', 'groups', 'default', created.group.id, 'GROUP-NOTE.md')
            unlinkSync(notePath)
            expect(existsSync(notePath)).toBe(false)

            const syncResult = service.syncGroupNoteMarkdownFiles()
            expect(syncResult.pushedToFile).toBe(1)
            expect(existsSync(notePath)).toBe(true)
            expect(readFileSync(notePath, 'utf8')).toBe(content)
        } finally {
            closeStore(store)
            if (previousHapiHome === undefined) {
                delete process.env.HAPI_HOME
            } else {
                process.env.HAPI_HOME = previousHapiHome
            }
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('deletes group and related records, then emits group-removed', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('session-delete', { path: '/repo/delete' }, null, 'default')
        const events: SyncEvent[] = []
        const service = createService(store, { events })

        const created = service.createGroup({
            namespace: 'default',
            name: 'Delete Group',
            sessionMemberIds: [session.id]
        })

        store.groups.addGroupMessage({
            groupId: created.group.id,
            namespace: 'default',
            type: 'chat',
            source: 'user:web',
            payload: { text: 'before delete' }
        })
        store.groups.addGroupTask({
            groupId: created.group.id,
            namespace: 'default',
            traceId: 'trace-delete',
            source: 'user:web',
            targetSessionId: session.id,
            command: 'cleanup',
            status: 'pending'
        })
        service.updateGroupNote({
            groupId: created.group.id,
            namespace: 'default',
            content: 'delete me',
            updatedBy: 'test'
        })

        service.deleteGroup('default', created.group.id)

        expect(store.groups.getGroupByNamespace(created.group.id, 'default')).toBeNull()
        expect(store.groups.getGroupMembersByNamespace(created.group.id, 'default')).toHaveLength(0)
        expect(store.groups.getGroupMessages(created.group.id, 'default')).toHaveLength(0)
        expect(store.groups.getGroupTasks(created.group.id, 'default')).toHaveLength(0)
        expect(store.groups.getGroupNote(created.group.id, 'default')).toBeNull()

        const removed = events.find((event) => event.type === 'group-removed' && event.groupId === created.group.id)
        expect(removed).toBeDefined()
        expect(removed?.namespace).toBe('default')
    })
})
