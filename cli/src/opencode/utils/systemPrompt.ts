/**
 * OpenCode-specific system prompt for change_title tool.
 *
 * OpenCode exposes MCP tools with the naming pattern: <server-name>_<tool-name>
 * The haqi MCP server exposes `change_title`, so it's called as `haqi_change_title`.
 */

import { trimIdent } from '@/utils/trimIdent';
import { buildPromptWithHaqiAgentInstructions } from '@/agent/utils/haqiAgentInstructions';

/**
 * Title instruction for OpenCode to call the haqi MCP tool.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat - you must call the tool "haqi_change_title" to set a chat title.
    Keep the title specific and stable across follow-up steps.
    Do NOT downgrade to generic action-only titles like "Commit changes".
    If the main topic changes significantly, call the tool again to update the title.
    This title is needed to easily find the chat in the future. Help human.
`);

/**
 * The system prompt to inject for OpenCode sessions.
 */
export const opencodeSystemPrompt = TITLE_INSTRUCTION;

export function buildOpencodeSystemPrompt(startDir: string): string {
    return buildPromptWithHaqiAgentInstructions(opencodeSystemPrompt, startDir);
}
