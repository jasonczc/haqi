import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { DiffView } from '@/components/DiffView'
import { isObject } from '@hapi/protocol'
import { resolveDisplayPath } from '@/utils/path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ChangeFile = {
    path: string
    additions: number
    deletions: number
    unifiedDiff: string | null
}

type DisplayChangeFile = ChangeFile & {
    displayPath: string
    priorityLabel: string
    parsedDiff: { oldText: string; newText: string } | null
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

type ParsedDiffSection = {
    path: string
    unifiedDiff: string
}

const MIN_LIST_WIDTH = 220
const MAX_LIST_WIDTH = 520
const MIN_DIFF_WIDTH = 360
const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)'
const TURN_CHANGES_DETAIL_QUERY_KEY = 'turnChangesToolId'
const TURN_CHANGES_FILE_QUERY_KEY = 'turnChangesFile'

function readTurnChangesFilePath(search: string, toolId: string): string | null {
    const params = new URLSearchParams(search)
    const detailToolId = params.get(TURN_CHANGES_DETAIL_QUERY_KEY)?.trim() ?? ''
    const filePath = params.get(TURN_CHANGES_FILE_QUERY_KEY)?.trim() ?? ''
    if (!detailToolId || detailToolId !== toolId || !filePath) {
        return null
    }
    return filePath
}

function writeTurnChangesFilePath(
    toolId: string,
    filePath: string | null,
    mode: 'push' | 'replace'
): void {
    if (typeof window === 'undefined') {
        return
    }

    const url = new URL(window.location.href)
    url.searchParams.set(TURN_CHANGES_DETAIL_QUERY_KEY, toolId)
    if (filePath) {
        url.searchParams.set(TURN_CHANGES_FILE_QUERY_KEY, filePath)
    } else {
        url.searchParams.delete(TURN_CHANGES_FILE_QUERY_KEY)
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    if (mode === 'replace') {
        window.history.replaceState(window.history.state, '', nextUrl)
        return
    }

    window.history.pushState(window.history.state, '', nextUrl)
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizePath(path: string): string {
    return path
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .trim()
}

function parseDiffHeaderPath(line: string): string | null {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (!match) return null
    return match[2]?.trim() || null
}

function parsePlusPath(line: string): string | null {
    const rawPath = line.replace(/^\+\+\+\s+/, '').trim()
    if (!rawPath || rawPath === '/dev/null') return null
    if (rawPath.startsWith('b/')) return rawPath.slice(2)
    return rawPath
}

function splitUnifiedDiffByFile(unifiedDiff: string): ParsedDiffSection[] {
    const sections: ParsedDiffSection[] = []
    const lines = unifiedDiff.split('\n')

    let currentPath: string | null = null
    let currentLines: string[] = []

    const flush = () => {
        if (!currentPath || currentLines.length === 0) {
            currentPath = null
            currentLines = []
            return
        }

        sections.push({
            path: currentPath,
            unifiedDiff: currentLines.join('\n')
        })
        currentPath = null
        currentLines = []
    }

    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            flush()
            currentPath = parseDiffHeaderPath(line)
            currentLines = [line]
            continue
        }

        if (currentLines.length === 0) {
            if (!line.trim()) continue
            currentLines = [line]
        } else {
            currentLines.push(line)
        }

        if (line.startsWith('+++ ')) {
            currentPath = parsePlusPath(line) ?? currentPath
        }
    }

    flush()
    return sections
}

function pickMatchingUnifiedDiff(unifiedDiff: string, expectedPath: string): string {
    const sections = splitUnifiedDiffByFile(unifiedDiff)
    if (sections.length <= 1) return unifiedDiff

    const normalizedExpectedPath = normalizePath(expectedPath)
    const exact = sections.find((section) => normalizePath(section.path) === normalizedExpectedPath)
    if (exact) return exact.unifiedDiff

    const suffixMatches = sections.filter((section) => {
        const normalizedSectionPath = normalizePath(section.path)
        return normalizedExpectedPath.endsWith(`/${normalizedSectionPath}`)
            || normalizedSectionPath.endsWith(`/${normalizedExpectedPath}`)
    })

    if (suffixMatches.length === 1) {
        return suffixMatches[0].unifiedDiff
    }

    return unifiedDiff
}

