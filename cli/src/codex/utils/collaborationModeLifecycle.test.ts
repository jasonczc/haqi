import { describe, expect, it } from 'vitest';

/**
 * These tests verify the collaboration mode lifecycle logic used across
 * runCodex.ts and session.ts. Since we cannot easily unit-test the full
 * runCodex function, we extract and test the key patterns in isolation.
 *
 * The critical bug: `getCurrentCollaborationMode()` used `??` to fall back
 * to a stale `currentCollaborationMode` variable. When the session wrapper
 * returned `undefined` (after auto-execute cleared the collaboration mode),
 * `undefined ?? 'plan'` incorrectly returned `'plan'`.
 *
 * The fix uses an explicit `if (sessionWrapperRef.current)` check so that
 * when the session exists, its value (including `undefined`) is authoritative.
 */

type CollaborationMode = 'plan' | 'code' | string | undefined;

/**
 * Minimal simulation of the CodexSession collaboration mode interface,
 * matching the real CodexSession.getCollaborationMode / setCollaborationMode.
 */
function createSessionSimulator(initialMode?: CollaborationMode) {
    let collaborationMode: CollaborationMode = initialMode;
    let metadataCollaborationMode: CollaborationMode = initialMode;

    return {
        getCollaborationMode: (): CollaborationMode => collaborationMode,
        setCollaborationMode: (
            mode: CollaborationMode,
            options?: { syncMetadata?: boolean }
        ): void => {
            collaborationMode = mode;
            if (options?.syncMetadata) {
                metadataCollaborationMode = mode;
            }
        },
        getMetadataCollaborationMode: (): CollaborationMode => metadataCollaborationMode,
    };
}

/**
 * Recreates the fixed getCurrentCollaborationMode pattern from runCodex.ts.
 * When the session exists, always use its value (even if undefined).
 * Only fall back to the startup value when no session exists yet.
 */
function createFixedGetCurrentCollaborationMode(
    sessionRef: { current: ReturnType<typeof createSessionSimulator> | null },
    startupCollaborationMode: CollaborationMode
): () => CollaborationMode {
    return () => {
        if (sessionRef.current) {
            return sessionRef.current.getCollaborationMode();
        }
        return startupCollaborationMode;
    };
}

/**
 * Recreates the BUGGY getCurrentCollaborationMode pattern that used `??`.
 * This is kept to demonstrate why the fix was necessary.
 */
function createBuggyGetCurrentCollaborationMode(
    sessionRef: { current: ReturnType<typeof createSessionSimulator> | null },
    startupCollaborationMode: CollaborationMode
): () => CollaborationMode {
    return () => {
        return sessionRef.current?.getCollaborationMode() ?? startupCollaborationMode;
    };
}

