// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CodexTurnChangesView } from './CodexTurnChangesView'
import type { ToolViewProps } from './_all'

vi.mock('@/components/DiffView', () => ({
    DiffView: (props: { oldString: string; newString: string; filePath?: string }) => (
        <div
            data-testid="diff-view"
            data-file-path={props.filePath ?? ''}
            data-old={props.oldString}
            data-new={props.newString}
        />
    )
}))

function buildProps(input: unknown): ToolViewProps {
    return {
        block: {
            kind: 'tool-call',
            id: 'tool-1',
            localId: null,
            createdAt: Date.now(),
            children: [],
            meta: undefined,
            tool: {
                id: 'tool-1',
                name: 'CodexTurnChanges',
                state: 'completed',
                input,
                createdAt: Date.now(),
                startedAt: Date.now(),
                completedAt: Date.now(),
                description: null
            }
        },
        metadata: null
    }
}

describe('CodexTurnChangesView', () => {
    it('shows only the selected file diff when unified_diff accidentally contains multiple files', () => {
        const sharedDiff = [
            'diff --git a/src/a.ts b/src/a.ts',
            'index 111..222 100644',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1 +1 @@',
            '-before-a',
            '+after-a',
            'diff --git a/src/b.ts b/src/b.ts',
            'index 333..444 100644',
            '--- a/src/b.ts',
            '+++ b/src/b.ts',
            '@@ -1 +1 @@',
            '-before-b',
            '+after-b'
        ].join('\n')

        render(
            <CodexTurnChangesView
                {...buildProps({
                    status: 'completed',
                    files: [
                        { path: 'src/a.ts', additions: 1, deletions: 1, unified_diff: sharedDiff },
                        { path: 'src/b.ts', additions: 1, deletions: 1, unified_diff: sharedDiff }
                    ],
                    patch_apply: { total: 1, success: 1, failed: 0 },
                    diff_stats: { additions: 2, deletions: 2, available: true }
                })}
            />
        )

        expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()

        fireEvent.click(screen.getAllByRole('button', { name: /src\/a\.ts/i })[0]!)

        for (const node of screen.getAllByTestId('diff-view')) {
            expect(node).toHaveAttribute('data-file-path', 'src/a.ts')
            expect(node).toHaveAttribute('data-old', 'before-a')
            expect(node).toHaveAttribute('data-new', 'after-a')
        }

        fireEvent.click(screen.getAllByRole('button', { name: /src\/b\.ts/i })[0]!)

        for (const node of screen.getAllByTestId('diff-view')) {
            expect(node).toHaveAttribute('data-file-path', 'src/b.ts')
            expect(node).toHaveAttribute('data-old', 'before-b')
            expect(node).toHaveAttribute('data-new', 'after-b')
        }
    })

    it('prioritizes source files ahead of style-only changes', () => {
        render(
            <CodexTurnChangesView
                {...buildProps({
                    status: 'completed',
                    files: [
                        {
                            path: 'web/src/cursor-theme.css',
                            additions: 50,
                            deletions: 10,
                            unified_diff: 'diff --git a/web/src/cursor-theme.css b/web/src/cursor-theme.css\n--- a/web/src/cursor-theme.css\n+++ b/web/src/cursor-theme.css\n@@ -1 +1 @@\n-a\n+b'
                        },
                        {
                            path: 'web/src/lib/session.ts',
                            additions: 2,
                            deletions: 1,
                            unified_diff: 'diff --git a/web/src/lib/session.ts b/web/src/lib/session.ts\n--- a/web/src/lib/session.ts\n+++ b/web/src/lib/session.ts\n@@ -1 +1 @@\n-a\n+b'
                        }
                    ],
                    patch_apply: { total: 2, success: 2, failed: 0 },
                    diff_stats: { additions: 52, deletions: 11, available: true }
                })}
            />
        )

        const fileButtons = screen.getAllByRole('button', { name: /web\/src\//i })
        expect(fileButtons[0]).toHaveTextContent('web/src/lib/session.ts')
        expect(fileButtons[1]).toHaveTextContent('web/src/cursor-theme.css')
    })
})
