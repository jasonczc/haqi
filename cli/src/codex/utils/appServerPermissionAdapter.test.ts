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
});
