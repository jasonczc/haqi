import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'
import type { SyncEvent } from '@hapi/protocol/types'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
        async () => {},
        options?.executeNoteRefresh
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
