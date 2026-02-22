import { describe, expect, it } from 'vitest';
import { AppServerEventConverter } from './appServerEventConverter';

describe('AppServerEventConverter', () => {
    it('maps thread/started', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/started', { thread: { id: 'thread-1' } });

        expect(events).toEqual([{ type: 'thread_started', thread_id: 'thread-1' }]);
    });

    it('maps thread/resumed', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/resumed', { thread: { id: 'thread-2' } });

        expect(events).toEqual([{ type: 'thread_started', thread_id: 'thread-2' }]);
    });

    it('maps turn/started and completed statuses', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('turn/started', { turn: { id: 'turn-1' } });
        expect(started).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);

        const completed = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Completed' });
        expect(completed).toEqual([{ type: 'task_complete', turn_id: 'turn-1' }]);

        const interrupted = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Interrupted' });
        expect(interrupted).toEqual([{ type: 'turn_aborted', turn_id: 'turn-1' }]);

        const failed = converter.handleNotification('turn/completed', { turn: { id: 'turn-1' }, status: 'Failed', message: 'boom' });
        expect(failed).toEqual([{ type: 'task_failed', turn_id: 'turn-1', error: 'boom' }]);
    });

    it('maps turn/plan/updated', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('turn/plan/updated', {
            explanation: 'Plan update',
            plan: [{ step: 'A', status: 'inProgress' }]
        });

        expect(events).toEqual([{
            type: 'turn_plan_updated',
            explanation: 'Plan update',
            plan: [{ step: 'A', status: 'inProgress' }]
        }]);
    });

    it('accumulates agent message deltas', () => {
        const converter = new AppServerEventConverter();

        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: 'Hello' });
        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: ' world' });
        const completed = converter.handleNotification('item/completed', {
            item: { id: 'msg-1', type: 'agentMessage' }
        });

        expect(completed).toEqual([{ type: 'agent_message', message: 'Hello world' }]);
    });

    it('maps reasoning summary deltas and final reasoning item', () => {
        const converter = new AppServerEventConverter();

        const deltas = converter.handleNotification('item/reasoning/summaryTextDelta', { itemId: 'r1', delta: 'step' });
        expect(deltas).toEqual([{ type: 'agent_reasoning_delta', item_id: 'r1', delta: 'step' }]);

        const sectionBreak = converter.handleNotification('item/reasoning/summaryPartAdded', { itemId: 'r1', summaryIndex: 1 });
        expect(sectionBreak).toEqual([{ type: 'agent_reasoning_section_break', item_id: 'r1', summary_index: 1 }]);

        const completed = converter.handleNotification('item/completed', {
            item: { id: 'r1', type: 'reasoning' }
        });

        expect(completed).toEqual([{ type: 'agent_reasoning', text: 'step' }]);
    });

    it('maps command execution items, terminal interaction and output deltas', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            item: { id: 'cmd-1', type: 'commandExecution', command: 'ls' }
        });
        expect(started).toEqual([{
            type: 'exec_command_begin',
            call_id: 'cmd-1',
            command: 'ls'
        }]);

        converter.handleNotification('item/commandExecution/terminalInteraction', { itemId: 'cmd-1', stdin: 'y\n' });
        converter.handleNotification('item/commandExecution/outputDelta', { itemId: 'cmd-1', delta: 'ok' });
        const completed = converter.handleNotification('item/completed', {
            item: { id: 'cmd-1', type: 'commandExecution', exitCode: 0, status: 'completed' }
        });

        expect(completed).toEqual([{
            type: 'exec_command_end',
            call_id: 'cmd-1',
            command: 'ls',
            output: 'ok',
            exit_code: 0,
            status: 'completed',
            terminal_input: ['y\n']
        }]);
    });

    it('maps file change output deltas', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            item: {
                id: 'patch-1',
                type: 'fileChange',
                changes: [{ path: 'a.ts', kind: 'update' }]
            }
        });

        expect(started).toEqual([{
            type: 'patch_apply_begin',
            call_id: 'patch-1',
            changes: {
                'a.ts': { path: 'a.ts', kind: 'update' }
            }
        }]);

        converter.handleNotification('item/fileChange/outputDelta', { itemId: 'patch-1', delta: 'patched' });

        const completed = converter.handleNotification('item/completed', {
            item: { id: 'patch-1', type: 'fileChange', status: 'completed' }
        });

        expect(completed).toEqual([{
            type: 'patch_apply_end',
            call_id: 'patch-1',
            changes: {
                'a.ts': { path: 'a.ts', kind: 'update' }
            },
            stdout: 'patched',
            status: 'completed',
            success: true
        }]);
    });

    it('maps plan item deltas to generic tool calls', () => {
        const converter = new AppServerEventConverter();

        const delta = converter.handleNotification('item/plan/delta', { itemId: 'plan-1', delta: 'line1' });
        expect(delta).toEqual([{ type: 'plan_delta', item_id: 'plan-1', delta: 'line1' }]);

        const started = converter.handleNotification('item/started', {
            item: { id: 'plan-1', type: 'plan' }
        });

        expect(started).toEqual([{
            type: 'tool_call_begin',
            call_id: 'plan-1',
            name: 'ExitPlanMode',
            input: { text: 'line1' }
        }]);

        const completed = converter.handleNotification('item/completed', {
            item: { id: 'plan-1', type: 'plan' }
        });

        expect(completed).toEqual([{
            type: 'tool_call_end',
            call_id: 'plan-1',
            name: 'ExitPlanMode',
            output: { text: 'line1' }
        }]);
    });

    it('maps web search item to generic tool call', () => {
        const converter = new AppServerEventConverter();
        const action = { type: 'search', query: 'hapi', queries: ['hapi'] };

        const started = converter.handleNotification('item/started', {
            item: { id: 'ws-1', type: 'webSearch', query: 'hapi', action }
        });

        expect(started).toEqual([{
            type: 'tool_call_begin',
            call_id: 'ws-1',
            name: 'WebSearch',
            input: { query: 'hapi', action }
        }]);

        const completed = converter.handleNotification('item/completed', {
            item: { id: 'ws-1', type: 'webSearch', query: 'hapi', action, status: 'completed' }
        });

        expect(completed).toEqual([{
            type: 'tool_call_end',
            call_id: 'ws-1',
            name: 'WebSearch',
            output: { query: 'hapi', action, status: 'completed' }
        }]);
    });

    it('extracts web search query from action payload and defaults completion status', () => {
        const converter = new AppServerEventConverter();
        const action = { type: 'openPage', url: 'https://docs.cursor.com/agent/planning' };

        const started = converter.handleNotification('item/started', {
            item: { id: 'ws-2', type: 'webSearch', action }
        });

        expect(started).toEqual([{
            type: 'tool_call_begin',
            call_id: 'ws-2',
            name: 'WebSearch',
            input: { query: 'https://docs.cursor.com/agent/planning', action }
        }]);

        const completed = converter.handleNotification('item/completed', {
            item: { id: 'ws-2', type: 'webSearch', action }
        });

        expect(completed).toEqual([{
            type: 'tool_call_end',
            call_id: 'ws-2',
            name: 'WebSearch',
            output: { query: 'https://docs.cursor.com/agent/planning', action, status: 'completed' }
        }]);
    });

    it('maps mcp tool call and progress to generic tool call events', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            item: {
                id: 'mcp-1',
                type: 'mcpToolCall',
                server: 'web',
                tool: 'search',
                status: 'inProgress',
                arguments: { query: 'hapi' }
            }
        });

        expect(started).toEqual([{
            type: 'tool_call_begin',
            call_id: 'mcp-1',
            name: 'mcp__web__search',
            input: {
                server: 'web',
                tool: 'search',
                status: 'inProgress',
                arguments: { query: 'hapi' }
            }
        }]);

        const progress = converter.handleNotification('item/mcpToolCall/progress', {
            itemId: 'mcp-1',
            message: 'Searching web...'
        });
        expect(progress).toEqual([{ type: 'tool_call_progress', call_id: 'mcp-1', message: 'Searching web...' }]);

        const completed = converter.handleNotification('item/completed', {
            item: {
                id: 'mcp-1',
                type: 'mcpToolCall',
                server: 'web',
                tool: 'search',
                status: 'completed',
                result: { content: [{ type: 'text', text: 'done' }], structuredContent: null },
                durationMs: 120
            }
        });

        expect(completed).toEqual([{
            type: 'tool_call_end',
            call_id: 'mcp-1',
            name: 'mcp__web__search',
            output: {
                status: 'completed',
                duration_ms: 120,
                result: { content: [{ type: 'text', text: 'done' }], structuredContent: null },
                progress: ['Searching web...']
            }
        }]);
    });

    it('maps diff updates', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('turn/diff/updated', { diff: 'diff --git a b' });
        expect(events).toEqual([{ type: 'turn_diff', unified_diff: 'diff --git a b' }]);
    });
});
