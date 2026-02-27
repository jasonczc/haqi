/**
 * HAPI MCP server
 * Provides HAPI CLI specific tools including chat session title management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";
import { isLowSignalTitle, normalizeTitleCandidate } from "@/utils/titlePolicy";

export async function startHappyServer(client: ApiSessionClient) {
    // Handler that sends title updates via the client
    const handler = async (title: string) => {
        const normalizedTitle = normalizeTitleCandidate(title);
        const currentTitle = client.getCurrentSummaryText();
        const shouldSkipLowSignalUpdate = Boolean(
            currentTitle
            && !isLowSignalTitle(currentTitle)
            && isLowSignalTitle(normalizedTitle)
        );

        logger.debug('[hapiMCP] Changing title to:', normalizedTitle);

        if (!normalizedTitle) {
            return { success: false, error: 'Title cannot be empty.' };
        }
        if (shouldSkipLowSignalUpdate) {
            logger.debug('[hapiMCP] Skipping low-signal title update', {
                currentTitle,
                requestedTitle: normalizedTitle
            });
            return { success: true, skipped: true, title: currentTitle };
        }

        try {
            // Send title as a summary message, similar to title generator
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: normalizedTitle,
                leafUuid: randomUUID()
            });
            
            return { success: true, skipped: false, title: normalizedTitle };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Create the MCP server
    //

    const mcp = new McpServer({
        name: "HAPI MCP",
        version: "1.0.0",
    });

    // Avoid TS instantiation depth issues by widening the schema type.
    const changeTitleInputSchema: z.ZodTypeAny = z.object({
        title: z.string().describe('The new title for the chat session'),
    });

    mcp.registerTool<any, any>('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: changeTitleInputSchema,
    }, async (args: { title: string }) => {
        const response = await handler(args.title);
        logger.debug('[hapiMCP] Response:', response);
        
        if (response.success) {
            const message = response.skipped
                ? `Kept existing chat title: "${response.title}".`
                : `Successfully changed chat title to: "${response.title ?? args.title}"`;
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: message,
                    },
                ],
                isError: false,
            };
        } else {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    });

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title'],
        stop: () => {
            logger.debug('[hapiMCP] Stopping server');
            mcp.close();
            server.close();
        }
    }
}
