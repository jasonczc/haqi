import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

const harness = vi.hoisted(() => ({
    notifications: [] as Array<{ method: string; params: unknown }>,
    registerRequestCalls: [] as string[],
    initializeCalls: [] as Array<{ capabilities?: { experimentalApi?: boolean; optOutRequestMethods?: string[] | null } }>,
    disconnectCalls: 0,
    startTurnNotifications: null as Array<{ method: string; params: unknown }> | null,
    interruptTurnCalls: [] as Array<{ threadId?: string; turnId?: string }>
}));

vi.mock('./codexAppServerClient', () => {
    class MockCodexAppServerClient {
        private notificationHandler: ((method: string, params: unknown) => void) | null = null;

        async connect(): Promise<void> {}

        async initialize(params?: { capabilities?: { experimentalApi?: boolean; optOutRequestMethods?: string[] | null } }): Promise<{ protocolVersion: number }> {
            harness.initializeCalls.push(params ?? {});
            return { protocolVersion: 1 };
        }

        setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
            this.notificationHandler = handler;
        }

        registerRequestHandler(method: string): void {
            harness.registerRequestCalls.push(method);
        }

        async startThread(): Promise<{ thread: { id: string } }> {
            return { thread: { id: 'thread-anonymous' } };
        }

        async resumeThread(): Promise<{ thread: { id: string } }> {
            return { thread: { id: 'thread-anonymous' } };
        }

        async startTurn(): Promise<{ turn: Record<string, never> }> {
            const notifications = harness.startTurnNotifications ?? [
                { method: 'turn/started', params: { turn: {} } },
                { method: 'turn/completed', params: { status: 'Completed', turn: {} } }
            ];

            for (const notification of notifications) {
                harness.notifications.push(notification);
                this.notificationHandler?.(notification.method, notification.params);
            }

            return { turn: {} };
        }

        async interruptTurn(params?: { threadId?: string; turnId?: string }): Promise<Record<string, never>> {
            harness.interruptTurnCalls.push(params ?? {});
            return {};
        }

        async disconnect(): Promise<void> {
            harness.disconnectCalls += 1;
        }
    }

    return { CodexAppServerClient: MockCodexAppServerClient };
});

vi.mock('./utils/buildHapiMcpBridge', () => ({
    buildHapiMcpBridge: async () => ({
        server: {
            stop: () => {}
        },
        mcpServers: {}
    })
}));

import { codexRemoteLauncher } from './codexRemoteLauncher';

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createMode(overrides: Partial<EnhancedMode> = {}): EnhancedMode {
    return {
        permissionMode: 'default',
        ...overrides
    };
}

function createSessionStub() {
    const queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode));
    queue.push('hello from launcher test', createMode());
    queue.close();

    const sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
    const codexMessages: unknown[] = [];
    const thinkingChanges: boolean[] = [];
    const foundSessionIds: string[] = [];
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };

    const rpcHandlers = new Map<string, (params: unknown) => unknown>();
    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        },
        sendCodexMessage(message: unknown) {
            codexMessages.push(message);
        },
        sendUserMessage(_text: string) {},
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            sessionEvents.push(event);
        }
    };

    const session = {
        path: '/tmp/hapi-update',
        logPath: '/tmp/hapi-update/test.log',
        client,
        queue,
        codexArgs: undefined,
        codexCliOverrides: undefined,
        sessionId: null as string | null,
        thinking: false,
        collaborationMode: undefined as string | undefined,
        permissionMode: 'default' as EnhancedMode['permissionMode'],
        onThinkingChange(nextThinking: boolean) {
            session.thinking = nextThinking;
            thinkingChanges.push(nextThinking);
        },
        onSessionFound(id: string) {
            session.sessionId = id;
            foundSessionIds.push(id);
        },
        sendCodexMessage(message: unknown) {
            client.sendCodexMessage(message);
        },
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            client.sendSessionEvent(event);
        },
        sendUserMessage(text: string) {
            client.sendUserMessage(text);
        },
        getCollaborationMode() {
            return session.collaborationMode;
        },
        setCollaborationMode(mode: string | undefined) {
            session.collaborationMode = mode;
        },
        getPermissionMode() {
            return session.permissionMode;
        }
    };

    return {
        session,
        sessionEvents,
        codexMessages,
        thinkingChanges,
        foundSessionIds,
        rpcHandlers,
        getAgentState: () => agentState
    };
}

