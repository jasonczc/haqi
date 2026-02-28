import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { isObject } from '@hapi/protocol'
import { DiffView } from '@/components/DiffView'

function extractFilePath(input: Record<string, unknown>): string | undefined {
    const candidate = typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.path === 'string'
            ? input.path
            : null
    if (candidate === null) return undefined
    const trimmed = candidate.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

export function WriteView(props: ToolViewProps) {
    const input = props.block.tool.input
    if (!isObject(input)) return null

    const content = typeof input.content === 'string' ? input.content : typeof input.text === 'string' ? input.text : null
    if (content === null) return null

    return (
        <DiffView
            oldString=""
            newString={content}
            filePath={extractFilePath(input)}
            variant="inline"
        />
    )
}
