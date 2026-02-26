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

function getGroupMessages(engine: SyncEngine, groupId: string): ReturnType<SyncEngine['getGroupMessagesPage']>['messages'] {
    return engine.getGroupMessagesPage(groupId, 'default', {
        limit: 200,
        beforeSeq: null
    }).messages
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

describe('SyncEngine codex group mirror filtering', () => {
    it('merges codex routed output and skips execution detail messages', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const codexSession = harness.store.sessions.getOrCreateSession(
            'codex-worker',
            { path: '/repo/codex', host: 'dev', flavor: 'codex' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Codex Mirror Group',
            noteSessionId: codexSession.id,
            sessionMemberIds: [codexSession.id]
        })

        const routeContext = {
            groupId: group.group.id,
            traceId: 'trace-codex-1',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }

        emitMessage(harness.engine, codexSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@codex-worker 执行任务' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 2, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'reasoning',
                    message: '先分析目录结构'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 3, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: '[Context compacted]'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 4, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: '完成了第一步，已更新依赖。'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 5, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: '完成了第二步，测试通过。'
                }
            },
            meta: { routeContext }
        })

        expect(getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')).toHaveLength(0)

        emitMessage(harness.engine, codexSession.id, 6, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const chatMessages = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(chatMessages).toHaveLength(1)
        expect(chatMessages[0].traceId).toBe('trace-codex-1')

        const payload = chatMessages[0].payload as { text?: unknown; chunkCount?: unknown }
        expect(payload.chunkCount).toBe(2)
        expect(typeof payload.text).toBe('string')
        const mergedText = payload.text as string
        expect(mergedText).toContain('完成了第一步，已更新依赖。')
        expect(mergedText).toContain('完成了第二步，测试通过。')
        expect(mergedText).not.toContain('[Context compacted]')
        expect(mergedText).not.toContain('先分析目录结构')
    })

    it('flushes pending codex mirror output when route switches before ready', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const codexSession = harness.store.sessions.getOrCreateSession(
            'codex-switch',
            { path: '/repo/codex', host: 'dev', flavor: 'codex' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Codex Route Switch Group',
            noteSessionId: codexSession.id,
            sessionMemberIds: [codexSession.id]
        })

        const routeA = {
            groupId: group.group.id,
            traceId: 'trace-route-a',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }
        const routeB = {
            groupId: group.group.id,
            traceId: 'trace-route-b',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }

        emitMessage(harness.engine, codexSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@codex-switch 处理A' },
            meta: { routeContext: routeA }
        })
        emitMessage(harness.engine, codexSession.id, 2, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: 'A 路由输出片段'
                }
            },
            meta: { routeContext: routeA }
        })
        emitMessage(harness.engine, codexSession.id, 3, {
            role: 'user',
            content: { type: 'text', text: '@codex-switch 处理B' },
            meta: { routeContext: routeB }
        })

        const afterSwitch = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(afterSwitch).toHaveLength(1)
        expect(afterSwitch[0].traceId).toBe('trace-route-a')
        const firstPayload = afterSwitch[0].payload as { text?: unknown }
        expect(firstPayload.text).toBe('A 路由输出片段')

        emitMessage(harness.engine, codexSession.id, 4, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const finalChats = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(finalChats).toHaveLength(1)
    })

    it('filters codex tool process events by event type', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const codexSession = harness.store.sessions.getOrCreateSession(
            'codex-tools',
            { path: '/repo/codex', host: 'dev', flavor: 'codex' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Codex Tool Process Group',
            noteSessionId: codexSession.id,
            sessionMemberIds: [codexSession.id]
        })

        const routeContext = {
            groupId: group.group.id,
            traceId: 'trace-tools',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }

        emitMessage(harness.engine, codexSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@codex-tools 执行工具任务' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 2, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'tool-call',
                    message: 'Using WebSearch...'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 3, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'tool-call-result',
                    message: 'Result: done'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 4, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const chats = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(chats).toHaveLength(0)
    })

    it('filters codex title changed event messages', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const codexSession = harness.store.sessions.getOrCreateSession(
            'codex-title',
            { path: '/repo/codex', host: 'dev', flavor: 'codex' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Codex Title Event Group',
            noteSessionId: codexSession.id,
            sessionMemberIds: [codexSession.id]
        })

        const routeContext = {
            groupId: group.group.id,
            traceId: 'trace-title',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }

        emitMessage(harness.engine, codexSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@codex-title 处理任务' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 2, {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'message',
                    message: 'Title changed to "Refactor auth module"'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 3, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: '主任务执行完成。'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 4, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const chats = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(chats).toHaveLength(1)
        const payload = chats[0].payload as { text?: unknown }
        expect(payload.text).toBe('主任务执行完成。')
    })

    it('filters codex title tool progress messages', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const codexSession = harness.store.sessions.getOrCreateSession(
            'codex-title-tool-progress',
            { path: '/repo/codex', host: 'dev', flavor: 'codex' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Codex Title Tool Progress Group',
            noteSessionId: codexSession.id,
            sessionMemberIds: [codexSession.id]
        })

        const routeContext = {
            groupId: group.group.id,
            traceId: 'trace-title-tool-progress',
            source: 'user:web',
            targetSessionIds: [codexSession.id]
        }

        emitMessage(harness.engine, codexSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@codex-title-tool-progress 执行任务' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 2, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: 'Changing task title'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 3, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: 'Initiating title change and loading memory'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 4, {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: '主任务执行完成。'
                }
            },
            meta: { routeContext }
        })

        emitMessage(harness.engine, codexSession.id, 5, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const chats = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(chats).toHaveLength(1)
        const payload = chats[0].payload as { text?: unknown }
        expect(payload.text).toBe('主任务执行完成。')
    })

    it('filters claude title sync summary and title mutation text', () => {
        const harness = createHarness()
        harnesses.push(harness)

        const claudeSession = harness.store.sessions.getOrCreateSession(
            'claude-title',
            { path: '/repo/claude', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )

        const group = harness.engine.createGroup({
            namespace: 'default',
            name: 'Claude Title Noise Group',
            noteSessionId: claudeSession.id,
            sessionMemberIds: [claudeSession.id]
        })

        const routeContext = {
            groupId: group.group.id,
            traceId: 'trace-claude-title',
            source: 'user:web',
            targetSessionIds: [claudeSession.id]
        }

        emitMessage(harness.engine, claudeSession.id, 1, {
            role: 'user',
            content: { type: 'text', text: '@claude-title 执行任务' },
            meta: { routeContext }
        })

        emitMessage(harness.engine, claudeSession.id, 2, {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'summary',
                    summary: 'Refactor auth module',
                    leafUuid: 'leaf-title-sync'
                }
            },
            meta: {}
        })

        emitMessage(harness.engine, claudeSession.id, 3, {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: 'Successfully changed chat title to: "Refactor auth module"'
                    }
                }
            },
            meta: {}
        })

        emitMessage(harness.engine, claudeSession.id, 4, {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: '主任务执行完成。'
                    }
                }
            },
            meta: {}
        })

        emitMessage(harness.engine, claudeSession.id, 5, {
            role: 'agent',
            content: {
                type: 'event',
                data: { type: 'ready' }
            },
            meta: {}
        })

        const chats = getGroupMessages(harness.engine, group.group.id).filter((msg) => msg.type === 'chat')
        expect(chats).toHaveLength(1)
        const payload = chats[0].payload as { text?: unknown }
        expect(payload.text).toBe('主任务执行完成。')
    })
})
