import '@git-diff-view/react/styles/diff-view-pure.css'
import { DiffModeEnum, DiffView } from '@git-diff-view/react'

export function GitDiffViewer(props: {
    filePath: string
    language: string
    oldContent: string
    newContent: string
    diffContent: string
    theme: 'light' | 'dark'
}) {
    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
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
                diffViewWrap
                diffViewFontSize={12}
            />
        </div>
    )
}

export default GitDiffViewer
