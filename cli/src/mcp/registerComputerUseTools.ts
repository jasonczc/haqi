/**
 * Register the canonical computer-use tool set onto an existing McpServer.
 *
 * Shared between the stdio bridge (`computerUseMcpBridge.ts`) and
 * Claude's in-process HTTP MCP server (`startHappyServer.ts`). This keeps
 * the per-transport wiring thin: all transports expose the same 7 tools
 * with identical semantics, differing only in whether stdout is
 * restricted (stdio) or multiplexed (HTTP).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { COMPUTER_USE_TOOL_DEFINITIONS } from '@/mcp/computerUseTools'
import type { ComputerUseRuntime } from '@/computerUse/runtime'
import type { ComputerAction, ComputerActionOutcome } from '@/computerUse/types'

function buildAction(toolName: string, args: Record<string, unknown>): ComputerAction | null {
    switch (toolName) {
        case 'screenshot':
            return { kind: 'screenshot' }
        case 'cursor_position':
            return { kind: 'cursor_position' }
        case 'click': {
            const { x, y, button } = args as { x?: number; y?: number; button?: 'left' | 'middle' | 'right' }
            if (typeof x !== 'number' || typeof y !== 'number') return null
            return { kind: 'click', x, y, button }
        }
        case 'type': {
            const { text } = args as { text?: string }
            if (typeof text !== 'string') return null
            return { kind: 'type', text }
        }
        case 'key': {
            const { key } = args as { key?: string }
            if (typeof key !== 'string') return null
            return { kind: 'key', key }
        }
        case 'scroll': {
            const { direction, clicks, x, y } = args as {
                direction?: 'up' | 'down'
                clicks?: number
                x?: number
                y?: number
            }
            if (direction !== 'up' && direction !== 'down') return null
            return { kind: 'scroll', direction, clicks, x, y }
        }
        case 'open_browser': {
            const { url } = args as { url?: string }
            if (typeof url !== 'string') return null
            return { kind: 'open_browser', url }
        }
        default:
            return null
    }
}

function formatOutcome(toolName: string, outcome: ComputerActionOutcome): any {
    if (outcome.kind === 'error') {
        return {
            content: [{ type: 'text' as const, text: `${toolName} failed: ${outcome.message}` }],
            isError: true
        }
    }
    if (outcome.kind === 'screenshot') {
        return {
            content: [
                { type: 'image' as const, data: outcome.imageBase64, mimeType: 'image/png' },
                { type: 'text' as const, text: `screenshot ${outcome.width}x${outcome.height}` }
            ]
        }
    }
    if (outcome.kind === 'cursor_position') {
        return {
            content: [{ type: 'text' as const, text: JSON.stringify({ x: outcome.x, y: outcome.y }) }]
        }
    }
    return { content: [{ type: 'text' as const, text: 'ok' }] }
}

export function registerComputerUseTools(server: McpServer, runtime: ComputerUseRuntime): string[] {
    const toolNames: string[] = []
    for (const tool of COMPUTER_USE_TOOL_DEFINITIONS) {
        server.registerTool<any, any>(
            tool.name,
            {
                description: tool.description,
                title: tool.title,
                inputSchema: tool.inputSchema
            },
            async (args: Record<string, unknown>): Promise<any> => {
                const action = buildAction(tool.name, args ?? {})
                if (!action) {
                    return {
                        content: [{ type: 'text' as const, text: `${tool.name}: invalid arguments` }],
                        isError: true
                    }
                }
                const outcome = await runtime.execute(action)
                return formatOutcome(tool.name, outcome)
            }
        )
        toolNames.push(tool.name)
    }
    return toolNames
}
