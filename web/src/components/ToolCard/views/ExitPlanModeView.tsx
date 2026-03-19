import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { getExitPlanText } from '@/components/ToolCard/exitPlanMode'
import type { ToolViewProps } from '@/components/ToolCard/views/_all'

export function ExitPlanModeView(props: ToolViewProps) {
    const plan = getExitPlanText(props.block.tool.input)
    if (!plan) return null
    return <MarkdownRenderer content={plan} />
}
