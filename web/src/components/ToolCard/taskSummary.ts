import type { ToolCallBlock } from '@/chat/types'
import type { AgentStateRunningAgent } from '@/types/api'

export type TaskChildStateSummary = {
    running: number
    pending: number
    completed: number
    error: number
    total: number
}

export function getTaskChildStateSummary(block: ToolCallBlock): TaskChildStateSummary | null {
    if (block.tool.name !== 'Task') {
        return null
    }

    const childToolBlocks = block.children.filter((child): child is ToolCallBlock => child.kind === 'tool-call')
    if (childToolBlocks.length === 0) {
        return null
    }

    const summary: TaskChildStateSummary = {
        running: 0,
        pending: 0,
        completed: 0,
        error: 0,
        total: childToolBlocks.length
    }

    for (const child of childToolBlocks) {
        if (child.tool.state === 'running') {
            summary.running += 1
        } else if (child.tool.state === 'pending') {
            summary.pending += 1
        } else if (child.tool.state === 'completed') {
            summary.completed += 1
        } else if (child.tool.state === 'error') {
            summary.error += 1
        }
    }

    return summary
}

export function formatTaskChildStateSummary(summary: TaskChildStateSummary | null): string | null {
    if (!summary || summary.total === 0) {
        return null
    }

    const parts: string[] = []
    if (summary.running > 0) parts.push(`${summary.running} running`)
    if (summary.pending > 0) parts.push(`${summary.pending} waiting`)
    if (summary.completed > 0) parts.push(`${summary.completed} done`)
    if (summary.error > 0) parts.push(`${summary.error} failed`)

    return parts.length > 0 ? parts.join(' · ') : null
}

export function getRunningAgentsForTaskBlock(
    block: ToolCallBlock,
    runningAgents: AgentStateRunningAgent[] | null | undefined
): AgentStateRunningAgent[] {
    if (block.tool.name !== 'Task' || !runningAgents || runningAgents.length === 0) {
        return []
    }

    return runningAgents.filter((agent) => agent.toolUseId === block.tool.id)
}

export function formatRunningAgentNames(runningAgents: AgentStateRunningAgent[] | null | undefined): string | null {
    if (!runningAgents || runningAgents.length === 0) {
        return null
    }

    const names = runningAgents
        .map((agent) => agent.name.trim())
        .filter((name) => name.length > 0)

    if (names.length === 0) {
        return null
    }

    if (names.length <= 2) {
        return names.join(' · ')
    }

    return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`
}
