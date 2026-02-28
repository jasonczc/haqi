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

export function EditView(props: ToolViewProps) {
    const input = props.block.tool.input
    if (!isObject(input)) return null

    const oldString = typeof input.old_string === 'string' ? input.old_string : null
    const newString = typeof input.new_string === 'string' ? input.new_string : null
    if (oldString === null || newString === null) return null

    return (
        <DiffView
            oldString={oldString}
            newString={newString}
            filePath={extractFilePath(input)}
            variant="inline"
        />
    )
}
