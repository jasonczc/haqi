import { describe, expect, it } from 'vitest';
import { isCodexStatusCommand } from './codexStatusCommand';

describe('isCodexStatusCommand', () => {
    it('matches supported status commands', () => {
        expect(isCodexStatusCommand('/status')).toBe(true);
        expect(isCodexStatusCommand(' /status ')).toBe(true);
        expect(isCodexStatusCommand('/codex-status')).toBe(true);
    });

    it('does not match normal chat messages', () => {
        expect(isCodexStatusCommand('status')).toBe(false);
        expect(isCodexStatusCommand('/status now')).toBe(false);
        expect(isCodexStatusCommand('please /status')).toBe(false);
    });
});
