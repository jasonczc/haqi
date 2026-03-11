/**
 * HAPI MCP server
 * Provides HAPI CLI specific tools including chat session title management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";
import { isLowSignalTitle, normalizeTitleCandidate } from "@/utils/titlePolicy";
import { configuration } from "@/configuration";
import { getAuthToken } from "@/api/auth";
import {
    changeTitleInputSchema,
    reportAddAssetInputSchema,
    reportCreateInputSchema,
    reportCreateShareInputSchema,
    reportGetInputSchema,
    reportListInputSchema,
    reportUpdateInputSchema,
    swarmRecordActivityInputSchema,
    swarmRecordArtifactInputSchema,
    swarmRecordEffectInputSchema,
    swarmRecordOutcomeInputSchema,
    swarmRecordReviewInputSchema
} from "@/mcp/hapiMcpTools";

type JsonObject = Record<string, unknown>;

function summarizeJson(payload: unknown): string {
    return JSON.stringify(payload, null, 2);
}

export async function startHappyServer(client: ApiSessionClient) {
    let cachedWebToken: { token: string; expiresAt: number } | null = null;

    const resolveHubUrl = (path: string): string => {
        const normalizedBase = configuration.apiUrl.endsWith("/")
            ? configuration.apiUrl
            : `${configuration.apiUrl}/`;
        return new URL(path, normalizedBase).toString();
    };

    const getWebToken = async (): Promise<string> => {
        if (cachedWebToken && cachedWebToken.expiresAt > Date.now()) {
            return cachedWebToken.token;
        }

        const response = await fetch(resolveHubUrl("/api/auth"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ accessToken: getAuthToken() })
        });

        const payload = await response.json().catch(() => null) as JsonObject | null;
        if (!response.ok) {
            const message = typeof payload?.error === "string"
                ? payload.error
                : `Auth failed (${response.status})`;
            throw new Error(message);
        }

        const token = typeof payload?.token === "string" ? payload.token : "";
        if (!token) {
            throw new Error("Auth succeeded but token is missing");
        }

        cachedWebToken = {
            token,
            expiresAt: Date.now() + 13 * 60 * 1000
        };
        return token;
    };

    const requestHubJson = async (path: string, init?: RequestInit): Promise<JsonObject> => {
        const doRequest = async (token: string): Promise<Response> => {
            const headers = new Headers(init?.headers);
            headers.set("Authorization", `Bearer ${token}`);
            if (init?.body !== undefined && !headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
            return await fetch(resolveHubUrl(path), {
                ...init,
                headers
            });
        };

        let response = await doRequest(await getWebToken());
        if (response.status === 401) {
            cachedWebToken = null;
            response = await doRequest(await getWebToken());
        }

        const payload = await response.json().catch(() => null) as JsonObject | null;
        if (!response.ok) {
            const message = typeof payload?.error === "string"
                ? payload.error
                : `Request failed (${response.status})`;
            throw new Error(message);
        }

        return payload ?? {};
    };

    const buildToolResult = (payload: JsonObject, summary: string) => ({
        content: [
            {
                type: "text" as const,
                text: `${summary}\n\n${summarizeJson(payload)}`
            }
        ],
        isError: false
    });

    const buildToolError = (label: string, error: unknown) => ({
        content: [
            {
                type: "text" as const,
                text: `${label}: ${error instanceof Error ? error.message : String(error)}`
            }
        ],
        isError: true
    });

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

    mcp.registerTool<any, any>('report_create', {
        description: 'Create a markdown report and optionally create a public share link',
        title: 'Create Report',
        inputSchema: reportCreateInputSchema
    }, async (args: {
        session_id?: string
        task_id?: string
        title?: string
        status?: string
        markdown?: string
        metadata?: unknown
        create_share?: boolean
        share_expires_in_hours?: number
    }) => {
        try {
            const payload = await requestHubJson('/api/reports', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: args.session_id ?? client.sessionId,
                    taskId: args.task_id,
                    title: args.title,
                    status: args.status,
                    markdown: args.markdown,
                    metadata: args.metadata,
                    createShare: args.create_share,
                    shareExpiresInHours: args.share_expires_in_hours
                })
            });
            const report = payload.report as JsonObject | undefined;
            const shareUrl = typeof report?.publicShareUrl === 'string' ? report.publicShareUrl : null;
            const summary = shareUrl
                ? `Report created. Public share: ${shareUrl}`
                : 'Report created.';
            return buildToolResult(payload, summary);
        } catch (error) {
            return buildToolError('Failed to create report', error);
        }
    });

    mcp.registerTool<any, any>('report_update', {
        description: 'Update report title/status/markdown/metadata',
        title: 'Update Report',
        inputSchema: reportUpdateInputSchema
    }, async (args: {
        report_id: string
        task_id?: string
        title?: string
        status?: string
        markdown?: string
        metadata?: unknown
    }) => {
        try {
            const payload = await requestHubJson(`/api/reports/${encodeURIComponent(args.report_id)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    taskId: args.task_id,
                    title: args.title,
                    status: args.status,
                    markdown: args.markdown,
                    metadata: args.metadata
                })
            });
            return buildToolResult(payload, `Report updated: ${args.report_id}`);
        } catch (error) {
            return buildToolError(`Failed to update report ${args.report_id}`, error);
        }
    });

    mcp.registerTool<any, any>('report_get', {
        description: 'Get full report details by report_id',
        title: 'Get Report',
        inputSchema: reportGetInputSchema
    }, async (args: { report_id: string }) => {
        try {
            const payload = await requestHubJson(`/api/reports/${encodeURIComponent(args.report_id)}`);
            return buildToolResult(payload, `Report loaded: ${args.report_id}`);
        } catch (error) {
            return buildToolError(`Failed to load report ${args.report_id}`, error);
        }
    });

    mcp.registerTool<any, any>('report_list', {
        description: 'List reports in current namespace',
        title: 'List Reports',
        inputSchema: reportListInputSchema
    }, async (args: { limit?: number; session_id?: string }) => {
        try {
            const query = new URLSearchParams();
            if (typeof args.limit === 'number') {
                query.set('limit', `${args.limit}`);
            }
            if (typeof args.session_id === 'string' && args.session_id.trim().length > 0) {
                query.set('sessionId', args.session_id.trim());
            }
            const suffix = query.size > 0 ? `?${query.toString()}` : '';
            const payload = await requestHubJson(`/api/reports${suffix}`);
            return buildToolResult(payload, 'Reports loaded.');
        } catch (error) {
            return buildToolError('Failed to list reports', error);
        }
    });

    mcp.registerTool<any, any>('report_add_asset', {
        description: 'Attach image/file asset to a report using base64/data-url/source-path',
        title: 'Add Report Asset',
        inputSchema: reportAddAssetInputSchema
    }, async (args: {
        report_id: string
        filename?: string
        mime_type?: string
        content_base64?: string
        content_data_url?: string
        source_path?: string
        caption?: string
    }) => {
        try {
            const content = args.content_data_url ?? args.content_base64;
            const payload = await requestHubJson(`/api/reports/${encodeURIComponent(args.report_id)}/assets`, {
                method: 'POST',
                body: JSON.stringify({
                    filename: args.filename,
                    mimeType: args.mime_type,
                    content,
                    sourcePath: args.source_path,
                    caption: args.caption
                })
            });
            return buildToolResult(payload, `Asset added to report: ${args.report_id}`);
        } catch (error) {
            return buildToolError(`Failed to add asset for report ${args.report_id}`, error);
        }
    });

    mcp.registerTool<any, any>('report_create_share', {
        description: 'Create a public share link for a report',
        title: 'Create Report Share',
        inputSchema: reportCreateShareInputSchema
    }, async (args: { report_id: string; expires_in_hours?: number; created_by?: string }) => {
        try {
            const payload = await requestHubJson(`/api/reports/${encodeURIComponent(args.report_id)}/shares`, {
                method: 'POST',
                body: JSON.stringify({
                    expiresInHours: args.expires_in_hours,
                    createdBy: args.created_by
                })
            });
            const share = payload.share as JsonObject | undefined;
            const shareUrl = typeof share?.shareUrl === 'string' ? share.shareUrl : null;
            const summary = shareUrl
                ? `Report share created: ${shareUrl}`
                : `Report share created for ${args.report_id}`;
            return buildToolResult(payload, summary);
        } catch (error) {
            return buildToolError(`Failed to create share for report ${args.report_id}`, error);
        }
    });


    mcp.registerTool<any, any>('record_activity', {
        description: 'Record a structured Swarm activity for the current mission/work item',
        title: 'Record Swarm Activity',
        inputSchema: swarmRecordActivityInputSchema
    }, async (args: {
        swarm_id: string
        work_item_id?: string
        kind: 'explore' | 'propose' | 'implement' | 'verify' | 'summarize' | 'coordinate'
        status?: 'open' | 'completed' | 'failed'
        summary?: string
        content?: unknown
    }) => {
        try {
            const payload = await requestHubJson(`/api/swarms/${encodeURIComponent(args.swarm_id)}/activities`, {
                method: 'POST',
                body: JSON.stringify({
                    workItemId: args.work_item_id,
                    kind: args.kind,
                    status: args.status ?? 'open',
                    content: args.content ?? args.summary
                })
            });
            return buildToolResult(payload, `Swarm activity recorded: ${args.kind}`);
        } catch (error) {
            return buildToolError(`Failed to record swarm activity for ${args.swarm_id}`, error);
        }
    });

    mcp.registerTool<any, any>('record_outcome', {
        description: 'Record a structured Swarm outcome such as proposal, blocker, decision, or summary',
        title: 'Record Swarm Outcome',
        inputSchema: swarmRecordOutcomeInputSchema
    }, async (args: {
        swarm_id: string
        subject_id?: string
        work_item_id?: string
        kind: 'proposal' | 'decision' | 'diff' | 'report' | 'test_result' | 'question' | 'blocker' | 'summary'
        status?: string
        content: unknown
        artifact_refs?: string[]
    }) => {
        try {
            const payload = await requestHubJson(`/api/swarms/${encodeURIComponent(args.swarm_id)}/outcomes`, {
                method: 'POST',
                body: JSON.stringify({
                    subjectId: args.subject_id,
                    workItemId: args.work_item_id,
                    kind: args.kind,
                    status: args.status ?? 'open',
                    content: args.content,
                    artifactRefs: args.artifact_refs
                })
            });
            return buildToolResult(payload, `Swarm outcome recorded: ${args.kind}`);
        } catch (error) {
            return buildToolError(`Failed to record swarm outcome for ${args.swarm_id}`, error);
        }
    });

    mcp.registerTool<any, any>('record_artifact', {
        description: 'Record a structured Swarm artifact such as diff, patch, report, or document',
        title: 'Record Swarm Artifact',
        inputSchema: swarmRecordArtifactInputSchema
    }, async (args: {
        swarm_id: string
        work_item_id?: string
        kind: 'report' | 'diff' | 'patch' | 'document' | 'test_result' | 'link' | 'file_bundle'
        title: string
        url?: string
        content?: unknown
        status?: string
    }) => {
        try {
            const payload = await requestHubJson(`/api/swarms/${encodeURIComponent(args.swarm_id)}/artifacts`, {
                method: 'POST',
                body: JSON.stringify({
                    workItemId: args.work_item_id,
                    kind: args.kind,
                    title: args.title,
                    url: args.url,
                    content: args.content,
                    status: args.status ?? 'draft'
                })
            });
            return buildToolResult(payload, `Swarm artifact recorded: ${args.title}`);
        } catch (error) {
            return buildToolError(`Failed to record swarm artifact for ${args.swarm_id}`, error);
        }
    });

    mcp.registerTool<any, any>('record_review', {
        description: 'Record a Swarm review verdict for a work item or artifact',
        title: 'Record Swarm Review',
        inputSchema: swarmRecordReviewInputSchema
    }, async (args: {
        swarm_id: string
        work_item_id?: string
        artifact_id?: string
        verdict: 'approved' | 'changes_requested' | 'commented'
        summary?: string
        evidence?: string
    }) => {
        try {
            const payload = await requestHubJson(`/api/swarms/${encodeURIComponent(args.swarm_id)}/reviews`, {
                method: 'POST',
                body: JSON.stringify({
                    workItemId: args.work_item_id,
                    artifactId: args.artifact_id,
                    status: 'completed',
                    verdict: args.verdict,
                    summary: [args.summary, args.evidence].filter(Boolean).join('\n\n') || undefined
                })
            });
            return buildToolResult(payload, `Swarm review recorded: ${args.verdict}`);
        } catch (error) {
            return buildToolError(`Failed to record swarm review for ${args.swarm_id}`, error);
        }
    });

    mcp.registerTool<any, any>('record_effect', {
        description: 'Record a fallback Swarm effect or native side effect when no stricter tool fits',
        title: 'Record Swarm Effect',
        inputSchema: swarmRecordEffectInputSchema
    }, async (args: {
        swarm_id: string
        work_item_id?: string
        kind: 'native' | 'progress' | 'file_change' | 'permission' | 'delegation' | 'other'
        summary?: string
        data?: unknown
        raw?: unknown
    }) => {
        try {
            const payload = await requestHubJson(`/api/swarms/${encodeURIComponent(args.swarm_id)}/effects`, {
                method: 'POST',
                body: JSON.stringify({
                    workItemId: args.work_item_id,
                    kind: args.kind,
                    summary: args.summary,
                    data: args.data,
                    raw: args.raw
                })
            });
            return buildToolResult(payload, `Swarm effect recorded: ${args.kind}`);
        } catch (error) {
            return buildToolError(`Failed to record swarm effect for ${args.swarm_id}`, error);
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
        toolNames: [
            'change_title',
            'report_create',
            'report_update',
            'report_get',
            'report_list',
            'report_add_asset',
            'report_create_share',
            'record_activity',
            'record_outcome',
            'record_artifact',
            'record_review',
            'record_effect'
        ],
        stop: () => {
            logger.debug('[hapiMCP] Stopping server');
            mcp.close();
            server.close();
        }
    }
}
