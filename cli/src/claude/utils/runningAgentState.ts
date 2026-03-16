import type { AgentStateRunningAgent } from '@/api/types'
import type { RawJSONLines } from '../types'

export function extractRunningAgentFromTaskInput(input: unknown, toolUseId?: string): AgentStateRunningAgent | null {
    if (!input || typeof input !== 'object') {
        return null
    }

    const taskInput = input as Record<string, unknown>
    const name = typeof taskInput.name === 'string' && taskInput.name.trim().length > 0
        ? taskInput.name.trim()
        : typeof taskInput.subagent_type === 'string' && taskInput.subagent_type.trim().length > 0
            ? taskInput.subagent_type.trim()
            : typeof taskInput.description === 'string' && taskInput.description.trim().length > 0
                ? taskInput.description.trim()
                : null
    if (!name) {
        return null
    }

    const task = typeof taskInput.prompt === 'string' && taskInput.prompt.trim().length > 0
        ? taskInput.prompt.trim()
        : typeof taskInput.description === 'string' && taskInput.description.trim().length > 0
            ? taskInput.description.trim()
            : undefined

    return {
        name,
        ...(task ? { task } : {}),
        ...(toolUseId ? { toolUseId } : {}),
        startedAt: Date.now()
    }
}

export function applyRunningAgentStateFromLogMessage(
    runningAgents: Map<string, AgentStateRunningAgent>,
    message: RawJSONLines
): boolean {
    let changed = false

    if (message.type === 'assistant') {
        const content = Array.isArray(message.message?.content) ? message.message.content : []
        for (const block of content) {
            if (!block || typeof block !== 'object') continue
            const type = (block as { type?: unknown }).type
            const id = (block as { id?: unknown }).id
            const name = (block as { name?: unknown }).name
            if (type !== 'tool_use' || typeof id !== 'string') continue
            if (typeof name !== 'string' || name.trim().toLowerCase() !== 'task') continue
            const next = extractRunningAgentFromTaskInput((block as { input?: unknown }).input, id)
            if (!next) continue
            runningAgents.set(id, next)
            changed = true
        }
    }

    if (message.type === 'user') {
        const content = Array.isArray(message.message.content) ? message.message.content : []
        for (const block of content) {
            if (!block || typeof block !== 'object') continue
            const type = (block as { type?: unknown }).type
            const toolUseId = (block as { tool_use_id?: unknown }).tool_use_id
            if (type !== 'tool_result' || typeof toolUseId !== 'string') continue
            if (runningAgents.delete(toolUseId)) {
                changed = true
            }
        }
    }

    return changed
}

export function reconstructRunningAgentsFromLogMessages(messages: readonly RawJSONLines[]): Map<string, AgentStateRunningAgent> {
    const runningAgents = new Map<string, AgentStateRunningAgent>()
    for (const message of messages) {
        applyRunningAgentStateFromLogMessage(runningAgents, message)
    }
    return runningAgents
}
