import '@git-diff-view/react/styles/diff-view-pure.css'
import { DiffModeEnum, DiffView } from '@git-diff-view/react'
import { useEffect, useState } from 'react'
import { useDiffSoftWrap } from '@/hooks/useDiffSoftWrap'

export function GitDiffViewer(props: {
    filePath: string
    language: string
    oldContent: string
    newContent: string
    diffContent: string
    theme: 'light' | 'dark'
    showToolbar?: boolean
}) {
    const [highlighter, setHighlighter] = useState<Awaited<ReturnType<typeof import('@git-diff-view/shiki')['getDiffViewHighlighter']>> | null>(null)
    const { softWrap, toggleSoftWrap } = useDiffSoftWrap()

    useEffect(() => {
        let cancelled = false

        async function loadHighlighter() {
            const { getDiffViewHighlighter } = await import('@git-diff-view/shiki')
            const next = await getDiffViewHighlighter()
            if (!cancelled) {
                setHighlighter(next)
            }
        }

        void loadHighlighter()

        return () => {
            cancelled = true
        }
    }, [])

    const showToolbar = props.showToolbar ?? true

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {showToolbar ? (
                <div className="flex items-center justify-end border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1">
                    <button
                        type="button"
                        onClick={toggleSoftWrap}
                        className="rounded border border-[var(--app-border)] px-2 py-1 text-[11px] text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        aria-pressed={softWrap}
                        title={softWrap ? 'Disable soft wrap' : 'Enable soft wrap'}
                    >
                        Soft wrap: {softWrap ? 'On' : 'Off'}
                    </button>
                </div>
            ) : null}
            <DiffView
                data={{
                    oldFile: {
                        fileName: props.filePath,
                        fileLang: props.language,
                        content: props.oldContent
                    },
                    newFile: {
                        fileName: props.filePath,
                        fileLang: props.language,
                        content: props.newContent
                    },
                    hunks: [props.diffContent]
                }}
                diffViewMode={DiffModeEnum.SplitGitHub}
                diffViewTheme={props.theme}
                diffViewHighlight
                diffViewWrap={softWrap}
                diffViewFontSize={12}
                registerHighlighter={highlighter ?? undefined}
            />
        </div>
    )
}

export default GitDiffViewer
