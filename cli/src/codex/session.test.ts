import { describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { CodexSession } from './session';
import type { EnhancedMode } from './loop';

function createSession() {
    return new CodexSession({
        api: {} as never,
        client: {
            keepAlive() {},
            updateMetadata() {}
        } as never,
        path: '/tmp/test',
        logPath: '/tmp/test.log',
        sessionId: null,
        messageQueue: new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode)),
        onModeChange: () => {},
        startedBy: 'runner',
        startingMode: 'remote',
        permissionMode: 'default'
    });
}

describe('CodexSession stopCurrentTurn', () => {
    it('invokes the registered stop handler', async () => {
        const session = createSession();
        const handler = vi.fn(async () => {});

        session.setStopCurrentTurnHandler(handler);
        await session.stopCurrentTurn();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no stop handler is registered', async () => {
        const session = createSession();

        await expect(session.stopCurrentTurn()).resolves.toBeUndefined();
    });
});
