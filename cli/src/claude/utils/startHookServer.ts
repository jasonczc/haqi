/**
 * Dedicated HTTP server for receiving Claude hooks.
 *
 * Receives lifecycle notifications for session, subagent, and team-task events.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { logger } from '@/ui/logger';
import { ClaudeHookEventSchema, HookResponseSchema, type ClaudeHookEvent, type HookResponse } from '@/claude/hooks';

/** @deprecated Use ClaudeHookEvent from '@/claude/hooks'. */
export type SessionHookData = ClaudeHookEvent;

export interface HookServerOptions {
    /** Called when a Claude hook is received with a valid session ID. */
    onClaudeHook: (sessionId: string, data: ClaudeHookEvent) => void | HookResponse | Promise<void | HookResponse>;
    /** Optional token to require for hook requests. */
    token?: string;
}

export interface HookServer {
    /** The port the server is listening on. */
    port: number;
    /** Token required for hook requests. */
    token: string;
    /** Stop the server. */
    stop: () => void;
}

function readHookToken(req: IncomingMessage): string | null {
    const header = req.headers['x-hapi-hook-token'];
    if (Array.isArray(header)) {
        return header[0] ?? null;
    }
    return header ?? null;
}

function writeHookResponse(res: ServerResponse, response: HookResponse | void): void {
    const parsed = HookResponseSchema.safeParse(response ?? { exit_code: 0 });
    const payload = parsed.success ? parsed.data : { exit_code: 0 };
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
}

/**
 * Start a dedicated HTTP server for receiving Claude session hooks.
 */
export async function startHookServer(options: HookServerOptions): Promise<HookServer> {
    const { onClaudeHook } = options;
    const hookToken = options.token || randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
        const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
            const requestPath = req.url?.split('?')[0];
            if (req.method === 'POST' && (requestPath === '/hook/session-start' || requestPath === '/hook/claude')) {
                const providedToken = readHookToken(req);
                if (providedToken !== hookToken) {
                    logger.debug('[hookServer] Unauthorized hook request');
                    res.writeHead(401, { 'Content-Type': 'text/plain' }).end('unauthorized');
                    req.resume();
                    return;
                }

                let timedOut = false;
                const timeout = setTimeout(() => {
                    timedOut = true;
                    if (!res.headersSent) {
                        logger.debug('[hookServer] Request timeout');
                        res.writeHead(408).end('timeout');
                    }
                    req.destroy(new Error('Request timeout'));
                }, 5000);

                try {
                    const chunks: Buffer[] = [];
                    for await (const chunk of req) {
                        chunks.push(chunk as Buffer);
                    }
                    clearTimeout(timeout);

                    if (timedOut || res.headersSent || res.writableEnded) {
                        return;
                    }

                    const body = Buffer.concat(chunks).toString('utf-8');
                    logger.debug('[hookServer] Received Claude hook:', body);

                    let parsedJson: unknown;
                    try {
                        parsedJson = JSON.parse(body);
                    } catch (parseError) {
                        logger.debug('[hookServer] Failed to parse hook data as JSON:', parseError);
                        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('invalid json');
                        return;
                    }

                    const parseResult = ClaudeHookEventSchema.safeParse(parsedJson);
                    if (!parseResult.success) {
                        logger.debug('[hookServer] Invalid Claude hook payload:', parseResult.error.message);
                        res.writeHead(422, { 'Content-Type': 'text/plain' }).end('invalid hook payload');
                        return;
                    }

                    const data = parseResult.data;
                    const sessionId = data.session_id;
                    logger.debug(`[hookServer] Claude hook received session ID: ${sessionId}`);
                    const hookResponse = await onClaudeHook(sessionId, data);

                    if (!res.headersSent && !res.writableEnded) {
                        writeHookResponse(res, hookResponse);
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    if (timedOut) {
                        return;
                    }
                    logger.debug('[hookServer] Error handling Claude hook:', error);
                    if (!res.headersSent && !res.writableEnded) {
                        res.writeHead(500).end('error');
                    }
                }
                return;
            }

            res.writeHead(404).end('not found');
        });

        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Failed to get server address'));
                return;
            }

            const port = address.port;
            logger.debug(`[hookServer] Started on port ${port}`);

            resolve({
                port,
                token: hookToken,
                stop: () => {
                    server.close();
                    logger.debug('[hookServer] Stopped');
                }
            });
        });

        server.on('error', (err) => {
            logger.debug('[hookServer] Server error:', err);
            reject(err);
        });
    });
}