describe('collaboration mode lifecycle', () => {
    describe('getCurrentCollaborationMode pattern', () => {
        it('returns session value when session exists and has plan mode', () => {
            const session = createSessionSimulator('plan');
            const sessionRef = { current: session };
            const getCurrentCollaborationMode = createFixedGetCurrentCollaborationMode(sessionRef, undefined);

            expect(getCurrentCollaborationMode()).toBe('plan');
        });

        it('returns undefined when session exists but collaboration mode was cleared', () => {
            // This is THE critical test for the bug fix.
            // After auto-execute clears the collaboration mode, the session
            // returns undefined. The stale startup value is still 'plan'.
            // The fixed version should return undefined, NOT 'plan'.
            const session = createSessionSimulator('plan');
            const sessionRef = { current: session };
            const startupCollaborationMode: CollaborationMode = 'plan';
            const getCurrentCollaborationMode = createFixedGetCurrentCollaborationMode(
                sessionRef,
                startupCollaborationMode
            );

            // Initially returns plan
            expect(getCurrentCollaborationMode()).toBe('plan');

            // Simulate auto-execute clearing the collaboration mode
            session.setCollaborationMode(undefined, { syncMetadata: true });

            // Fixed: should return undefined, NOT 'plan'
            expect(getCurrentCollaborationMode()).toBeUndefined();
        });

        it('falls back to startup value when session does not exist yet', () => {
            const sessionRef: { current: ReturnType<typeof createSessionSimulator> | null } = { current: null };
            const getCurrentCollaborationMode = createFixedGetCurrentCollaborationMode(sessionRef, 'plan');

            // No session yet, should use the startup value
            expect(getCurrentCollaborationMode()).toBe('plan');
        });

        it('returns undefined when no session and no startup collaboration mode', () => {
            const sessionRef: { current: ReturnType<typeof createSessionSimulator> | null } = { current: null };
            const getCurrentCollaborationMode = createFixedGetCurrentCollaborationMode(sessionRef, undefined);

            expect(getCurrentCollaborationMode()).toBeUndefined();
        });
    });

    describe('setCollaborationMode', () => {
        it('clears collaboration mode and syncs metadata', () => {
            const session = createSessionSimulator('plan');

            expect(session.getCollaborationMode()).toBe('plan');
            expect(session.getMetadataCollaborationMode()).toBe('plan');

            session.setCollaborationMode(undefined, { syncMetadata: true });

            expect(session.getCollaborationMode()).toBeUndefined();
            expect(session.getMetadataCollaborationMode()).toBeUndefined();
        });

        it('sets plan mode', () => {
            const session = createSessionSimulator();

            expect(session.getCollaborationMode()).toBeUndefined();

            session.setCollaborationMode('plan');

            expect(session.getCollaborationMode()).toBe('plan');
        });
    });

    describe('auto-execute plan flow', () => {
        it('full lifecycle: plan mode -> approve -> auto-execute -> default mode', () => {
            // 1. Start with collaborationMode = 'plan' from metadata
            const startupCollaborationMode: CollaborationMode = 'plan';
            const sessionRef: { current: ReturnType<typeof createSessionSimulator> | null } = { current: null };
            const getCurrentCollaborationMode = createFixedGetCurrentCollaborationMode(
                sessionRef,
                startupCollaborationMode
            );

            // 2. Before session is created, getCurrentCollaborationMode returns 'plan'
            expect(getCurrentCollaborationMode()).toBe('plan');

            // 3. Session is created and initialized with the startup collaboration mode
            const session = createSessionSimulator('plan');
            sessionRef.current = session;
            expect(getCurrentCollaborationMode()).toBe('plan');

            // 4. Auto-execute clears the collaboration mode
            session.setCollaborationMode(undefined, { syncMetadata: true });

            // 5. getCurrentCollaborationMode should return undefined (NOT 'plan')
            expect(getCurrentCollaborationMode()).toBeUndefined();

            // 6. Next message built with this mode should NOT have collaborationMode
            const enhancedMode = {
                permissionMode: 'default' as const,
                collaborationMode: getCurrentCollaborationMode(),
            };
            expect(enhancedMode.collaborationMode).toBeUndefined();
        });

        it('buggy version would return stale plan mode after clearing', () => {
            const startupCollaborationMode: CollaborationMode = 'plan';
            const session = createSessionSimulator('plan');
            const sessionRef = { current: session };

            const buggyGetMode = createBuggyGetCurrentCollaborationMode(sessionRef, startupCollaborationMode);
            const fixedGetMode = createFixedGetCurrentCollaborationMode(sessionRef, startupCollaborationMode);

            // Both return 'plan' initially
            expect(buggyGetMode()).toBe('plan');
            expect(fixedGetMode()).toBe('plan');

            // After clearing, session.getCollaborationMode() returns undefined
            session.setCollaborationMode(undefined);

            // Buggy: undefined ?? 'plan' = 'plan' (WRONG!)
            expect(buggyGetMode()).toBe('plan');

            // Fixed: session exists, returns undefined directly (CORRECT!)
            expect(fixedGetMode()).toBeUndefined();
        });
    });
});
