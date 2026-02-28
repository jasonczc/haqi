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
    - Publish a report via MCP tools only for:
      - complex research/investigation tasks (multi-step findings or non-trivial analysis), or
      - E2E/browser/UI testing tasks where image evidence (screenshots) is useful.
    - For routine code edits, simple Q&A, or lightweight checks, do NOT create a report by default.
    - Preferred flow:
      1) functions.haqi__report_create (set create_share=true),
      2) functions.haqi__report_add_asset (attach screenshots/log images when available),
      3) functions.haqi__report_update (final markdown polish).
    - If no public link exists yet, call functions.haqi__report_create_share.
    - If a report is created, include the public share URL in your final answer.
    - If the user explicitly asks to skip report creation, follow that request.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = TITLE_INSTRUCTION;

export function buildCodexSystemPrompt(startDir: string): string {
    return buildPromptWithHaqiAgentInstructions(codexSystemPrompt, startDir);
}
