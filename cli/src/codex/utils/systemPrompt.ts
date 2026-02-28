/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the haqi__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';
import { buildPromptWithHaqiAgentInstructions } from '@/agent/utils/haqiAgentInstructions';

/**
 * Title instruction for Codex to call the haqi MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.haqi__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    Based on this message, call functions.haqi__change_title to set a useful chat session title for the main task.
    Keep titles specific and stable across follow-up steps.
    Do NOT downgrade to generic action-only titles like "Commit changes".
    Only change the title when the main topic changes significantly.

    Report rule:
    - After completing testing, debugging verification, or research/investigation tasks, publish a report via MCP tools before your final answer.
    - Preferred flow:
      1) functions.haqi__report_create (set create_share=true),
      2) functions.haqi__report_add_asset (attach screenshots/log images when available),
      3) functions.haqi__report_update (final markdown polish).
    - If no public link exists yet, call functions.haqi__report_create_share.
    - In your final answer, include the public share URL.
    - Skip only if user explicitly asks not to create a report.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = TITLE_INSTRUCTION;

export function buildCodexSystemPrompt(startDir: string): string {
    return buildPromptWithHaqiAgentInstructions(codexSystemPrompt, startDir);
}
