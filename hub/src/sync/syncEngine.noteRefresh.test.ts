import { afterEach, describe, expect, it } from 'bun:test'
import type { SyncEvent } from '@hapi/protocol/types'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'
import { SyncEngine } from './syncEngine'

type Harness = {
    store: Store
    engine: SyncEngine
    sseManager: SSEManager
}

function createHarness(): Harness {
    const store = new Store(':memory:')
    const sseManager = new SSEManager(0, new VisibilityTracker())
    const engine = new SyncEngine(
        store,
        {} as Server,
        new RpcRegistry(),
        sseManager
    )
    return { store, engine, sseManager }
}

function emitMessage(engine: SyncEngine, sessionId: string, seq: number, content: unknown): void {
    const event: Extract<SyncEvent, { type: 'message-received' }> = {
        type: 'message-received',
        sessionId,
        message: {
            id: `msg-${seq}`,
            seq,
            localId: null,
            content,
            createdAt: Date.now()
        }
    }
    engine.handleRealtimeEvent(event)
}

const harnesses: Harness[] = []

afterEach(() => {
    while (harnesses.length > 0) {
        const harness = harnesses.pop()
        if (!harness) {
            continue
        }
        harness.engine.stop()
        harness.sseManager.stop()
    }
})

describe('SyncEngine note refresh write-back', () => {
    it('writes note refresh output into group note when task is ready', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const noteSession = harness.store.sessions.getOrCreateSession(
            'note-session',
            { path: '/repo/note', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )
        const member = harness.store.sessions.getOrCreateSession(
            'worker-session',
            { path: '/repo/work', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Note Refresh Group',
            noteSessionId: noteSession.id,
            sessionMemberIds: [noteSession.id, member.id]
        })

        const routeContext = {
            groupId: group.group.id,
            taskId: 'note-refresh:trace-1',
            traceId: 'trace-1',
            source: 'user:web',
            targetSessionIds: [noteSession.id]
        }

        emitMessage(harness.engine, noteSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '/note refresh' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, noteSession.id, 2, {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: '```markdown\n## 每个agent的职责\n- note-session: 汇总\n\n## 当前目标、进展以及待办事项\n- [ ] 补齐测试\n```'
                    }
                }
            },
            meta: {}
        })

        const beforeReady = harness.engine.getGroupNote(group.group.id, 'default')
        expect(beforeReady?.content ?? '').toBe('')

        emitMessage(harness.engine, noteSession.id, 3, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const note = harness.engine.getGroupNote(group.group.id, 'default')
        expect(note?.content ?? '').toContain('## 每个agent的职责')
        expect(note?.content ?? '').toContain('## 当前目标、进展以及待办事项')
        expect(note?.content ?? '').not.toContain('```')
    })

    it('ignores stale note refresh output after note executor changed', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const oldExecutor = harness.store.sessions.getOrCreateSession(
            'old-note-session',
            { path: '/repo/old', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )
        const newExecutor = harness.store.sessions.getOrCreateSession(
            'new-note-session',
            { path: '/repo/new', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Switch Executor Group',
            noteSessionId: oldExecutor.id,
            sessionMemberIds: [oldExecutor.id, newExecutor.id]
        })

        const routeContext = {
            groupId: group.group.id,
            taskId: 'note-refresh:trace-2',
            traceId: 'trace-2',
            source: 'user:web',
            targetSessionIds: [oldExecutor.id]
        }

        emitMessage(harness.engine, oldExecutor.id, 1, {
            role: 'user',
            content: { type: 'text', text: '/note refresh' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, oldExecutor.id, 2, {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: '## 每个agent的职责\n- old-note-session: 旧执行器结果'
                    }
                }
            },
            meta: {}
        })

        harness.engine.updateGroup({
            groupId: group.group.id,
            namespace: 'default',
            noteSessionId: newExecutor.id
        })

        emitMessage(harness.engine, oldExecutor.id, 3, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const note = harness.engine.getGroupNote(group.group.id, 'default')
        expect(note?.content ?? '').toBe('')
    })
})
