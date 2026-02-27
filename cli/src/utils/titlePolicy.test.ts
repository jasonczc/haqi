import { describe, expect, it } from 'vitest';
import { isLowSignalTitle, normalizeTitleCandidate } from './titlePolicy';

describe('titlePolicy', () => {
    describe('normalizeTitleCandidate', () => {
        it('trims whitespace and punctuation', () => {
            expect(normalizeTitleCandidate('  Commit changes...  ')).toBe('Commit changes');
        });

        it('collapses inner whitespace', () => {
            expect(normalizeTitleCandidate('Fix    auth   flow')).toBe('Fix auth flow');
        });
    });

    describe('isLowSignalTitle', () => {
        it('detects commit changes variants', () => {
            expect(isLowSignalTitle('Commit changes')).toBe(true);
            expect(isLowSignalTitle('git commit changes')).toBe(true);
            expect(isLowSignalTitle('提交更改')).toBe(true);
        });

        it('keeps specific titles', () => {
            expect(isLowSignalTitle('Fix OAuth callback race condition')).toBe(false);
        });
    });
});