describe('codexRemoteLauncher', () => {
    afterEach(() => {
        harness.notifications = [];
        harness.registerRequestCalls = [];
        harness.initializeCalls = [];
        harness.disconnectCalls = 0;
        harness.startTurnNotifications = null;
        harness.interruptTurnCalls = [];
        delete process.env.CODEX_USE_MCP_SERVER;
    });

    it('finishes a turn and emits ready when task lifecycle events omit turn_id', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        const {
            session,
            sessionEvents,
            thinkingChanges,
            foundSessionIds
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toContain('thread-anonymous');
        expect(harness.notifications.map((entry) => entry.method)).toEqual(['turn/started', 'turn/completed']);
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
        expect(thinkingChanges).toContain(true);
        expect(session.thinking).toBe(false);
    });


    it('opts out request_user_input outside plan mode and re-enables it for plan mode', async () => {
        process.env.CODEX_USE_MCP_SERVER = '0';

        const { session } = createSessionStub();
        session.queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode));
        session.queue.push('default turn', createMode());
        session.queue.push('plan turn', createMode({ collaborationMode: 'plan', model: 'o3' }));
        session.queue.close();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.initializeCalls.map((call) => call.capabilities)).toEqual([
            { experimentalApi: true, optOutRequestMethods: ['item/tool/requestUserInput'] },
            { experimentalApi: true }
        ]);
        expect(harness.disconnectCalls).toBeGreaterThanOrEqual(1);
    });

    it('shows completed plan proposals as assistant messages instead of ExitPlanMode tool calls', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-1' } } },
            {
                method: 'item/started',
                params: {
                    item: {
                        id: 'plan-1',
                        type: 'plan',
                        text: 'Review current implementation'
                    },
                    turnId: 'turn-1'
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: {
                        id: 'plan-1',
                        type: 'plan',
                        text: 'Review current implementation'
                    },
                    turnId: 'turn-1'
                }
            },
            { method: 'turn/completed', params: { status: 'Completed', turn: { id: 'turn-1' } } }
        ];

        const { session, codexMessages } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'message',
            message: 'Review current implementation'
        }));
        expect(codexMessages).not.toContainEqual(expect.objectContaining({
            type: 'tool-call',
            name: 'ExitPlanMode',
            callId: 'plan-1'
        }));
    });

    it('publishes the buffered plan proposal text as an assistant message on completion', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-2' } } },
            {
                method: 'item/started',
                params: {
                    item: {
                        id: 'plan-2',
                        type: 'plan'
                    },
                    turnId: 'turn-2'
                }
            },
            {
                method: 'item/plan/delta',
                params: {
                    itemId: 'plan-2',
                    delta: '- Step 1\\n'
                }
            },
            {
                method: 'item/plan/delta',
                params: {
                    itemId: 'plan-2',
                    delta: '- Step 2'
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: {
                        id: 'plan-2',
                        type: 'plan',
                        text: '- Step 1\\n- Step 2'
                    },
                    turnId: 'turn-2'
                }
            },
            { method: 'turn/completed', params: { status: 'Completed', turn: { id: 'turn-2' } } }
        ];

        const { session, codexMessages } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'message',
            message: '- Step 1\\n- Step 2'
        }));
        expect(codexMessages).not.toContainEqual(expect.objectContaining({
            type: 'tool-call',
            name: 'ExitPlanMode',
            callId: 'plan-2'
        }));
    });

    it('does not auto-approve or auto-execute a visible plan without an explicit permission response', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-plan-pending' } } },
            {
                method: 'item/started',
                params: {
                    item: {
                        id: 'plan-visible',
                        type: 'plan',
                        text: '1. inspect\\n2. patch\\n3. verify'
                    },
                    turnId: 'turn-plan-pending'
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: {
                        id: 'plan-visible',
                        type: 'plan',
                        text: '1. inspect\\n2. patch\\n3. verify'
                    },
                    turnId: 'turn-plan-pending'
                }
            },
            { method: 'turn/completed', params: { status: 'Completed', turn: { id: 'turn-plan-pending' } } }
        ];

        const { session, sessionEvents, codexMessages, getAgentState } = createSessionStub();
        session.collaborationMode = 'plan';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'message',
            message: '1. inspect\\n2. patch\\n3. verify'
        }));
        expect(sessionEvents).not.toContainEqual(expect.objectContaining({
            type: 'message',
            message: 'Plan 已确认，自动退出计划模式并继续执行。'
        }));
        expect(getAgentState().completedRequests).not.toEqual(expect.objectContaining({
            'plan-visible': expect.objectContaining({
                status: 'approved'
            })
        }));
    });


    it('surfaces ExitPlanMode text inline, strips it from the tool card input, and interrupts the turn until approval', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-plan-tool' } } },
            {
                method: 'codex/event/msg',
                params: {
                    msg: {
                        type: 'tool_call_begin',
                        call_id: 'plan-tool-1',
                        name: 'ExitPlanMode',
                        input: {
                            text: '1. inspect\n2. patch\n3. verify'
                        },
                        turn_id: 'turn-plan-tool'
                    }
                }
            },
            { method: 'turn/completed', params: { status: 'Interrupted', turn: { id: 'turn-plan-tool' } } }
        ];

        const { session, codexMessages } = createSessionStub();
        session.collaborationMode = 'plan';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'message',
            message: '1. inspect\n2. patch\n3. verify'
        }));
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'tool-call',
            name: 'ExitPlanMode',
            callId: 'plan-tool-1',
            input: {}
        }));
        expect(harness.interruptTurnCalls).toEqual([
            { threadId: 'thread-anonymous', turnId: 'turn-plan-tool' }
        ]);
    });

    it('does not duplicate the plan text when both ExitPlanMode and plan_proposal events arrive for the same call', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-plan-dupe' } } },
            {
                method: 'codex/event/msg',
                params: {
                    msg: {
                        type: 'tool_call_begin',
                        call_id: 'plan-tool-2',
                        name: 'ExitPlanMode',
                        input: {
                            text: 'same plan'
                        },
                        turn_id: 'turn-plan-dupe'
                    }
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: {
                        id: 'plan-tool-2',
                        type: 'plan',
                        text: 'same plan'
                    },
                    turnId: 'turn-plan-dupe'
                }
            },
            { method: 'turn/completed', params: { status: 'Interrupted', turn: { id: 'turn-plan-dupe' } } }
        ];

        const { session, codexMessages } = createSessionStub();
        session.collaborationMode = 'plan';

        await codexRemoteLauncher(session as never);

        expect(codexMessages.filter((message) => (
            typeof message === 'object'
            && message !== null
            && (message as { type?: string }).type === 'message'
            && (message as { message?: string }).message === 'same plan'
        ))).toHaveLength(1);
    });

    it('does not request plan approval or auto-execute when no plan text is available', async () => {
        delete process.env.CODEX_USE_MCP_SERVER;
        harness.startTurnNotifications = [
            { method: 'turn/started', params: { turn: { id: 'turn-3' } } },
            {
                method: 'item/started',
                params: {
                    item: {
                        id: 'plan-3',
                        type: 'plan'
                    },
                    turnId: 'turn-3'
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: {
                        id: 'plan-3',
                        type: 'plan'
                    },
                    turnId: 'turn-3'
                }
            },
            { method: 'turn/completed', params: { status: 'Completed', turn: { id: 'turn-3' } } }
        ];

        const { session, sessionEvents, codexMessages, getAgentState } = createSessionStub();
        session.collaborationMode = 'plan';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(getAgentState().requests).toEqual({});
        expect(getAgentState().completedRequests).toEqual({});
        expect(sessionEvents).not.toContainEqual(expect.objectContaining({
            type: 'message',
            message: 'Plan 已确认，自动退出计划模式并继续执行。'
        }));
        expect(codexMessages).not.toContainEqual(expect.objectContaining({
            type: 'tool-call',
            name: 'CodexPermission',
            callId: 'plan-3'
        }));
    });
});
