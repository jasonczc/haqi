// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GitDiffViewer } from './GitDiffViewer'

vi.mock('@git-diff-view/react', () => ({
    DiffModeEnum: {
        Unified: 'unified',
        SplitGitHub: 'split'
    },
    DiffView: (props: Record<string, unknown>) => (
        <div data-testid="diff-view" data-highlight={String(props.diffViewHighlight)}>
            {String((props.data as { oldFile: { content: string } }).oldFile.content)}
        </div>
    )
}))

describe('GitDiffViewer', () => {
    it('renders diff view immediately without syntax highlighter bootstrap', () => {
        render(
            <GitDiffViewer
                filePath="a.txt"
                language="text"
                oldContent="before"
                newContent="after"
                diffContent="@@ -1 +1 @@"
                theme="light"
            />
        )

        expect(screen.getByTestId('diff-view')).toHaveAttribute('data-highlight', 'false')
        expect(screen.getByText('Unified')).toBeInTheDocument()
        expect(screen.getByText('before')).toBeInTheDocument()
    })
})
