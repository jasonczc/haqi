import type { ChatBlock, ToolCallBlock } from './types'
import { classifyBashCommand } from './bashClassify'

/**
 * Tool grouping rules for the chat transcript.
 *
 * For each tool name, return a label-fn if consecutive completed invocations
 * of this tool can be merged into a "Read 5 files · Ran 3 commands" pill.
 * Returns null when the call is non-mergeable for this run (e.g. `git push`
 * via Bash, which would be grouped with `cat` if we trusted the tool name
 * alone). Inspired by Claude Code's `isSearchOrReadBashCommand` —
 * see ~/agent/claude-code/src/tools/BashTool/BashTool.tsx.
 */
function getMergeKind(block: ToolCallBlock): string | null {
    const name = block.tool.name
    switch (name) {
        case 'Read':
        case 'Grep':
        case 'Glob':
        case 'WebFetch':
        case 'WebSearch':
        case 'LS':
        case 'NotebookRead':
            return name
        case 'Bash': {
            const input = block.tool.input as { command?: string } | null | undefined
            if (!input?.command) return null
            const c = classifyBashCommand(input.command)
            if (!c.isSearch && !c.isRead && !c.isList) return null
            return 'Bash'
        }
        default:
            return null
    }
}

const TOOL_LABELS: Record<string, (count: number) => string> = {
    Bash: (n) => `Ran ${n} ${n === 1 ? 'command' : 'commands'}`,
    Read: (n) => `Read ${n} ${n === 1 ? 'file' : 'files'}`,
    Grep: (n) => (n === 1 ? 'Searched once' : `Searched ${n} times`),
    Glob: (n) => `Globbed ${n} ${n === 1 ? 'pattern' : 'patterns'}`,
    WebFetch: (n) => `Fetched ${n} ${n === 1 ? 'URL' : 'URLs'}`,
    WebSearch: (n) => (n === 1 ? 'Web searched once' : `Web searched ${n} times`),
    LS: (n) => `Listed ${n} ${n === 1 ? 'directory' : 'directories'}`,
    NotebookRead: (n) => `Read ${n} ${n === 1 ? 'notebook' : 'notebooks'}`,
}

export type ToolCallGroupItem = {
    kind: 'tool-call-group'
    id: string
    tools: ToolCallBlock[]
}

export type GroupedChatItem = ChatBlock | ToolCallGroupItem

export function isMergeableToolCall(block: ChatBlock): block is ToolCallBlock {
    if (block.kind !== 'tool-call') return false
    if (block.tool.state !== 'completed' && block.tool.state !== 'error') return false
    if (block.tool.permission && block.tool.permission.status !== 'approved') return false
    if (block.children.length > 0) return false
    return getMergeKind(block) !== null
}

export function groupReadOnlyToolCalls(blocks: ChatBlock[]): GroupedChatItem[] {
    const result: GroupedChatItem[] = []
    let buffer: ToolCallBlock[] = []

    const flush = () => {
        if (buffer.length >= 2) {
            result.push({
                kind: 'tool-call-group',
                id: `group:${buffer[0]!.id}`,
                tools: buffer,
            })
        } else if (buffer.length === 1) {
            result.push(buffer[0]!)
        }
        buffer = []
    }

    for (const block of blocks) {
        if (isMergeableToolCall(block)) {
            buffer.push(block)
        } else {
            flush()
            result.push(block)
        }
    }
    flush()
    return result
}

export function summarizeToolGroup(tools: ToolCallBlock[]): string {
    const counts = new Map<string, number>()
    const order: string[] = []
    for (const t of tools) {
        const kind = getMergeKind(t)
        if (!kind) continue
        if (!counts.has(kind)) order.push(kind)
        counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    return order
        .map((kind) => {
            const n = counts.get(kind) ?? 0
            const label = TOOL_LABELS[kind]
            return label ? label(n) : `${kind} ×${n}`
        })
        .join(' · ')
}
