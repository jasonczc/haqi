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
}
