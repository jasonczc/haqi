import { isObject } from '@hapi/protocol'
import { getInputStringAny } from '@/lib/toolInputUtils'

export function isExitPlanToolName(toolName: string): boolean {
    return toolName === 'ExitPlanMode' || toolName === 'exit_plan_mode'
}

export function getExitPlanText(input: unknown): string | null {
    if (!isObject(input)) {
        return null
    }

    return getInputStringAny(input, ['plan', 'text'])
}
