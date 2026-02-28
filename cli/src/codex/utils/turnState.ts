export const TERMINAL_TURN_EVENT_TYPES = new Set(['task_complete', 'turn_aborted', 'task_failed']);

export const LIVE_ACTIVITY_EVENT_TYPES = new Set([
    'agent_message',
    'agent_reasoning',
    'agent_reasoning_delta',
    'agent_reasoning_section_break',
    'exec_command_begin',
    'exec_command_end',
    'exec_command_terminal_input',
    'exec_approval_request',
    'tool_call_begin',
    'tool_call_progress',
    'tool_call_end',
    'patch_apply_begin',
    'patch_apply_end',
    'turn_diff',
    'turn_plan_updated',
    'plan_delta',
    'model_rerouted',
    'context_compacted'
]);

export const LIVE_ACTIVITY_GRACE_MS = 1500;

export function isStaleTerminalTurnEvent(opts: {
    useAppServer: boolean;
    eventType: string;
    eventTurnId: string | null;
    currentTurnId: string | null;
}): boolean {
    if (!opts.useAppServer) {
        return false;
    }
    if (!TERMINAL_TURN_EVENT_TYPES.has(opts.eventType)) {
        return false;
    }
    if (!opts.eventTurnId || !opts.currentTurnId) {
        return false;
    }
    return opts.eventTurnId !== opts.currentTurnId;
}
