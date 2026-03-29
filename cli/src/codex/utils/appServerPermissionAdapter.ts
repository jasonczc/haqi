import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { CodexPermissionHandler } from './permissionHandler';
import type { CodexAppServerClient } from '../codexAppServerClient';
import {
    buildPermissionQuestionAnswers,
    extractPermissionQuestionTarget
} from '@/claude/utils/questionToolPrompt';

type PermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

type PermissionResult = {
    decision: PermissionDecision;
    reason?: string;
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>;
};

type ElicitResponseValue = string | number | boolean | string[];
type ElicitRequestedSchema = {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapDecision(decision: PermissionDecision): { decision: string } {
    switch (decision) {
        case 'approved':
            return { decision: 'accept' };
        case 'approved_for_session':
            return { decision: 'acceptForSession' };
        case 'denied':
            return { decision: 'decline' };
        case 'abort':
            return { decision: 'cancel' };
    }
}

function extractRequestedSchema(value: unknown): ElicitRequestedSchema | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const properties = asRecord(record.properties) ?? undefined;
    const required = Array.isArray(record.required)
        ? record.required.filter((item): item is string => typeof item === 'string')
        : undefined;
    const type = asString(record.type);
    return {
        ...(type ? { type } : {}),
        ...(properties ? { properties } : {}),
        ...(required ? { required } : {})
    };
}

function buildElicitationResult(
    decision: PermissionDecision,
    requestedSchema: ElicitRequestedSchema | null,
    reason?: string
): {
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, ElicitResponseValue>;
    decision?: string;
    reason?: string;
} {
    const action: 'accept' | 'decline' | 'cancel' =
        decision === 'approved' || decision === 'approved_for_session'
            ? 'accept'
            : decision === 'abort'
                ? 'cancel'
                : 'decline';

    if (!requestedSchema?.properties || Object.keys(requestedSchema.properties).length === 0) {
        return reason ? { action, decision, reason } : { action, decision };
    }

    if (action !== 'accept') {
        return reason ? { action, decision, reason } : { action, decision };
    }

    const content: Record<string, ElicitResponseValue> = {};
    const properties = requestedSchema.properties;
    const approved = decision === 'approved' || decision === 'approved_for_session';

    if (Object.prototype.hasOwnProperty.call(properties, 'decision')) {
        content.decision = decision;
    }
    if (Object.prototype.hasOwnProperty.call(properties, 'approved')) {
        content.approved = approved;
    }
    if (Object.prototype.hasOwnProperty.call(properties, 'allow')) {
        content.allow = approved;
    }
    if (reason && Object.prototype.hasOwnProperty.call(properties, 'reason')) {
        content.reason = reason;
    }

    if (Object.keys(content).length === 0) {
        const [fallbackKey] = Object.keys(properties);
        if (fallbackKey) {
            content[fallbackKey] = decision;
        }
    }

    return reason ? { action, content, decision, reason } : { action, content, decision };
}

function extractMcpApprovalTarget(params: Record<string, unknown>): {
    toolName: string;
    permissionInput: { message: string };
} | null {
    const message = asString(params.message);
    if (!message) {
        return null;
    }

    const match = message.match(/^Allow the ([A-Za-z0-9._-]+) MCP server to run tool "([^"]+)"\?$/i);
    const server = match?.[1]?.trim();
    const tool = match?.[2]?.trim();
    if (!server || !tool) {
        return null;
    }

    return {
        toolName: `mcp__${server}__${tool}`,
        permissionInput: { message }
    };
}

export function registerAppServerPermissionHandlers(args: {
    client: CodexAppServerClient;
    permissionHandler: CodexPermissionHandler;
}): void {
    const { client, permissionHandler } = args;

    client.registerRequestHandler('item/commandExecution/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const command = record.command;
        const cwd = asString(record.cwd);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexBash',
            {
                message: reason,
                command,
                cwd
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/fileChange/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const grantRoot = asString(record.grantRoot);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexPatch',
            {
                message: reason,
                grantRoot
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/tool/requestUserInput', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const rawInput = asRecord(record.input);
        const input = rawInput ?? record;
        const permissionQuestionTarget = extractPermissionQuestionTarget(input);
        const toolName = permissionQuestionTarget?.toolName ?? 'request_user_input';
        const permissionInput = permissionQuestionTarget
            ? {
                message: `Allow the ${permissionQuestionTarget.input.server} MCP server to run tool "${permissionQuestionTarget.input.tool}"?`
            }
            : input;

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            toolName,
            permissionInput
        ) as PermissionResult;

        if (result.decision !== 'approved' && result.decision !== 'approved_for_session') {
            logger.debug('[CodexAppServer] User-input request declined', { toolCallId, decision: result.decision });
            return mapDecision(result.decision);
        }

        const answers = result.answers
            ?? (permissionQuestionTarget
                ? buildPermissionQuestionAnswers('request_user_input', input, true)
                : undefined);

        if (!answers || Object.keys(answers).length === 0) {
            logger.debug('[CodexAppServer] User-input request approved without answers; cancelling request', { toolCallId });
            return { decision: 'cancel' };
        }

        return {
            decision: 'accept',
            answers
        };
    });

    client.registerRequestHandler('mcpServer/elicitation/request', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.turnId) ?? asString(record.threadId) ?? randomUUID();
        const requestedSchema = extractRequestedSchema(record.requestedSchema);
        const approvalTarget = extractMcpApprovalTarget(record);
        const toolName = approvalTarget?.toolName ?? 'CodexPermission';
        const permissionInput = approvalTarget?.permissionInput ?? record;

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            toolName,
            permissionInput
        ) as PermissionResult;

        return buildElicitationResult(result.decision, requestedSchema, result.reason);
    });
}
