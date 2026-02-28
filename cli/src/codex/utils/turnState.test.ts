import { describe, expect, it } from 'vitest';
import {
    LIVE_ACTIVITY_EVENT_TYPES,
    TERMINAL_TURN_EVENT_TYPES,
    isStaleTerminalTurnEvent
} from './turnState';

describe('turnState', () => {
    it('recognizes terminal turn event types', () => {
        expect(TERMINAL_TURN_EVENT_TYPES.has('task_complete')).toBe(true);
        expect(TERMINAL_TURN_EVENT_TYPES.has('turn_aborted')).toBe(true);
        expect(TERMINAL_TURN_EVENT_TYPES.has('task_failed')).toBe(true);
        expect(TERMINAL_TURN_EVENT_TYPES.has('agent_message')).toBe(false);
    });

    it('recognizes live activity event types', () => {
        expect(LIVE_ACTIVITY_EVENT_TYPES.has('agent_message')).toBe(true);
        expect(LIVE_ACTIVITY_EVENT_TYPES.has('tool_call_progress')).toBe(true);
        expect(LIVE_ACTIVITY_EVENT_TYPES.has('task_complete')).toBe(false);
    });

    it('detects stale terminal events only in app-server mode with different turn ids', () => {
        expect(isStaleTerminalTurnEvent({
            useAppServer: true,
            eventType: 'task_complete',
            eventTurnId: 'turn-1',
            currentTurnId: 'turn-2'
        })).toBe(true);
    });

    it('ignores non-stale and non-terminal events', () => {
        expect(isStaleTerminalTurnEvent({
            useAppServer: true,
            eventType: 'task_complete',
            eventTurnId: 'turn-1',
            currentTurnId: 'turn-1'
        })).toBe(false);
        expect(isStaleTerminalTurnEvent({
            useAppServer: true,
            eventType: 'agent_message',
            eventTurnId: 'turn-1',
            currentTurnId: 'turn-2'
        })).toBe(false);
        expect(isStaleTerminalTurnEvent({
            useAppServer: false,
            eventType: 'task_complete',
            eventTurnId: 'turn-1',
            currentTurnId: 'turn-2'
        })).toBe(false);
        expect(isStaleTerminalTurnEvent({
            useAppServer: true,
            eventType: 'task_complete',
            eventTurnId: null,
            currentTurnId: 'turn-2'
        })).toBe(false);
    });
});
