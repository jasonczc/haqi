import { isObject } from '@hapi/protocol'
import { getInputStringAny } from '@/lib/toolInputUtils'

export function isExitPlanToolName(toolName: string): boolean {
    return toolName === 'ExitPlanMode' || toolName === 'exit_plan_mode'
}

export function getExitPlanText(input: unknown): string | null {
    if (!isObject(input)) {
        return null
    }

    return getInputStringAny(input, ['plan', 'text', 'message', 'content', 'markdown'])
}


import type { ChatBlock, ChatToolCall } from '@/chat/types'

export function findLatestPendingPlanApprovalTool(blocks: ChatBlock[]): ChatToolCall | null {
    let latest: ChatToolCall | null = null

    const visit = (block: ChatBlock) => {
        if (block.kind !== 'tool-call') {
            return
        }

        const tool = block.tool
        if (tool.permission?.status === 'pending' && isExitPlanToolName(tool.name)) {
            if (!latest || tool.createdAt >= latest.createdAt) {
                latest = tool
            }
        }

        for (const child of block.children) {
            visit(child)
        }
    }

    for (const block of blocks) {
        visit(block)
    }

    return latest
}
