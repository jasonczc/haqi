import '@git-diff-view/react/styles/diff-view-pure.css'
import { DiffModeEnum, DiffView } from '@git-diff-view/react'
import { memo, useMemo } from 'react'
import { useDiffSoftWrap } from '@/hooks/useDiffSoftWrap'
import { useDiffViewMode } from '@/hooks/useDiffViewMode'

export function GitDiffViewer(props: {
    filePath: string
    language: string
    oldContent: string
    newContent: string
    diffContent: string
    theme: 'light' | 'dark'
    showToolbar?: boolean
}) {
    const { softWrap, toggleSoftWrap } = useDiffSoftWrap()
    const { diffViewMode, setDiffViewMode } = useDiffViewMode()

    const showToolbar = props.showToolbar ?? true
    const diffData = useMemo(() => ({
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
    }), [props.diffContent, props.filePath, props.language, props.newContent, props.oldContent])

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {showToolbar ? (
                <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setDiffViewMode(DiffModeEnum.Unified)}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${diffViewMode === DiffModeEnum.Unified
                                ? 'border-[var(--app-link)] bg-[var(--app-secondary-bg)] text-[var(--app-fg)]'
                                : 'border-[var(--app-border)] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]'}`}
                            aria-pressed={diffViewMode === DiffModeEnum.Unified}
                            title="Show unified diff"
                        >
                            Unified
                        </button>
                        <button
                            type="button"
                            onClick={() => setDiffViewMode(DiffModeEnum.SplitGitHub)}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${diffViewMode === DiffModeEnum.SplitGitHub
                                ? 'border-[var(--app-link)] bg-[var(--app-secondary-bg)] text-[var(--app-fg)]'
                                : 'border-[var(--app-border)] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]'}`}
                            aria-pressed={diffViewMode === DiffModeEnum.SplitGitHub}
                            title="Show side-by-side diff"
                        >
                            Split
                        </button>
                    </div>
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
                data={diffData}
                diffViewMode={diffViewMode}
                diffViewTheme={props.theme}
                diffViewHighlight
                diffViewWrap={softWrap}
                diffViewFontSize={12}
            />
        </div>
    )
}

export default memo(GitDiffViewer)
