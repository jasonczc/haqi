import '@git-diff-view/react/styles/diff-view-pure.css'
import { DiffModeEnum, DiffView } from '@git-diff-view/react'
import { useEffect, useState } from 'react'
import { useDiffSoftWrap } from '@/hooks/useDiffSoftWrap'

type DiffHighlighter = Awaited<ReturnType<typeof import('@git-diff-view/shiki')['getDiffViewHighlighter']>>

let cachedHighlighter: DiffHighlighter | null = null
let cachedHighlighterPromise: Promise<DiffHighlighter> | null = null

async function loadDiffHighlighter(): Promise<DiffHighlighter> {
    if (cachedHighlighter) {
        return cachedHighlighter
    }
    if (!cachedHighlighterPromise) {
        cachedHighlighterPromise = import('@git-diff-view/shiki')
            .then(({ getDiffViewHighlighter }) => getDiffViewHighlighter())
            .then((highlighter) => {
                cachedHighlighter = highlighter
                return highlighter
            })
    }
    return cachedHighlighterPromise
}

export function GitDiffViewer(props: {
    filePath: string
    language: string
    oldContent: string
    newContent: string
    diffContent: string
    theme: 'light' | 'dark'
    showToolbar?: boolean
}) {
    const [highlighter, setHighlighter] = useState<DiffHighlighter | null>(() => cachedHighlighter)
    const { softWrap, toggleSoftWrap } = useDiffSoftWrap()

    useEffect(() => {
        let cancelled = false

        void loadDiffHighlighter().then((next) => {
            if (!cancelled) {
                setHighlighter(next)
            }
        })

        return () => {
            cancelled = true
        }
    }, [])

    const showToolbar = props.showToolbar ?? true

    return (
        <div className="overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-bg)]">
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
            {highlighter ? (
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
                    registerHighlighter={highlighter}
                />
            ) : (
                <div className="px-3 py-4 text-xs text-[var(--app-hint)]">
                    Loading diff…
                </div>
            )}
        </div>
    )
}

export default GitDiffViewer
