import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { isObject } from '@hapi/protocol'
import { DiffView } from '@/components/DiffView'
import { parseUnifiedDiff } from '@/lib/gitDiff'

function renderDiff(block: ToolViewProps['block'], inline: boolean) {
    const input = block.tool.input
    if (!isObject(input) || typeof input.unified_diff !== 'string') return null

    const parsed = parseUnifiedDiff(input.unified_diff)
    return (
        <DiffView
            oldString={parsed.oldText}
            newString={parsed.newText}
            filePath={parsed.fileName}
            variant={inline ? 'inline' : undefined}
        />
    )
}

export function CodexDiffCompactView(props: ToolViewProps) {
    return renderDiff(props.block, false)
}

export function CodexDiffFullView(props: ToolViewProps) {
    return renderDiff(props.block, true)
}
