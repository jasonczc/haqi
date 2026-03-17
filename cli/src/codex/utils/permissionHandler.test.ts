import { describe, expect, it } from 'vitest';
import type { ApiSessionClient } from '@/api/apiSession';
import { CodexPermissionHandler } from './permissionHandler';

type PermissionRpcPayload = {
    id: string;
    approved: boolean;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    reason?: string;
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>;
};

function createHarness() {
    let state: Record<string, unknown> = {};
    let permissionHandler: ((payload: PermissionRpcPayload) => Promise<void> | void) | null = null;

    const session = {
        rpcHandlerManager: {
            registerHandler: (method: string, handler: (payload: PermissionRpcPayload) => Promise<void> | void) => {
                if (method === 'permission') {
                    permissionHandler = handler;
                }
            }
        },
        updateAgentState: (updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
            state = updater(state);
        }
    } as unknown as ApiSessionClient;

    return {
        session,
        getState: () => state,
        respond: async (payload: PermissionRpcPayload) => {
            if (!permissionHandler) {
                throw new Error('Permission handler is not registered');
            }
            await permissionHandler(payload);
        }
    };
}

describe('CodexPermissionHandler', () => {
    it('auto-approves immediately in auto-approve mode', async () => {
        const harness = createHarness();
        let completionDecision: string | undefined;
        const handler = new CodexPermissionHandler(harness.session, {
            getPermissionMode: () => 'auto-approve',
            onComplete: (result) => {
                completionDecision = result.decision;
            }
        });

        const result = await handler.handleToolCall('call-1', 'CodexBash', { command: 'ls' });

        expect(result).toEqual({ decision: 'approved' });
        expect(completionDecision).toBe('approved');

        const currentState = harness.getState() as {
            completedRequests?: Record<string, { status: string; decision: string; mode?: string }>;
        };
        expect(currentState.completedRequests?.['call-1']).toMatchObject({
            status: 'approved',
            decision: 'approved',
            mode: 'auto-approve'
        });
    });

    it('waits for permission response in default mode', async () => {
        const harness = createHarness();
        const handler = new CodexPermissionHandler(harness.session, {
            getPermissionMode: () => 'default'
        });

        const pending = handler.handleToolCall('call-2', 'CodexBash', { command: 'pwd' });
        await harness.respond({ id: 'call-2', approved: true, decision: 'approved' });
        const result = await pending;

        expect(result).toEqual({ decision: 'approved' });

        const currentState = harness.getState() as {
            requests?: Record<string, unknown>;
            completedRequests?: Record<string, { status: string; decision: string }>;
        };
        expect(currentState.requests?.['call-2']).toBeUndefined();
        expect(currentState.completedRequests?.['call-2']).toMatchObject({
            status: 'approved',
            decision: 'approved'
        });
    });

    it('does not auto-approve request_user_input in auto-approve mode', async () => {
        const harness = createHarness();
        const handler = new CodexPermissionHandler(harness.session, {
            getPermissionMode: () => 'auto-approve'
        });

        let settled = false;
        const pending = handler.handleToolCall('call-3', 'request_user_input', {
            questions: [{ id: 'plan_action', question: 'Proceed?', options: [] }]
        }).then((result) => {
            settled = true;
            return result;
        });

        await Promise.resolve();
        expect(settled).toBe(false);

        await harness.respond({
            id: 'call-3',
            approved: true,
            decision: 'approved',
            answers: {
                plan_action: { answers: ['Hold plan mode'] }
            }
        });
        const result = await pending;

        expect(result).toEqual({
            decision: 'approved',
            answers: {
                plan_action: { answers: ['Hold plan mode'] }
            }
        });

        const currentState = harness.getState() as {
            requests?: Record<string, unknown>;
            completedRequests?: Record<string, {
                status: string;
                decision: string;
                mode?: string;
                answers?: Record<string, { answers: string[] }>;
            }>;
        };
        expect(currentState.requests?.['call-3']).toBeUndefined();
        expect(currentState.completedRequests?.['call-3']).toMatchObject({
            status: 'approved',
            decision: 'approved',
            answers: {
                plan_action: { answers: ['Hold plan mode'] }
            }
        });
    });

    it('does not auto-approve ExitPlanMode in auto-approve mode', async () => {
        const harness = createHarness();
        const handler = new CodexPermissionHandler(harness.session, {
            getPermissionMode: () => 'auto-approve'
        });

        let settled = false;
        const pending = handler.handleToolCall('call-4', 'ExitPlanMode', {
            text: 'Proposed plan'
        }).then((result) => {
            settled = true;
            return result;
        });

        await Promise.resolve();
        expect(settled).toBe(false);

        const currentState = harness.getState() as {
            requests?: Record<string, { tool: string }>;
            completedRequests?: Record<string, unknown>;
        };
        expect(currentState.requests?.['call-4']).toMatchObject({
            tool: 'ExitPlanMode'
        });
        expect(currentState.completedRequests?.['call-4']).toBeUndefined();

        await harness.respond({
            id: 'call-4',
            approved: false,
            decision: 'abort',
            reason: 'Keep planning'
        });

        await expect(pending).resolves.toEqual({
            decision: 'abort',
            reason: 'Keep planning',
            answers: undefined
        });
    });
});
