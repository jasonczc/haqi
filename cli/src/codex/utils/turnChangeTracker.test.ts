import { describe, expect, it } from 'vitest';
import { TurnChangeTracker } from './turnChangeTracker';

describe('TurnChangeTracker', () => {
    it('builds tool input with patch + per-file diff', () => {
        const tracker = new TurnChangeTracker();

        tracker.trackPatchBegin('patch-1', {
            'src/a.ts': { kind: 'update' },
            'src/b.ts': { kind: 'create' }
        });
        tracker.trackPatchEnd('patch-1', true);

        tracker.trackTurnDiff([
            'diff --git a/src/a.ts b/src/a.ts',
            'index 123..456 100644',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,2 +1,3 @@',
            ' line1',
            '-line2',
            '+line2-updated',
            '+line3'
        ].join('\n'));

        const input = tracker.buildToolInput('completed');

        expect(input.status).toBe('completed');
        expect(input.files).toHaveLength(2);
        expect(input.files[0]?.path).toBe('src/a.ts');
        expect(input.files[0]?.additions).toBe(2);
        expect(input.files[0]?.deletions).toBe(1);
        expect(typeof input.files[0]?.unified_diff).toBe('string');
        expect(input.files[1]).toEqual({
            path: 'src/b.ts',
            additions: 0,
            deletions: 0
        });
        expect(input.patch_apply).toEqual({ total: 1, success: 1, failed: 0 });
        expect(input.diff_stats).toEqual({ additions: 2, deletions: 1, available: true });
    });

    it('deduplicates duplicate patch events by call id', () => {
        const tracker = new TurnChangeTracker();

        tracker.trackPatchBegin('patch-dup', { 'src/a.ts': { kind: 'update' } });
        tracker.trackPatchBegin('patch-dup', { 'src/a.ts': { kind: 'update' } });
        tracker.trackPatchEnd('patch-dup', true);
        tracker.trackPatchEnd('patch-dup', true);

        const input = tracker.buildToolInput('completed');
        expect(input.patch_apply).toEqual({ total: 1, success: 1, failed: 0 });
    });

    it('deduplicates nested-repo prefixed patch path with diff path', () => {
        const tracker = new TurnChangeTracker();

        tracker.trackPatchBegin('patch-2', {
            'kokone-brain-v2/kokone_brain/brain/graphs/image_generation.py': { kind: 'update' }
        });
        tracker.trackPatchEnd('patch-2', true);

        tracker.trackTurnDiff([
            'diff --git a/kokone_brain/brain/graphs/image_generation.py b/kokone_brain/brain/graphs/image_generation.py',
            'index 111..222 100644',
            '--- a/kokone_brain/brain/graphs/image_generation.py',
            '+++ b/kokone_brain/brain/graphs/image_generation.py',
            '@@ -1,3 +1,3 @@',
            ' a',
            '-b',
            '+c'
        ].join('\n'));

        const input = tracker.buildToolInput('completed');

        expect(input.files).toHaveLength(1);
        expect(input.files[0]?.path).toBe('kokone_brain/brain/graphs/image_generation.py');
        expect(input.files[0]?.additions).toBe(1);
        expect(input.files[0]?.deletions).toBe(1);
        expect(typeof input.files[0]?.unified_diff).toBe('string');
    });

    it('returns empty tool input when no events were tracked', () => {
        const tracker = new TurnChangeTracker();
        const input = tracker.buildToolInput('aborted');

        expect(input.status).toBe('aborted');
        expect(input.files).toEqual([]);
        expect(input.patch_apply).toEqual({ total: 0, success: 0, failed: 0 });
        expect(input.diff_stats).toEqual({ additions: 0, deletions: 0, available: false });
    });
});
