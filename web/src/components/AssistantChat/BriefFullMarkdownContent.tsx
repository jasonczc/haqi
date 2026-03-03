import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

import { MARKDOWN_PLUGINS, defaultComponents } from '@/components/assistant-ui/markdown-text'
import { cn } from '@/lib/utils'

type BriefFullMarkdownContentProps = {
    content: string
    className?: string
}

export function BriefFullMarkdownContent(props: BriefFullMarkdownContentProps) {
    return (
        <div
            className={cn(
                'aui-md min-w-0 max-w-full break-words text-base',
                '[&_.aui-md-p]:m-0',
                '[&_.aui-md-p+_.aui-md-p]:mt-1',
                props.className
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkBreaks, ...MARKDOWN_PLUGINS]}
                components={defaultComponents}
            >
                {props.content}
            </ReactMarkdown>
        </div>
    )
}
