import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
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
    approvePermission: ReturnType<typeof mock<(...args: unknown[]) => Promise<void>>>
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
    const approvePermission = mock(async () => {})
    ;(engine as unknown as {
        rpcGateway: { approvePermission: typeof approvePermission }
    }).rpcGateway.approvePermission = approvePermission
    return { store, engine, sseManager, approvePermission }
}

function createAutoApproveSession(harness: Harness, toolName: string) {
    const session = harness.engine.getOrCreateSession(
        `session-${toolName}`,
        { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
        {
            requests: {
                'req-1': {
                    tool: toolName,
                    arguments: {},
                    createdAt: Date.now()
                }
            },
            completedRequests: {}
        },
        'default'
    )
    harness.engine.handleSessionAlive({
        sid: session.id,
        time: Date.now(),
        permissionMode: 'auto-approve'
    })
    return session
}

const harnesses: Harness[] = []

beforeEach(() => {
    mock.restore()
})

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

describe('SyncEngine auto-approve guardrails', () => {
    it('auto-approves ordinary pending requests in auto-approve mode', async () => {
        const harness = createHarness()
        harnesses.push(harness)
        const session = createAutoApproveSession(harness, 'CodexBash')

        await (harness.engine as unknown as {
            maybeAutoApprovePendingRequests: (sessionId: string) => Promise<void>
        }).maybeAutoApprovePendingRequests(session.id)

        expect(harness.approvePermission).toHaveBeenCalledTimes(1)
        expect(harness.approvePermission).toHaveBeenCalledWith(
            session.id,
            'req-1',
            undefined,
            undefined,
            'approved'
        )
    })

    it.each([
        'ExitPlanMode',
        'exit_plan_mode',
        'request_user_input',
        'requestUserInput',
        'AskUserQuestion',
        'ask_user_question'
    ])('keeps %s pending even in auto-approve mode', async (toolName) => {
        const harness = createHarness()
        harnesses.push(harness)
        const session = createAutoApproveSession(harness, toolName)

        await (harness.engine as unknown as {
            maybeAutoApprovePendingRequests: (sessionId: string) => Promise<void>
        }).maybeAutoApprovePendingRequests(session.id)

        expect(harness.approvePermission).not.toHaveBeenCalled()
    })
})
