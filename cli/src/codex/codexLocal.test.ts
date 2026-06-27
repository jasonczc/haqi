import { describe, it, expect } from 'vitest';
import {
    buildCodexLocalArgs,
    buildReasoningEffortConfigArgs,
    filterResumeSubcommand
} from './codexLocal';

describe('filterResumeSubcommand', () => {
    it('returns empty array unchanged', () => {
        expect(filterResumeSubcommand([])).toEqual([]);
    });

    it('passes through args when first arg is not resume', () => {
        expect(filterResumeSubcommand(['--model', 'gpt-4'])).toEqual(['--model', 'gpt-4']);
        expect(filterResumeSubcommand(['--sandbox', 'read-only'])).toEqual(['--sandbox', 'read-only']);
    });

    it('filters resume subcommand with session ID', () => {
        expect(filterResumeSubcommand(['resume', 'abc-123'])).toEqual([]);
        expect(filterResumeSubcommand(['resume', 'abc-123', '--model', 'gpt-4']))
            .toEqual(['--model', 'gpt-4']);
    });

    it('filters resume subcommand without session ID', () => {
        expect(filterResumeSubcommand(['resume'])).toEqual([]);
        expect(filterResumeSubcommand(['resume', '--model', 'gpt-4']))
            .toEqual(['--model', 'gpt-4']);
    });

    it('does not filter resume when it appears as flag value', () => {
        // --name resume should pass through (resume is value, not subcommand)
        expect(filterResumeSubcommand(['--name', 'resume'])).toEqual(['--name', 'resume']);
    });

    it('does not filter resume in middle of args', () => {
        // If resume appears after flags, it's not the subcommand position
        expect(filterResumeSubcommand(['--model', 'gpt-4', 'resume', '123']))
            .toEqual(['--model', 'gpt-4', 'resume', '123']);
    });
});

describe('buildReasoningEffortConfigArgs', () => {
    it('maps Codex think effort to the supported config override', () => {
        expect(buildReasoningEffortConfigArgs('high')).toEqual([
            '-c',
            'model_reasoning_effort="high"'
        ]);
    });

    it('omits auto effort so Codex uses its default', () => {
        expect(buildReasoningEffortConfigArgs('auto')).toEqual([]);
        expect(buildReasoningEffortConfigArgs(undefined)).toEqual([]);
    });
});

describe('buildCodexLocalArgs', () => {
    it('uses model_reasoning_effort config instead of the unsupported --effort flag', () => {
        const args = buildCodexLocalArgs({
            sessionId: null,
            path: '/tmp/project',
            effort: 'high'
        });

        expect(args).toContain('-c');
        expect(args).toContain('model_reasoning_effort="high"');
        expect(args).not.toContain('--effort');
        expect(args).not.toContain('--think-level');
    });
});
