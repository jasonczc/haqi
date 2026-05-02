import { describe, expect, it } from 'vitest'
import type { ChatBlock, ChatToolCall, ToolCallBlock } from './types'
import {
    groupReadOnlyToolCalls,
    isMergeableToolCall,
    summarizeToolGroup,
} from './groupReadOnlyToolCalls'

function tool(
    name: string,
    overrides: Partial<ChatToolCall> = {},
    children: ChatBlock[] = [],
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `tool-${Math.random().toString(36).slice(2, 10)}`,
        localId: null,
        createdAt: 0,
        tool: {
            id: 'inner',
            name,
            state: 'completed',
            input: {},
            createdAt: 0,
            startedAt: 0,
            completedAt: 0,
            description: null,
            ...overrides,
        },
        children,
    }
}

function bash(command: string, overrides: Partial<ChatToolCall> = {}): ToolCallBlock {
    return tool('Bash', { input: { command }, ...overrides })
}

function agentText(text: string): ChatBlock {
    return { kind: 'agent-text', id: `at-${text}`, localId: null, createdAt: 0, text }
}

describe('isMergeableToolCall', () => {
    it('accepts native read-only tools', () => {
        expect(isMergeableToolCall(tool('Read'))).toBe(true)
        expect(isMergeableToolCall(tool('Grep'))).toBe(true)
        expect(isMergeableToolCall(tool('Glob'))).toBe(true)
        expect(isMergeableToolCall(tool('LS'))).toBe(true)
    })

    it('accepts Bash only when the command is search/read/list (per Claude Code classifier)', () => {
        expect(isMergeableToolCall(bash('cat foo.txt'))).toBe(true)
        expect(isMergeableToolCall(bash('grep -rn foo .'))).toBe(true)
        expect(isMergeableToolCall(bash('ls -la'))).toBe(true)
        expect(isMergeableToolCall(bash('git push'))).toBe(false)
        expect(isMergeableToolCall(bash('npm install'))).toBe(false)
        expect(isMergeableToolCall(bash('rm -rf node_modules'))).toBe(false)
    })

    it('rejects mutating / unknown tools', () => {
        expect(isMergeableToolCall(tool('Edit'))).toBe(false)
        expect(isMergeableToolCall(tool('Write'))).toBe(false)
        expect(isMergeableToolCall(tool('Task'))).toBe(false)
        expect(isMergeableToolCall(tool('mcp__foo__bar'))).toBe(false)
    })

    it('rejects in-flight or pending-permission tools', () => {
        expect(isMergeableToolCall(tool('Read', { state: 'running' }))).toBe(false)
        expect(isMergeableToolCall(tool('Read', { state: 'pending' }))).toBe(false)
        expect(isMergeableToolCall(tool('Read', { permission: { id: 'p', status: 'pending' } }))).toBe(false)
    })

    it('accepts errored tools so they remain visible inside the expanded group', () => {
        expect(isMergeableToolCall(tool('Read', { state: 'error' }))).toBe(true)
    })

    it('rejects tools with nested children (e.g. Task)', () => {
        const withChild = tool('Read', {}, [agentText('child')])
        expect(isMergeableToolCall(withChild)).toBe(false)
    })

    it('rejects bash with no command input', () => {
        expect(isMergeableToolCall(tool('Bash', { input: {} }))).toBe(false)
        expect(isMergeableToolCall(tool('Bash', { input: null }))).toBe(false)
    })
})

describe('groupReadOnlyToolCalls', () => {
    it('does not group a single mergeable tool', () => {
        const result = groupReadOnlyToolCalls([tool('Read')])
        expect(result).toHaveLength(1)
        expect(result[0]!.kind).toBe('tool-call')
    })

    it('groups two or more consecutive mergeable tools', () => {
        const a = bash('cat a.txt')
        const b = tool('Read')
        const c = tool('Grep')
        const result = groupReadOnlyToolCalls([a, b, c])
        expect(result).toHaveLength(1)
        expect(result[0]!.kind).toBe('tool-call-group')
    })

    it('a destructive bash breaks the chain even when surrounded by reads', () => {
        const before = [bash('cat a'), bash('cat b')]
        const destructive = bash('git push')
        const after = [tool('Read'), tool('Grep')]
        const result = groupReadOnlyToolCalls([...before, destructive, ...after])
        expect(result).toHaveLength(3)
        expect(result[0]!.kind).toBe('tool-call-group')
        expect(result[1]).toBe(destructive)
        expect(result[2]!.kind).toBe('tool-call-group')
    })

    it('breaks the run on a running tool', () => {
        const a = tool('Read')
        const b = tool('Read')
        const running = tool('Read', { state: 'running' })
        const c = tool('Read')
        const d = tool('Read')
        const result = groupReadOnlyToolCalls([a, b, running, c, d])
        expect(result).toHaveLength(3)
        expect(result[0]!.kind).toBe('tool-call-group')
        expect(result[1]).toBe(running)
        expect(result[2]!.kind).toBe('tool-call-group')
    })

    it('keeps a singleton mergeable tool surrounded by non-mergeable as a plain block', () => {
        const blocks: ChatBlock[] = [
            agentText('a'),
            tool('Read'),
            tool('Edit'),
            tool('Grep'),
            agentText('b'),
        ]
        const result = groupReadOnlyToolCalls(blocks)
        expect(result.map((r) => r.kind)).toEqual([
            'agent-text',
            'tool-call',
            'tool-call',
            'tool-call',
            'agent-text',
        ])
    })
})

describe('summarizeToolGroup', () => {
    it('formats single-kind groups with the per-tool label', () => {
        const tools = [bash('cat a'), bash('cat b'), bash('cat c')]
        expect(summarizeToolGroup(tools)).toBe('Ran 3 commands')
    })

    it('formats mixed groups joined by middle dots in first-seen order', () => {
        const tools = [tool('Read'), tool('Read'), bash('cat a'), tool('Read'), tool('Grep')]
        expect(summarizeToolGroup(tools)).toBe('Read 3 files · Ran 1 command · Searched once')
    })

    it('uses singular forms when count is exactly 1', () => {
        const tools = [tool('Read'), tool('LS')]
        expect(summarizeToolGroup(tools)).toBe('Read 1 file · Listed 1 directory')
    })
})
