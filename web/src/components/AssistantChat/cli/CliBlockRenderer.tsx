import type { ChatBlock } from '@/chat/types'
import { CliUserBlock } from './CliUserBlock'
import { CliAgentTextBlock, CliCliOutputBlock } from './CliAgentBlock'
import { CliReasoningBlock } from './CliReasoningBlock'
import { CliToolBlock } from './CliToolBlock'
import { CliEventBlock } from './CliEventBlock'

export function CliBlockRenderer(props: { block: ChatBlock }) {
    const { block } = props
    switch (block.kind) {
        case 'user-text':
            return <CliUserBlock block={block} />
        case 'agent-text':
            return <CliAgentTextBlock block={block} />
        case 'agent-reasoning':
            return <CliReasoningBlock block={block} />
        case 'tool-call':
            return <CliToolBlock block={block} />
        case 'cli-output':
            return <CliCliOutputBlock block={block} />
        case 'agent-event':
            return <CliEventBlock block={block} />
        default:
            return null
    }
}
