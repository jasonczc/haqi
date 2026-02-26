import { describe, expect, it } from 'vitest';
import { parseTodoWritePlanUpdate } from './todoPlan';

describe('parseTodoWritePlanUpdate', () => {
    it('parses todos into plan entries and normalizes status', () => {
        const result = parseTodoWritePlanUpdate({
            explanation: 'Focus on critical fixes',
            todos: [
                { content: 'Write failing test', status: 'pending' },
                { content: 'Fix parser', status: 'in_progress' },
                { content: 'Run test suite', status: 'done' }
            ]
        });

        expect(result).toEqual({
            explanation: 'Focus on critical fixes',
            plan: [
                { step: 'Write failing test', status: 'pending' },
                { step: 'Fix parser', status: 'in_progress' },
                { step: 'Run test suite', status: 'completed' }
            ]
        });
    });

    it('supports step field and filters invalid entries', () => {
        const result = parseTodoWritePlanUpdate({
            todos: [
                { step: 'Implement endpoint', status: 'running' },
                { step: '   ', status: 'pending' },
                null,
                { content: 123 }
            ]
        });

        expect(result).toEqual({
            plan: [
                { step: 'Implement endpoint', status: 'in_progress' }
            ]
        });
    });

    it('returns null when payload is invalid or has no actionable todos', () => {
        expect(parseTodoWritePlanUpdate(null)).toBeNull();
        expect(parseTodoWritePlanUpdate({})).toBeNull();
        expect(parseTodoWritePlanUpdate({ todos: [] })).toBeNull();
        expect(parseTodoWritePlanUpdate({ todos: [{ content: '' }] })).toBeNull();
    });
});
