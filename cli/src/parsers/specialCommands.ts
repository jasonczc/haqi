/**
 * Parsers for special commands that require dedicated remote session handling
 */

export interface CompactCommandResult {
    isCompact: boolean;
    originalMessage: string;
}

export interface ClearCommandResult {
    isClear: boolean;
}

export type GoalCommandAction = 'get' | 'set' | 'clear';

export interface GoalCommandResult {
    isGoal: boolean;
    action?: GoalCommandAction;
    objective?: string;
    originalMessage: string;
}

export interface SpecialCommandResult {
    type: 'compact' | 'clear' | 'goal' | null;
    originalMessage?: string;
    goal?: {
        action: GoalCommandAction;
        objective?: string;
    };
}

/**
 * Parse /compact command
 * Matches messages starting with "/compact " or exactly "/compact"
 */
export function parseCompact(message: string): CompactCommandResult {
    const trimmed = message.trim();
    
    if (trimmed === '/compact') {
        return {
            isCompact: true,
            originalMessage: trimmed
        };
    }
    
    if (trimmed.startsWith('/compact ')) {
        return {
            isCompact: true,
            originalMessage: trimmed
        };
    }
    
    return {
        isCompact: false,
        originalMessage: message
    };
}

/**
 * Parse /clear command
 * Only matches exactly "/clear"
 */
export function parseClear(message: string): ClearCommandResult {
    const trimmed = message.trim();
    
    return {
        isClear: trimmed === '/clear'
    };
}

/**
 * Parse Codex /goal command.
 * Matches exactly "/goal", "/goal clear", or "/goal <objective>".
 */
export function parseGoal(message: string): GoalCommandResult {
    const trimmed = message.trim();

    if (trimmed === '/goal') {
        return {
            isGoal: true,
            action: 'get',
            originalMessage: trimmed
        };
    }

    if (!trimmed.startsWith('/goal ')) {
        return {
            isGoal: false,
            originalMessage: message
        };
    }

    const argument = trimmed.slice('/goal '.length).trim();
    if (argument === 'clear') {
        return {
            isGoal: true,
            action: 'clear',
            originalMessage: trimmed
        };
    }

    return {
        isGoal: true,
        action: 'set',
        objective: argument,
        originalMessage: trimmed
    };
}

/**
 * Unified parser for special commands
 * Returns the type of command and original message if applicable
 */
export function parseSpecialCommand(message: string): SpecialCommandResult {
    const compactResult = parseCompact(message);
    if (compactResult.isCompact) {
        return {
            type: 'compact',
            originalMessage: compactResult.originalMessage
        };
    }
    
    const clearResult = parseClear(message);
    if (clearResult.isClear) {
        return {
            type: 'clear'
        };
    }

    const goalResult = parseGoal(message);
    if (goalResult.isGoal && goalResult.action) {
        return {
            type: 'goal',
            originalMessage: goalResult.originalMessage,
            goal: {
                action: goalResult.action,
                ...(goalResult.objective ? { objective: goalResult.objective } : {})
            }
        };
    }
    
    return {
        type: null
    };
}
