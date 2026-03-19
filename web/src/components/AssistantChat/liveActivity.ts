import type { NormalizedAgentContent } from '@/chat/types'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import type { DecryptedMessage } from '@/types/api'

export const LIVE_ACTIVITY_MAX_LENGTH = 140

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }
    return value as Record<string, unknown>
}

export function pickString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value !== 'string') {
            continue
        }
        const trimmed = value.trim()
        if (trimmed.length > 0) {
            return trimmed
        }
    }
    return null
}

export function toSingleLine(text: string, maxLength: number = LIVE_ACTIVITY_MAX_LENGTH): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) {
        return normalized
    }
    return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

export function formatLiveToolCall(name: string, input: unknown): string {
    const normalizedName = name.trim()
    const lowerName = normalizedName.toLowerCase()
    const inputRecord = asRecord(input)

    if (lowerName === 'codexbash') {
        const command = pickString(inputRecord?.command, inputRecord?.cmd)
        return command ? `Running: ${toSingleLine(command)}` : 'Running shell command…'
    }

    if (lowerName === 'codexpatch') {
        const changes = asRecord(inputRecord?.changes)
        const fileCount = changes ? Object.keys(changes).length : 0
        if (fileCount > 0) {
            return `Editing ${fileCount} file${fileCount === 1 ? '' : 's'}`
        }
        return 'Applying code edits…'
    }

    if (lowerName.includes('websearch')) {
        const query = pickString(inputRecord?.query, inputRecord?.url, inputRecord?.pattern)
        return query ? `Web search: ${toSingleLine(query, 96)}` : 'Running web search…'
    }

    const query = pickString(inputRecord?.query, inputRecord?.url, inputRecord?.path, inputRecord?.tool)
    return query
        ? `Using ${normalizedName}: ${toSingleLine(query, 96)}`
        : `Using ${normalizedName}`
}

export function formatLiveToolResult(content: unknown, isError: boolean): string {
    const contentRecord = asRecord(content)
    const command = pickString(contentRecord?.command, contentRecord?.cmd)
    if (command) {
        const exitCode = typeof contentRecord?.exit_code === 'number' ? contentRecord.exit_code : 0
        if (isError || exitCode !== 0) {
            return `Command failed: ${toSingleLine(command)}`
        }
        return `Ran: ${toSingleLine(command)}`
    }

    const error = pickString(contentRecord?.error, contentRecord?.stderr)
    if (error) {
        return `Error: ${toSingleLine(error, 96)}`
    }

    const status = pickString(contentRecord?.status)
    if (status) {
        return `Tool ${status}`
    }

    if (typeof contentRecord?.success === 'boolean') {
        return contentRecord.success ? 'Tool completed' : 'Tool failed'
    }

    return isError ? 'Tool failed' : 'Tool completed'
}

export function extractLiveActivityFromAgentContent(content: NormalizedAgentContent): string | null {
    if (content.type === 'tool-call') {
        return formatLiveToolCall(content.name, content.input)
    }
    if (content.type === 'tool-result') {
        return formatLiveToolResult(content.content, content.is_error)
    }
    if (content.type === 'reasoning') {
        return 'Thinking…'
    }
    if (content.type === 'text') {
        return 'Drafting response…'
    }
    return null
}

export function extractInProgressPlanStep(planValue: unknown): string | null {
    if (!Array.isArray(planValue)) {
        return null
    }

    for (const item of planValue) {
        const itemRecord = asRecord(item)
        if (!itemRecord) {
            continue
        }
        if (itemRecord.status !== 'in_progress') {
            continue
        }
        const step = pickString(itemRecord.step)
        if (step) {
            return step
        }
    }

    return null
}

export function extractLatestLiveActivity(messages: DecryptedMessage[]): string {
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const normalized = normalizeDecryptedMessage(messages[messageIndex])
        if (!normalized) {
            continue
        }

        if (normalized.role === 'agent') {
            for (let contentIndex = normalized.content.length - 1; contentIndex >= 0; contentIndex -= 1) {
                const summary = extractLiveActivityFromAgentContent(normalized.content[contentIndex])
                if (summary) {
                    return summary
                }
            }
            continue
        }

        if (normalized.role === 'event' && normalized.content.type === 'plan-update') {
            const inProgressStep = extractInProgressPlanStep((normalized.content as { plan?: unknown }).plan)
            if (inProgressStep) {
                return `Planning: ${toSingleLine(inProgressStep, 96)}`
            }
        }
    }

    return 'Waiting for Codex activity…'
}
