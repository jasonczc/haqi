import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useShikiHighlighter } from '@/lib/shiki'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

export function CodeBlock(props: {
    code: string
    language?: string
    showCopyButton?: boolean
}) {
    const { t } = useTranslation()
    const showCopyButton = props.showCopyButton ?? true
    const { copied, copy } = useCopyToClipboard()
    const highlighted = useShikiHighlighter(props.code, props.language)

    return (
        <div className="code-block-wrapper relative min-w-0 max-w-full group">
            {showCopyButton ? (
                <button
                    type="button"
                    onClick={() => copy(props.code)}
                    className={`code-block-copy ${copied ? 'is-copied' : ''}`}
                    title={copied ? t('code.copied') : t('code.copy')}
                    aria-label={copied ? 'Copied' : 'Copy code'}
                >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </button>
            ) : null}

            <div className="code-block-scroll min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden rounded-md bg-[var(--cursor-bg-card)]">
                <pre className="shiki m-0 w-max min-w-full p-2 pr-8 text-xs font-mono">
                    <code className="block">{highlighted ?? props.code}</code>
                </pre>
            </div>
        </div>
    )
}
