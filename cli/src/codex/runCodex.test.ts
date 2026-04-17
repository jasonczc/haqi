import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcHandlers = new Map<string, (payload?: unknown) => Promise<unknown> | unknown>();
const stopCurrentTurn = vi.fn(async () => {});

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async () => ({
        api: {},
        session: {
            rpcHandlerManager: {
                registerHandler(method: string, handler: (payload?: unknown) => Promise<unknown> | unknown) {
                    rpcHandlers.set(method, handler);
                }
            },
            updateMetadata(updater: (metadata: Record<string, unknown>) => Record<string, unknown>) {
                updater({});
            },
            onUserMessage() {},
            sendCodexMessage() {},
            sendSessionEvent() {}
        },
        sessionInfo: {
            metadata: {}
        }
    }))
}));

vi.mock('./loop', () => ({
    loop: vi.fn(async (opts: { onSessionReady?: (instance: unknown) => void }) => {
        opts.onSessionReady?.({
            stopCurrentTurn,
            stopKeepAlive() {},
            setPermissionMode() {},
            setCollaborationMode() {},
            getCollaborationMode() {
                return undefined;
            },
            thinking: true,
            mode: 'remote',
            sessionId: 'session-test'
        });
    })
}));

vi.mock('@/agent/runnerLifecycle', () => ({
    createRunnerLifecycle: vi.fn(() => ({
        registerProcessHandlers() {},
        cleanupAndExit: vi.fn(async () => {}),
        markCrash() {},
        setExitCode() {},
        setArchiveReason() {}
    })),
    createModeChangeHandler: vi.fn(() => () => {}),
    setControlledByUser: vi.fn()
}));

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: vi.fn()
}));

vi.mock('./utils/codexStatusCommand', () => ({
    isCodexStatusCommand: vi.fn(() => false),
    buildCodexStatusMessage: vi.fn(async () => 'status')
}));

describe('runCodex stop-and-preserve-codex-queue', () => {
    beforeEach(() => {
        rpcHandlers.clear();
        stopCurrentTurn.mockClear();
    });

    it('stops current turn without modifying queued messages', async () => {
        const { runCodex } = await import('./runCodex');

        await runCodex({ startedBy: 'runner' });

        const enqueueHandler = rpcHandlers.get('enqueue-codex-message');
        const stopHandler = rpcHandlers.get('stop-and-preserve-codex-queue');
        const getQueueHandler = rpcHandlers.get('get-codex-queue');

        expect(enqueueHandler).toBeTypeOf('function');
        expect(stopHandler).toBeTypeOf('function');
        expect(getQueueHandler).toBeTypeOf('function');

        await enqueueHandler?.({ text: 'first queued message' });
        await enqueueHandler?.({ text: 'second queued message' });

        const beforeStop = await getQueueHandler?.();
        expect(beforeStop).toMatchObject({
            success: true,
            queue: {
                pendingCount: 2,
                entries: [
                    { preview: 'first queued message' },
                    { preview: 'second queued message' }
                ]
            }
        });

        const stopResult = await stopHandler?.();
        expect(stopCurrentTurn).toHaveBeenCalledTimes(1);
        expect(stopResult).toMatchObject({
            success: true,
            queue: {
                pendingCount: 2,
                entries: [
                    { preview: 'first queued message' },
                    { preview: 'second queued message' }
                ]
            }
        });

        const afterStop = await getQueueHandler?.();
        expect(afterStop).toMatchObject({
            success: true,
            queue: {
                pendingCount: 2,
                entries: [
                    { preview: 'first queued message' },
                    { preview: 'second queued message' }
                ]
            }
        });
    });
});
