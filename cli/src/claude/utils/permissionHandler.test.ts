import { describe, expect, it } from 'vitest';
import type { SDKAssistantMessage } from '@/claude/sdk';
import type { PermissionMode } from '@/claude/loop';
import { PermissionHandler } from './permissionHandler';

type PermissionRpcPayload = {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: PermissionMode;
    allowTools?: string[];
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>;
};

function createHarness() {
    let state: Record<string, unknown> = {};
    let permissionHandlerRpc: ((payload: PermissionRpcPayload) => Promise<void> | void) | null = null;

    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler: (method: string, handler: (payload: PermissionRpcPayload) => Promise<void> | void) => {
                    if (method === 'permission') {
                        permissionHandlerRpc = handler;
                    }
                }
            },
            updateAgentState: (updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
                state = updater(state);
            }
        },
        queue: {
            unshift: () => undefined
        },
        setPermissionMode: () => undefined
    } as any;

    return {
        session,
        getState: () => state,
        respond: async (payload: PermissionRpcPayload) => {
            if (!permissionHandlerRpc) {
                throw new Error('Permission RPC handler is not registered');
            }
            await permissionHandlerRpc(payload);
        }
    };
}

describe('Claude PermissionHandler', () => {
    it('publishes MCP permission questions as regular permission requests outside plan mode', async () => {
        const harness = createHarness();
        const handler = new PermissionHandler(harness.session);

        const input = {
            questions: [
                {
                    id: '0',
                    question: 'Allow the playwright MCP server to run tool "browser_navigate"?',
                    options: [
                        { label: 'Yes' },
                        { label: 'No' }
                    ]
                }
            ]
        };

        const message: SDKAssistantMessage = {
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [
                    {
                        type: 'tool_use',
                        id: 'tool-1',
                        name: 'AskUserQuestion',
                        input
                    }
                ]
            }
        };

        handler.onMessage(message);

        const pending = handler.handleToolCall(
            'AskUserQuestion',
            input,
            { permissionMode: 'default' },
            { signal: new AbortController().signal }
        );

        await Promise.resolve();

        const currentState = harness.getState() as {
            requests?: Record<string, { tool: string; arguments: unknown }>;
        };
        expect(currentState.requests?.['tool-1']).toMatchObject({
            tool: 'mcp__playwright__browser_navigate',
            arguments: {
                server: 'playwright',
                tool: 'browser_navigate'
            }
        });

        await harness.respond({
            id: 'tool-1',
            approved: false,
            reason: 'Denied'
        });
        await expect(pending).resolves.toEqual({
            behavior: 'allow',
            updatedInput: {
                ...input,
                answers: {
                    'Allow the playwright MCP server to run tool "browser_navigate"?': ['No']
                }
            }
        });
    });
});
