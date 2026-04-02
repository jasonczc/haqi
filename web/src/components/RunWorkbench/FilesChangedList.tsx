import { useState } from 'react'
import type { FileChange } from './types'

function FileStatusIcon(props: { status: string }) {
    const colors: Record<string, string> = {
        added: 'var(--added)',
        modified: 'var(--modified)',
        removed: 'var(--removed)',
        renamed: 'var(--accent)'
    }
    const labels: Record<string, string> = { added: 'A', modified: 'M', removed: 'D', renamed: 'R' }
    return (
        <span
            className="inline-flex h-4 w-4 items-center justify-center text-[10px] font-bold"
            style={{ color: colors[props.status] ?? 'var(--text-tertiary)' }}
        >
            {labels[props.status] ?? '?'}
        </span>
    )
}

/**
 * Collapsible "Files Changed" list shown in the conversation area,
 * matching Cursor's left-panel file list style.
 */
export function FilesChangedList(props: { files: FileChange[] }) {
    const [expanded, setExpanded] = useState(true)

    if (!props.files.length) return null

    return (
        <div className="mx-auto w-full max-w-content">
            <div className="rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-editor)] overflow-hidden">
                {/* Header */}
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-quaternary)] transition-colors"
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        className={`flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                    >
                        <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {props.files.length} Files Changed
                    </span>
                </button>

                {/* File list */}
                {expanded && (
                    <div className="border-t border-[var(--border-tertiary)]">
                        {props.files.map((file, i) => {
                            const shortName = file.filename.split('/').pop() ?? file.filename
                            const ext = shortName.includes('.') ? shortName.split('.').pop() ?? '' : ''
                            return (
                                <div
                                    key={file.filename}
                                    className={`flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-quaternary)] transition-colors ${
                                        i < props.files.length - 1 ? '' : ''
                                    }`}
                                >
                                    <FileStatusIcon status={file.status} />
                                    {/* File type icon */}
                                    <span className="flex-shrink-0 text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] w-4 text-center">
                                        {ext === 'ts' || ext === 'tsx' ? (
                                            <span style={{ color: '#3178c6' }}>TS</span>
                                        ) : ext === 'js' || ext === 'jsx' ? (
                                            <span style={{ color: '#f0db4f' }}>JS</span>
                                        ) : ext === 'css' ? (
                                            <span style={{ color: '#264de4' }}>C</span>
                                        ) : null}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
                                        {shortName}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs tabular-nums flex-shrink-0">
                                        {file.additions > 0 && (
                                            <span className="font-mono text-[var(--added)]">+{file.additions}</span>
                                        )}
                                        {file.deletions > 0 && (
                                            <span className="font-mono text-[var(--removed)]">-{file.deletions}</span>
                                        )}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
