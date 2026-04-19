import type { ComponentPropsWithoutRef } from 'react'
import { useAssistantState } from '@assistant-ui/react'
import {
    MarkdownTextPrimitive,
    unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
    useIsMarkdownCodeBlock,
    type CodeHeaderProps,
} from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { SyntaxHighlighter } from '@/components/assistant-ui/shiki-highlighter'
import { PathActionLink } from '@/components/assistant-ui/path-action-link'
import { remarkPathLinks } from '@/components/assistant-ui/remark-path-links'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { decodePathLink } from '@/lib/pathLinks'

export const MARKDOWN_PLUGINS = [remarkGfm, remarkPathLinks]

function CodeHeader(props: CodeHeaderProps) {
    const { copied, copy } = useCopyToClipboard()
    const language = props.language && props.language !== 'unknown' ? props.language : ''

    return (
        <div className="aui-md-codeheader flex items-center justify-between rounded-t-md bg-[var(--cursor-code-bg)] px-2 py-1">
            <div className="min-w-0 flex-1 pr-2 text-xs font-mono text-[var(--cursor-text-secondary)]">
                {language}
            </div>
            <button
                type="button"
                onClick={() => copy(props.code)}
                className="shrink-0 rounded p-1 text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-quiet)] hover:text-[var(--cursor-text-primary)] transition-colors"
                title="Copy"
            >
                {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
        </div>
    )
}

function Pre(props: ComponentPropsWithoutRef<'pre'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-pre-wrapper min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden">
            <pre
                {...rest}
                className={cn(
                    'aui-md-pre m-0 w-max min-w-full rounded-b-md rounded-t-none bg-[var(--cursor-code-bg)] p-2 text-sm',
                    className
                )}
            />
        </div>
    )
}

function Code(props: ComponentPropsWithoutRef<'code'>) {
    const isCodeBlock = useIsMarkdownCodeBlock()

    if (isCodeBlock) {
        return (
            <code
                {...props}
                className={cn('aui-md-codeblockcode font-mono', props.className)}
            />
        )
    }

    return (
        <code
            {...props}
            className={cn(
                'aui-md-code break-words rounded bg-[var(--cursor-inline-code-bg)] px-[0.3em] py-[0.1em] font-mono text-[0.9em]',
                props.className
            )}
        />
    )
}

function A(props: ComponentPropsWithoutRef<'a'>) {
    const path = decodePathLink(props.href)
    if (path) {
        return <PathActionLink path={path} className={props.className} />
    }

    const rel = props.target === '_blank' ? (props.rel ?? 'noreferrer') : props.rel

    return (
        <a
            {...props}
            rel={rel}
            className={cn('aui-md-a text-[var(--cursor-link)] underline', props.className)}
        />
    )
}

function Paragraph(props: ComponentPropsWithoutRef<'p'>) {
    return <p {...props} className={cn('aui-md-p leading-relaxed break-words [overflow-wrap:anywhere]', props.className)} />
}

function Blockquote(props: ComponentPropsWithoutRef<'blockquote'>) {
    return (
        <blockquote
            {...props}
            className={cn(
                'aui-md-blockquote border-l-4 border-[var(--cursor-text-secondary)] pl-3 opacity-85',
                'break-words [overflow-wrap:anywhere]',
                props.className
            )}
        />
    )
}

function UnorderedList(props: ComponentPropsWithoutRef<'ul'>) {
    return <ul {...props} className={cn('aui-md-ul list-disc pl-4 mt-1.5 space-y-1', props.className)} />
}

function OrderedList(props: ComponentPropsWithoutRef<'ol'>) {
    return <ol {...props} className={cn('aui-md-ol list-decimal pl-[18px] mb-3.5 space-y-3', props.className)} />
}

function ListItem(props: ComponentPropsWithoutRef<'li'>) {
    return <li {...props} className={cn('aui-md-li', props.className)} />
}

function Hr(props: ComponentPropsWithoutRef<'hr'>) {
    return <hr {...props} className={cn('aui-md-hr border-[var(--cursor-stroke-secondary)]', props.className)} />
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-table-wrapper max-w-full overflow-x-auto">
            <table {...rest} className={cn('agent-table aui-md-table w-full border-collapse', className)} />
        </div>
    )
}

function Thead(props: ComponentPropsWithoutRef<'thead'>) {
    return <thead {...props} className={cn('aui-md-thead', props.className)} />
}

function Tbody(props: ComponentPropsWithoutRef<'tbody'>) {
    return <tbody {...props} className={cn('aui-md-tbody', props.className)} />
}

