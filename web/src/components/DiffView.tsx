import { lazy, Suspense, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { usePointerFocusRing } from '@/hooks/usePointerFocusRing'
import { useTheme } from '@/hooks/useTheme'
import { buildSyntheticUnifiedDiff, inferGitDiffLanguage, normalizeGitDiffLanguage } from '@/lib/gitDiff'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

const GitDiffViewer = lazy(() => import('@/components/GitDiffViewer'))

export function DiffView(props: {
    oldString: string
    newString: string
    filePath?: string
    variant?: 'preview' | 'inline'
    language?: string
}) {
    const { t } = useTranslation()
    const { isDark } = useTheme()
    const variant = props.variant ?? 'preview'
    const { suppressFocusRing, onTriggerPointerDown, onTriggerKeyDown, onTriggerBlur } = usePointerFocusRing()
    const language = normalizeGitDiffLanguage(props.language ?? inferGitDiffLanguage(props.filePath))

    const stats = useMemo(() => {
        const oldLineCount = props.oldString === '' ? 0 : props.oldString.split('\n').length
        const newLineCount = props.newString === '' ? 0 : props.newString.split('\n').length
        const added = Math.max(newLineCount - oldLineCount, 0)
        const removed = Math.max(oldLineCount - newLineCount, 0)
        // When sizes match, surface the larger side as "changed" so the label stays informative.
        const hasDelta = added > 0 || removed > 0
        const label = hasDelta
            ? `+${added.toLocaleString()} lines · −${removed.toLocaleString()} lines`
            : `~${newLineCount.toLocaleString()} lines`
        return { label, added, removed }
    }, [props.oldString, props.newString])

    const diffContent = useMemo(() => buildSyntheticUnifiedDiff({
        filePath: props.filePath,
        oldContent: props.oldString,
        newContent: props.newString
    }), [props.filePath, props.oldString, props.newString])

    const title = props.filePath ? props.filePath : t('diff.title')
    const subtitle = props.filePath ? stats.label : `${t('diff.title')} • ${stats.label}`

    const diffBody = (
        <Suspense fallback={<DiffFallback />}>
            <GitDiffViewer
                filePath={props.filePath ?? 'untitled'}
                language={language}
                oldContent={props.oldString}
                newContent={props.newString}
                diffContent={diffContent}
                theme={isDark ? 'dark' : 'light'}
            />
        </Suspense>
    )

    if (variant === 'inline') {
        return diffBody
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cursor-link)]',
                        suppressFocusRing && 'focus-visible:ring-0'
                    )}
                    onPointerDown={onTriggerPointerDown}
                    onKeyDown={onTriggerKeyDown}
                    onBlur={onTriggerBlur}
                >
                    <div className="diff-preview-card overflow-hidden rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-soft)] transition-all duration-150 ease-out hover:-translate-y-px hover:border-[var(--cursor-stroke-secondary)] hover:bg-[var(--cursor-bg-secondary)] hover:shadow-sm">
                        {props.filePath ? (
                            <div className="truncate border-b border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-soft)] px-2 py-1 text-xs text-[var(--cursor-text-secondary)]">
                                {props.filePath}
                            </div>
                        ) : null}
                        <div className="px-2 py-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate font-mono text-xs text-[var(--cursor-text-secondary)]">
                                    {props.filePath ? stats.label : subtitle}
                                </div>
                                <div className="shrink-0 text-xs text-[var(--cursor-link)]">
                                    {t('diff.view')}
                                </div>
                            </div>
                        </div>
                    </div>
                </button>
            </DialogTrigger>
            <DialogContent className="!w-[calc(100vw-32px)] !max-w-[min(1800px,calc(100vw-48px))] lg:!w-[calc(100vw-48px)]">
                <DialogHeader>
                    <DialogTitle className="break-all">{title}</DialogTitle>
                    <DialogDescription className="break-all font-mono">
                        {stats.label}
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-3 max-h-[78vh] overflow-auto lg:max-h-[85vh]">
                    {diffBody}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function DiffFallback() {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label="Loading diff"
            className="diff-skeleton rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-soft)] p-3"
        >
            <div className="diff-skeleton-line diff-skeleton-line-header" />
            <div className="diff-skeleton-line diff-skeleton-line-long" />
            <div className="diff-skeleton-line diff-skeleton-line-medium" />
            <div className="diff-skeleton-line diff-skeleton-line-short" />
            <span className="sr-only">Loading diff…</span>
        </div>
    )
}
