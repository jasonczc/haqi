import { memo } from 'react'
import type { AgentReasoningBlock } from '@/chat/types'

export const CliReasoningBlock = memo(function CliReasoningBlock(props: { block: AgentReasoningBlock }) {
    return (
        <details className="py-0.5 group">
            <summary className="text-[var(--cursor-text-tertiary)] italic text-xs cursor-pointer select-none hover:text-[var(--cursor-text-primary)] transition-colors">
                thinking…
            </summary>
            <div className="text-[var(--cursor-text-tertiary)] italic text-xs pl-4 border-l border-[var(--cursor-stroke-primary)] mt-1 whitespace-pre-wrap break-words">
                {props.block.text}
            </div>
        </details>
    )
})
