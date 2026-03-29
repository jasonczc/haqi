import { describe, expect, it, vi } from 'vitest';
import { registerAppServerPermissionHandlers } from './appServerPermissionAdapter';

describe('registerAppServerPermissionHandlers', () => {
    it('maps MCP permission request_user_input prompts to normal permission tool calls', async () => {
        const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
        const handleToolCall = vi.fn(async () => ({
            decision: 'approved'
        }));

        registerAppServerPermissionHandlers({
            client: {
                registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>) {
                    handlers.set(method, handler);
                }
            } as never,
            permissionHandler: {
                handleToolCall
            } as never
        });

        const handler = handlers.get('item/tool/requestUserInput');
        expect(handler).toBeTypeOf('function');

        const result = await handler?.({
            itemId: 'req-1',
            input: {
                questions: [{
                    id: 'permission',
                    question: 'Allow the playwright MCP server to run tool "browser_navigate"?',
                    options: [
                        { label: 'Allow' },
                        { label: 'Deny' }
                    ]
                }]
            }
        });

        expect(handleToolCall).toHaveBeenCalledWith(
            'req-1',
            'mcp__playwright__browser_navigate',
            {
                message: 'Allow the playwright MCP server to run tool "browser_navigate"?'
            }
        );
        expect(result).toEqual({
            decision: 'accept',
            answers: {
                permission: {
                    answers: ['Allow']
                }
            }
        });
    });

    it('keeps genuine request_user_input prompts as question tools', async () => {
        const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
        const handleToolCall = vi.fn(async () => ({
            decision: 'approved',
            answers: {
                q1: {
                    answers: ['foo']
                }
            }
        }));

        registerAppServerPermissionHandlers({
            client: {
                registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>) {
                    handlers.set(method, handler);
                }
            } as never,
            permissionHandler: {
                handleToolCall
            } as never
        });

        const handler = handlers.get('item/tool/requestUserInput');
        const input = {
            questions: [{
                id: 'q1',
                question: 'What should I do next?',
                options: [{ label: 'foo' }]
            }]
        };

        const result = await handler?.({
            itemId: 'req-2',
            input
        });

        expect(handleToolCall).toHaveBeenCalledWith('req-2', 'request_user_input', input);
        expect(result).toEqual({
            decision: 'accept',
            answers: {
                q1: {
                    answers: ['foo']
                }
            }
        });
    });

    it('maps mcpServer elicitation approval requests to MCP tool permissions', async () => {
        const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
        const handleToolCall = vi.fn(async () => ({
            decision: 'approved'
        }));

        registerAppServerPermissionHandlers({
            client: {
                registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>) {
                    handlers.set(method, handler);
                }
            } as never,
            permissionHandler: {
                handleToolCall
            } as never
        });

        const handler = handlers.get('mcpServer/elicitation/request');
        expect(handler).toBeTypeOf('function');

        const result = await handler?.({
            threadId: 'thread-1',
            turnId: 'turn-1',
            serverName: 'haqi',
            message: 'Allow the haqi MCP server to run tool "change_title"?',
            requestedSchema: {
                type: 'object',
                properties: {}
            }
        });

        expect(handleToolCall).toHaveBeenCalledWith(
            'turn-1',
            'mcp__haqi__change_title',
            {
                message: 'Allow the haqi MCP server to run tool "change_title"?'
            }
        );
        expect(result).toEqual({
            action: 'accept',
            decision: 'approved'
        });
    });

    it('preserves deny decisions for mcpServer elicitation approval requests', async () => {
        const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
        const handleToolCall = vi.fn(async () => ({
            decision: 'denied',
            reason: 'Need manual confirmation'
        }));

        registerAppServerPermissionHandlers({
            client: {
                registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>) {
                    handlers.set(method, handler);
                }
            } as never,
            permissionHandler: {
                handleToolCall
            } as never
        });

        const handler = handlers.get('mcpServer/elicitation/request');
        const result = await handler?.({
            threadId: 'thread-1',
            serverName: 'haqi',
            message: 'Allow the haqi MCP server to run tool "report_list"?',
            requestedSchema: {
                type: 'object',
                properties: {}
            }
        });

        expect(result).toEqual({
            action: 'decline',
            decision: 'denied',
            reason: 'Need manual confirmation'
        });
    });
});
