import { trimIdent } from '@/utils/trimIdent';
import { buildPromptWithHaqiAgentInstructions, isPureContextModeEnabled } from '@/agent/utils/haqiAgentInstructions';

export const geminiSystemPrompt = trimIdent(`
    Keep durable memory in MEMORY.md.
    Update it when you discover stable user preferences, key decisions, known pitfalls, and persistent project facts.
`);

export function buildGeminiSystemPrompt(startDir: string): string {
    if (isPureContextModeEnabled()) {
        return '';
    }
    return buildPromptWithHaqiAgentInstructions(geminiSystemPrompt, startDir);
}