function normalizeSummary(input: unknown): ChangeSummary | null {
    if (!isObject(input)) return null

    const filesRaw = Array.isArray(input.files) ? input.files : []
    const files: ChangeFile[] = filesRaw
        .map((entry) => {
            if (!isObject(entry)) return null
            const path = typeof entry.path === 'string' ? entry.path.trim() : ''
            if (!path) return null

            const unifiedDiff = typeof entry.unified_diff === 'string' ? entry.unified_diff : null
            return {
                path,
                additions: asNumber(entry.additions),
                deletions: asNumber(entry.deletions),
                unifiedDiff: unifiedDiff ? pickMatchingUnifiedDiff(unifiedDiff, path) : null
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

function getFilePriority(file: ChangeFile): { score: number; label: string } {
    const path = normalizePath(file.path).toLowerCase()
    const changeSize = file.additions + file.deletions

    if (
        path.includes('/dist/')
        || path.includes('/build/')
        || path.includes('/.vite/')
        || path.endsWith('.map')
        || path.endsWith('bun.lock')
        || path.endsWith('package-lock.json')
        || path.endsWith('pnpm-lock.yaml')
    ) {
        return { score: 10 + Math.min(changeSize, 50) / 100, label: 'Generated' }
    }

    if (
        path.endsWith('.test.ts')
        || path.endsWith('.test.tsx')
        || path.endsWith('.spec.ts')
        || path.endsWith('.spec.tsx')
        || path.startsWith('docs/')
        || path.endsWith('.md')
    ) {
        return { score: 30 + Math.min(changeSize, 100) / 100, label: 'Support' }
    }

    if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.sass')) {
        return { score: 45 + Math.min(changeSize, 100) / 100, label: 'Style' }
    }

    if (
        path.endsWith('package.json')
        || path.endsWith('tsconfig.json')
        || path.endsWith('vite.config.ts')
        || path.endsWith('forge.config.ts')
        || path.includes('/routes/')
        || path.includes('/lib/')
        || path.includes('/hooks/')
    ) {
        return { score: 90 + Math.min(changeSize, 200) / 100, label: 'Core' }
    }

    if (path.includes('/components/')) {
        return { score: 70 + Math.min(changeSize, 200) / 100, label: 'UI' }
    }

    return { score: 55 + Math.min(changeSize, 150) / 100, label: 'Code' }
}

function compareChangeFiles(left: DisplayChangeFile, right: DisplayChangeFile): number {
    const leftPriority = getFilePriority(left).score
    const rightPriority = getFilePriority(right).score
    if (leftPriority !== rightPriority) return rightPriority - leftPriority

    const leftChanges = left.additions + left.deletions
    const rightChanges = right.additions + right.deletions
    if (leftChanges !== rightChanges) return rightChanges - leftChanges

    return left.displayPath.localeCompare(right.displayPath)
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    return target.isContentEditable
}

export function CodexTurnChangesView(props: ToolViewProps) {
    const summary = useMemo(() => normalizeSummary(props.block.tool.input), [props.block.tool.input])
    if (!summary) return null

    const files = useMemo<DisplayChangeFile[]>(() => summary.files.map((file) => {
        const displayPath = resolveDisplayPath(file.path, props.metadata)
        const unifiedDiff = typeof file.unifiedDiff === 'string' && file.unifiedDiff.length > 0
            ? file.unifiedDiff
            : null
        const priority = getFilePriority(file)

        return {
            ...file,
            displayPath,
            priorityLabel: priority.label,
            parsedDiff: unifiedDiff ? parseUnifiedDiff(unifiedDiff) : null
        }
    }).sort(compareChangeFiles), [props.metadata, summary.files])

    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [mobileView, setMobileView] = useState<'list' | 'diff'>('list')
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
    ))
    const [listWidth, setListWidth] = useState(320)
    const [isResizing, setIsResizing] = useState(false)
    const desktopLayoutRef = useRef<HTMLDivElement | null>(null)
    const fileButtonRefs = useRef(new Map<string, HTMLButtonElement>())

    useEffect(() => {
        if (files.length === 0) {
            setSelectedPath(null)
            setMobileView('list')
            return
        }

        if (selectedPath && !files.some((file) => file.path === selectedPath)) {
            setSelectedPath(null)
        }
    }, [files, selectedPath])

    const selectedFile = selectedPath ? files.find((file) => file.path === selectedPath) ?? null : null

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
        const handleChange = () => {
            setIsMobileViewport(mediaQuery.matches)
        }

        handleChange()
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange)
            return () => {
                mediaQuery.removeEventListener('change', handleChange)
            }
        }

        mediaQuery.addListener(handleChange)
        return () => {
            mediaQuery.removeListener(handleChange)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        if (!isMobileViewport) {
            const activeFilePath = readTurnChangesFilePath(window.location.search, props.block.id)
            if (activeFilePath) {
                writeTurnChangesFilePath(props.block.id, null, 'replace')
            }
            return
        }

        const syncFromHistory = () => {
            const activeFilePath = readTurnChangesFilePath(window.location.search, props.block.id)
            if (!activeFilePath) {
                setMobileView('list')
                return
            }
            if (!files.some((file) => file.path === activeFilePath)) {
                setMobileView('list')
                return
            }

            setSelectedPath(activeFilePath)
            setMobileView('diff')
        }

        syncFromHistory()
        window.addEventListener('popstate', syncFromHistory)
        return () => {
            window.removeEventListener('popstate', syncFromHistory)
        }
    }, [files, isMobileViewport, props.block.id])

    const selectFileWithOffset = useCallback((offset: number) => {
        if (files.length === 0) return
        const currentIndex = selectedFile ? files.findIndex((file) => file.path === selectedFile.path) : 0
        const nextIndex = Math.max(0, Math.min(files.length - 1, currentIndex + offset))
        const nextFile = files[nextIndex]
        if (!nextFile || nextFile.path === selectedFile?.path) return
        setSelectedPath(nextFile.path)
        requestAnimationFrame(() => {
            fileButtonRefs.current.get(nextFile.path)?.focus()
        })
    }, [files, selectedFile])

    const handleNavigationKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (isEditableTarget(event.target)) return

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            selectFileWithOffset(1)
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            selectFileWithOffset(-1)
        }
    }, [selectFileWithOffset])

    const openFileDetails = useCallback((path: string) => {
        setSelectedPath(path)

        if (!isMobileViewport) {
            setMobileView('diff')
            return
        }

        if (typeof window === 'undefined') {
            setMobileView('diff')
            return
        }

        const current = readTurnChangesFilePath(window.location.search, props.block.id)
        if (current !== path) {
            writeTurnChangesFilePath(props.block.id, path, 'push')
        }
        setMobileView('diff')
    }, [isMobileViewport, props.block.id])

    const handleBackToFileList = useCallback(() => {
        if (!isMobileViewport) {
            setMobileView('list')
            return
        }

        if (typeof window === 'undefined') {
            setMobileView('list')
            return
        }

        const current = readTurnChangesFilePath(window.location.search, props.block.id)
        if (current) {
            window.history.back()
            return
        }
        setMobileView('list')
    }, [isMobileViewport, props.block.id])

    const clampListWidth = useCallback((nextWidth: number) => {
        const container = desktopLayoutRef.current
        const containerWidth = container?.getBoundingClientRect().width ?? 0
        const maxFromContainer = containerWidth > 0
            ? Math.max(MIN_LIST_WIDTH, containerWidth - MIN_DIFF_WIDTH)
            : MAX_LIST_WIDTH
        const maxWidth = Math.min(MAX_LIST_WIDTH, maxFromContainer)
        return Math.max(MIN_LIST_WIDTH, Math.min(nextWidth, maxWidth))
    }, [])

    const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()

        const startX = event.clientX
        const startWidth = listWidth
        setIsResizing(true)

        const onMove = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientX - startX
            setListWidth(clampListWidth(startWidth + delta))
        }

        const onUp = () => {
            setIsResizing(false)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
    }, [clampListWidth, listWidth])

    useEffect(() => {
        const onResize = () => setListWidth((current) => clampListWidth(current))
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [clampListWidth])

    const renderFileList = () => (
        <div className="turn-changes-file-list overflow-hidden rounded-md border border-[var(--cursor-stroke-primary)]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-hover)] px-2 py-1.5 text-xs font-medium text-[var(--cursor-text-tertiary)]">
                <span>Files ({files.length})</span>
                <span className="font-normal">click to preview diff</span>
            </div>
            {files.length === 0 ? (
                <div className="px-2 py-3 text-xs text-[var(--cursor-text-tertiary)]">
                    No code change in this turn.
                </div>
            ) : (
                <div className="max-h-72 overflow-y-auto md:max-h-[36rem]">
                    {files.map((file) => {
                        const selected = selectedFile?.path === file.path
                        return (
                            <button
                                key={file.path}
                                type="button"
                                ref={(node) => {
                                    if (node) {
                                        fileButtonRefs.current.set(file.path, node)
                                    } else {
                                        fileButtonRefs.current.delete(file.path)
                                    }
                                }}
                                onClick={() => openFileDetails(file.path)}
                                className={`w-full border-b border-[var(--cursor-stroke-primary)] px-2 py-2 text-left transition-colors last:border-b-0 ${selected ? 'bg-[var(--cursor-bg-hover)]' : 'hover:bg-[var(--cursor-bg-hover)]'}`}
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 rounded bg-[var(--cursor-bg-quiet)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--cursor-text-tertiary)]">
                                        {file.priorityLabel}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--cursor-text-primary)]" title={file.displayPath}>
                                        {file.displayPath}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--cursor-text-tertiary)]">
                                    <span>+{file.additions} / -{file.deletions}</span>
                                    {!file.parsedDiff ? <span>snapshot unavailable</span> : null}
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )

    const renderDiffPanel = (mobile: boolean) => (
        <div className="turn-changes-diff-panel overflow-hidden rounded-md border border-[var(--cursor-stroke-primary)]">
            {selectedFile ? (
                <>
                    <div className="border-b border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-hover)] px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 font-mono text-xs text-[var(--cursor-text-primary)] break-all">
                                {selectedFile.displayPath}
                            </div>
                            <div className="shrink-0 text-[11px] text-[var(--cursor-text-tertiary)]">
                                +{selectedFile.additions} / -{selectedFile.deletions}
                            </div>
                        </div>
                    </div>
                    <div className="max-h-[65vh] overflow-auto p-2">
                        {selectedFile.parsedDiff ? (
                            <DiffView
                                oldString={selectedFile.parsedDiff.oldText}
                                newString={selectedFile.parsedDiff.newText}
                                filePath={selectedFile.displayPath}
                                variant="inline"
                            />
                        ) : (
                            <div className="text-xs text-[var(--cursor-text-tertiary)]">
                                No diff snapshot for this file (patch event only).
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex min-h-40 items-center justify-center px-3 py-8 text-center text-xs text-[var(--cursor-text-tertiary)]">
                    Select a file to preview its diff.
                </div>
            )}

            {mobile ? (
                <div className="border-t border-[var(--cursor-stroke-primary)] px-2 py-2 md:hidden">
                    <button
                        type="button"
                        onClick={handleBackToFileList}
                        className="rounded border border-[var(--cursor-stroke-primary)] px-2 py-1 text-xs text-[var(--cursor-text-tertiary)] hover:bg-[var(--cursor-bg-hover)]"
                    >
                        Back to files
                    </button>
                </div>
            ) : null}
        </div>
    )

    const showTopSummary = !isMobileViewport || mobileView === 'list'

    return (
        <div className="flex flex-col gap-2" onKeyDown={handleNavigationKeyDown}>
            {showTopSummary ? (
                <div className="rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-hover)] px-2 py-1.5 text-xs text-[var(--cursor-text-tertiary)]">
                    <div>{statusLabel(summary.status)}</div>
                    <div>Files: {summary.files.length}</div>
                    <div>Patch apply: {summary.patchTotal} ({summary.patchSuccess} success, {summary.patchFailed} failed)</div>
                    <div>
                        Diff: {summary.diffAvailable ? `+${summary.diffAdditions} / -${summary.diffDeletions}` : 'unavailable'}
                    </div>
                    {summary.files.length > 1 ? (
                        <div>Shortcut: ↑/↓ switch file</div>
                    ) : null}
                </div>
            ) : null}

            <div className="md:hidden">
                {mobileView === 'list' ? renderFileList() : renderDiffPanel(true)}
            </div>

            <div
                ref={desktopLayoutRef}
                className="hidden md:flex md:items-start"
            >
                <div
                    className={selectedFile ? 'shrink-0 pr-2' : 'min-w-0 flex-1'}
                    style={selectedFile ? { width: `${listWidth}px` } : undefined}
                >
                    {renderFileList()}
                </div>

                {selectedFile ? (
                    <>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize file list and diff"
                            onPointerDown={handleResizeStart}
                            className="flex w-3 shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center"
                        >
                            <div className={`w-px transition-colors ${isResizing ? 'bg-[var(--cursor-link)]' : 'bg-[var(--cursor-stroke-primary)] hover:bg-[var(--cursor-link)]'}`} />
                        </div>

                        <div className="min-w-0 flex-1 pl-2">
                            {renderDiffPanel(false)}
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    )
}
