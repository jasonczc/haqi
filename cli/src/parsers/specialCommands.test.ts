import { describe, it, expect } from 'vitest';
import { parseCompact, parseClear, parseGoal, parseSpecialCommand } from './specialCommands';

describe('parseCompact', () => {
    it('should parse /compact command with argument', () => {
        const result = parseCompact('/compact optimize the code');
        expect(result.isCompact).toBe(true);
        expect(result.originalMessage).toBe('/compact optimize the code');
    });

    it('should parse /compact command without argument', () => {
        const result = parseCompact('/compact');
        expect(result.isCompact).toBe(true);
        expect(result.originalMessage).toBe('/compact');
    });

    it('should not parse regular messages', () => {
        const result = parseCompact('hello world');
        expect(result.isCompact).toBe(false);
        expect(result.originalMessage).toBe('hello world');
    });

    it('should not parse messages that contain compact but do not start with /compact', () => {
        const result = parseCompact('please /compact this');
        expect(result.isCompact).toBe(false);
        expect(result.originalMessage).toBe('please /compact this');
    });
});

describe('parseClear', () => {
    it('should parse /clear command exactly', () => {
        const result = parseClear('/clear');
        expect(result.isClear).toBe(true);
    });

    it('should parse /clear command with whitespace', () => {
        const result = parseClear('  /clear  ');
        expect(result.isClear).toBe(true);
    });

    it('should not parse /clear with arguments', () => {
        const result = parseClear('/clear something');
        expect(result.isClear).toBe(false);
    });

    it('should not parse regular messages', () => {
        const result = parseClear('hello world');
        expect(result.isClear).toBe(false);
    });
});

describe('parseGoal', () => {
    it('should parse /goal without arguments as get', () => {
        const result = parseGoal('/goal');
        expect(result.isGoal).toBe(true);
        expect(result.action).toBe('get');
        expect(result.originalMessage).toBe('/goal');
    });

    it('should parse /goal clear', () => {
        const result = parseGoal('  /goal clear  ');
        expect(result.isGoal).toBe(true);
        expect(result.action).toBe('clear');
        expect(result.originalMessage).toBe('/goal clear');
    });

    it('should parse /goal with objective', () => {
        const result = parseGoal('/goal improve benchmark coverage');
        expect(result.isGoal).toBe(true);
        expect(result.action).toBe('set');
        expect(result.objective).toBe('improve benchmark coverage');
        expect(result.originalMessage).toBe('/goal improve benchmark coverage');
    });

    it('should not parse partial /goal matches', () => {
        expect(parseGoal('/goals improve coverage').isGoal).toBe(false);
        expect(parseGoal('please /goal improve coverage').isGoal).toBe(false);
    });
});

describe('parseSpecialCommand', () => {
    it('should detect compact command', () => {
        const result = parseSpecialCommand('/compact optimize');
        expect(result.type).toBe('compact');
        expect(result.originalMessage).toBe('/compact optimize');
    });

    it('should detect clear command', () => {
        const result = parseSpecialCommand('/clear');
        expect(result.type).toBe('clear');
        expect(result.originalMessage).toBeUndefined();
    });

    it('should detect goal command', () => {
        const result = parseSpecialCommand('/goal improve benchmark coverage');
        expect(result.type).toBe('goal');
        expect(result.originalMessage).toBe('/goal improve benchmark coverage');
        expect(result.goal).toEqual({
            action: 'set',
            objective: 'improve benchmark coverage'
        });
    });

    it('should return null for regular messages', () => {
        const result = parseSpecialCommand('hello world');
        expect(result.type).toBeNull();
        expect(result.originalMessage).toBeUndefined();
    });

    it('should handle edge cases correctly', () => {
        // Test with extra whitespace
        expect(parseSpecialCommand('  /compact test  ').type).toBe('compact');
        expect(parseSpecialCommand('  /clear  ').type).toBe('clear');
        
        // Test partial matches should not trigger
        expect(parseSpecialCommand('some /compact text').type).toBeNull();
        expect(parseSpecialCommand('/compactor').type).toBeNull();
        expect(parseSpecialCommand('/clearing').type).toBeNull();
        expect(parseSpecialCommand('/goals').type).toBeNull();
    });
});
