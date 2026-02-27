import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { DiffView } from '@/components/DiffView'
import { isObject } from '@hapi/protocol'
import { resolveDisplayPath } from '@/utils/path'
import { useEffect, useMemo, useState } from 'react'

type ChangeFile = {
    path: string
    additions: number
    deletions: number
    unifiedDiff: string | null
}

type ChangeSummary = {
    status: string
    files: ChangeFile[]
    patchTotal: number
    patchSuccess: number
    patchFailed: number
    diffAvailable: boolean
    diffAdditions: number
    diffDeletions: number
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeSummary(input: unknown): ChangeSummary | null {
    if (!isObject(input)) return null

    const filesRaw = Array.isArray(input.files) ? input.files : []
    const files: ChangeFile[] = filesRaw
        .map((entry) => {
            if (!isObject(entry)) return null
            const path = typeof entry.path === 'string' ? entry.path.trim() : ''
            if (!path) return null

            return {
                path,
                additions: asNumber(entry.additions),
                deletions: asNumber(entry.deletions),
                unifiedDiff: typeof entry.unified_diff === 'string' ? entry.unified_diff : null
            }
        })
        .filter((entry): entry is ChangeFile => entry !== null)

    const patchApply = isObject(input.patch_apply) ? input.patch_apply : null
    const diffStats = isObject(input.diff_stats) ? input.diff_stats : null

    return {
        status: typeof input.status === 'string' ? input.status : 'completed',
        files,
        patchTotal: asNumber(patchApply?.total),
        patchSuccess: asNumber(patchApply?.success),
        patchFailed: asNumber(patchApply?.failed),
        diffAvailable: diffStats?.available === true,
        diffAdditions: asNumber(diffStats?.additions),
        diffDeletions: asNumber(diffStats?.deletions)
    }
}

function parseUnifiedDiff(unifiedDiff: string): { oldText: string; newText: string } {
    const lines = unifiedDiff.split('\n')
    const oldLines: string[] = []
    const newLines: string[] = []
    let inHunk = false

    for (const line of lines) {
        if (
            line.startsWith('diff --git')
            || line.startsWith('index ')
            || line.startsWith('---')
            || line.startsWith('+++')
            || line.startsWith('new file mode')
            || line.startsWith('deleted file mode')
        ) {
            continue
        }

        if (line.startsWith('@@')) {
            inHunk = true
            continue
        }

        if (!inHunk) continue

        if (line.startsWith('+')) {
            newLines.push(line.substring(1))
        } else if (line.startsWith('-')) {
            oldLines.push(line.substring(1))
        } else if (line.startsWith(' ')) {
            oldLines.push(line.substring(1))
            newLines.push(line.substring(1))
        } else if (line === '\\ No newline at end of file') {
            continue
        } else if (line === '') {
            oldLines.push('')
            newLines.push('')
        }
    }

    return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n')
    }
}

function statusLabel(status: string): string {
    if (status === 'aborted') return 'Turn aborted'
    if (status === 'failed') return 'Turn failed'
    return 'Turn completed'
}

export function CodexTurnChangesView(props: ToolViewProps) {
    const summary = useMemo(() => normalizeSummary(props.block.tool.input), [props.block.tool.input])
    if (!summary) return null

    const files = useMemo(() => summary.files.map((file) => {
        const displayPath = resolveDisplayPath(file.path, props.metadata)
        const unifiedDiff = typeof file.unifiedDiff === 'string' && file.unifiedDiff.length > 0
            ? file.unifiedDiff
            : null

        return {
            ...file,
            displayPath,
            parsedDiff: unifiedDiff ? parseUnifiedDiff(unifiedDiff) : null
        }
    }), [props.metadata, summary.files])

    const [selectedPath, setSelectedPath] = useState<string | null>(() => files[0]?.path ?? null)
    const [mobileView, setMobileView] = useState<'list' | 'diff'>('list')

    useEffect(() => {
        if (files.length === 0) {
            setSelectedPath(null)
            setMobileView('list')
            return
        }

        if (!selectedPath || !files.some((file) => file.path === selectedPath)) {
            setSelectedPath(files[0].path)
        }
    }, [files, selectedPath])

    const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0] ?? null

    const renderFileList = () => (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1.5 text-xs font-medium text-[var(--app-hint)]">
                Files ({files.length})
            </div>
            {files.length === 0 ? (
                <div className="px-2 py-3 text-xs text-[var(--app-hint)]">
                    No file changes detected for this turn.
                </div>
            ) : (
                <div className="max-h-72 overflow-y-auto md:max-h-[28rem]">
                    {files.map((file) => {
                        const selected = selectedFile?.path === file.path
                        return (
                            <button
                                key={file.path}
                                type="button"
                                onClick={() => {
                                    setSelectedPath(file.path)
                                    setMobileView('diff')
                                }}
                                className={`w-full border-b border-[var(--app-divider)] px-2 py-2 text-left transition-colors last:border-b-0 ${selected ? 'bg-[var(--app-subtle-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
                            >
                                <div className="font-mono text-xs text-[var(--app-fg)] break-all">
                                    {file.displayPath}
                                </div>
                                <div className="mt-0.5 text-[11px] text-[var(--app-hint)]">
                                    +{file.additions} / -{file.deletions}
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )

    const renderDiffPanel = (mobile: boolean) => (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)]">
            {selectedFile ? (
                <>
                    <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 font-mono text-xs text-[var(--app-fg)] break-all">
                                {selectedFile.displayPath}
                            </div>
                            <div className="shrink-0 text-[11px] text-[var(--app-hint)]">
                                +{selectedFile.additions} / -{selectedFile.deletions}
                            </div>
                        </div>
                    </div>
                    <div className="max-h-[32rem] overflow-auto p-2">
                        {selectedFile.parsedDiff ? (
                            <DiffView
                                oldString={selectedFile.parsedDiff.oldText}
                                newString={selectedFile.parsedDiff.newText}
                                filePath={selectedFile.displayPath}
                                variant="inline"
                            />
                        ) : (
                            <div className="text-xs text-[var(--app-hint)]">
                                No diff snapshot for this file (patch event only).
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="px-2 py-3 text-xs text-[var(--app-hint)]">
                    No file selected.
                </div>
            )}

            {mobile ? (
                <div className="border-t border-[var(--app-border)] px-2 py-2 md:hidden">
                    <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        className="rounded border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]"
                    >
                        Back to files
                    </button>
                </div>
            ) : null}
        </div>
    )

    return (
        <div className="flex flex-col gap-2">
            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1.5 text-xs text-[var(--app-hint)]">
                <div>{statusLabel(summary.status)}</div>
                <div>Files: {summary.files.length}</div>
                <div>Patch apply: {summary.patchTotal} ({summary.patchSuccess} success, {summary.patchFailed} failed)</div>
                <div>
                    Diff: {summary.diffAvailable ? `+${summary.diffAdditions} / -${summary.diffDeletions}` : 'unavailable'}
                </div>
            </div>

            <div className="md:hidden">
                {mobileView === 'list' ? renderFileList() : renderDiffPanel(true)}
            </div>

            <div className="hidden md:grid md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] md:items-start md:gap-3">
                {renderFileList()}
                {renderDiffPanel(false)}
            </div>
        </div>
    )
}