function Tr(props: ComponentPropsWithoutRef<'tr'>) {
    return <tr {...props} className={cn('aui-md-tr', props.className)} />
}

function Th(props: ComponentPropsWithoutRef<'th'>) {
    return (
        <th
            {...props}
            className={cn(
                'aui-md-th border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-quiet)] px-2 py-1 text-left font-semibold',
                props.className
            )}
        />
    )
}

function Td(props: ComponentPropsWithoutRef<'td'>) {
    return <td {...props} className={cn('aui-md-td border border-[var(--cursor-stroke-primary)] px-2 py-1', props.className)} />
}

function H1(props: ComponentPropsWithoutRef<'h1'>) {
    return <h1 {...props} className={cn('aui-md-h1 mt-3 text-base font-semibold', props.className)} />
}

function H2(props: ComponentPropsWithoutRef<'h2'>) {
    return <h2 {...props} className={cn('aui-md-h2 mt-3 text-base font-semibold', props.className)} />
}

function H3(props: ComponentPropsWithoutRef<'h3'>) {
    return <h3 {...props} className={cn('aui-md-h3 mt-2 text-base font-semibold', props.className)} />
}

function H4(props: ComponentPropsWithoutRef<'h4'>) {
    return <h4 {...props} className={cn('aui-md-h4 mt-2 text-base font-semibold', props.className)} />
}

function H5(props: ComponentPropsWithoutRef<'h5'>) {
    return <h5 {...props} className={cn('aui-md-h5 mt-2 text-base font-semibold', props.className)} />
}

function H6(props: ComponentPropsWithoutRef<'h6'>) {
    return <h6 {...props} className={cn('aui-md-h6 mt-2 text-base font-semibold', props.className)} />
}

function Strong(props: ComponentPropsWithoutRef<'strong'>) {
    return <strong {...props} className={cn('aui-md-strong font-semibold', props.className)} />
}

function Em(props: ComponentPropsWithoutRef<'em'>) {
    return <em {...props} className={cn('aui-md-em italic', props.className)} />
}

function Image(props: ComponentPropsWithoutRef<'img'>) {
    return <img {...props} className={cn('aui-md-img max-w-full rounded', props.className)} />
}

export const defaultComponents = memoizeMarkdownComponents({
    SyntaxHighlighter,
    CodeHeader,
    pre: Pre,
    code: Code,
    h1: H1,
    h2: H2,
    h3: H3,
    h4: H4,
    h5: H5,
    h6: H6,
    a: A,
    p: Paragraph,
    strong: Strong,
    em: Em,
    blockquote: Blockquote,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    hr: Hr,
    table: Table,
    thead: Thead,
    tbody: Tbody,
    tr: Tr,
    th: Th,
    td: Td,
    img: Image,
} as const)

/**
 * Detect haqi protocol envelope messages that the agent occasionally emits
 * as plain text (rate_limit_event, system_event, etc.). These JSON envelopes
 * carry telemetry, not user-facing content, and render as ugly raw JSON blobs.
 */
function looksLikeProtocolEnvelope(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false
    if (trimmed.length > 4000) return false
    try {
        const parsed = JSON.parse(trimmed)
        if (!parsed || typeof parsed !== 'object') return false
        // Envelope shape: { type: "output" | "event" | "rate_limit_event", data: {...} }
        if (typeof parsed.type === 'string') {
            const envelopeTypes = ['output', 'event', 'rate_limit_event', 'system_event']
            if (envelopeTypes.includes(parsed.type) && parsed.data) return true
        }
        // Nested shape: { data: { type: "rate_limit_event" | ... } }
        if (parsed.data && typeof parsed.data === 'object' && typeof parsed.data.type === 'string') {
            const innerTypes = ['rate_limit_event', 'system_event', 'telemetry']
            if (innerTypes.includes(parsed.data.type)) return true
        }
    } catch {
        return false
    }
    return false
}

export function MarkdownText() {
    const text = useAssistantState((ctx: { part?: { type?: string; text?: string } }) => {
        const part = ctx.part
        if (!part || part.type !== 'text') return ''
        return typeof part.text === 'string' ? part.text : ''
    })

    if (text && looksLikeProtocolEnvelope(text)) {
        return null
    }

    return (
        <MarkdownTextPrimitive
            remarkPlugins={MARKDOWN_PLUGINS}
            components={defaultComponents}
            className={cn('aui-md min-w-0 max-w-full break-words text-[13.5px] leading-[1.55]')}
        />
    )
}
