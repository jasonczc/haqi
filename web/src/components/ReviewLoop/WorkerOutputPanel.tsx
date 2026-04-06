import { useState } from 'react'
import type { WorkerOutput } from '@/types/api'
import { CliDivider } from './CliDivider'

function CliSection({
    title,
    suffix,
    defaultOpen = false,
    children,
}: {
    title: string
    suffix?: string
    defaultOpen?: boolean
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="font-mono text-xs min-w-0">
            <button
                type="button"
                className="w-full flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-left min-w-0"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="shrink-0">{open ? '\u25BE' : '\u25B8'}</span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="border-t border-[var(--border-secondary)] w-3 shrink-0" />
                    <span className="text-[var(--text-primary)] shrink-0">{title}</span>
                    {suffix && <span className="shrink-0">{suffix}</span>}
                    <div className="flex-1 border-t border-[var(--border-secondary)]" />
                </div>
            </button>
            {open && (
                <div className="mt-1 ml-2 pl-2 border-l border-[var(--border-secondary)] min-w-0 overflow-hidden">
                    {children}
                </div>
            )}
        </div>
    )
}

function CommandEntry({ command, exitCode, stdout, stderr }: {
    command: string
    exitCode: number
    stdout: string
    stderr: string
}) {
    const exitColor = exitCode === 0 ? 'var(--success)' : 'var(--danger)'
    return (
        <div className="font-mono text-xs space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-[var(--text-tertiary)] shrink-0">$</span>
                <span className="text-[var(--text-primary)] break-all">{command}</span>
                <span className="shrink-0" style={{ color: exitColor }}>exit: {exitCode}</span>
            </div>
            {stdout && (
                <div className="ml-2 min-w-0">
                    <div className="text-[var(--text-tertiary)] border-t border-l border-r border-[var(--border-secondary)] rounded-t-sm px-2 py-0.5">stdout</div>
                    <pre className="whitespace-pre-wrap break-all text-[var(--text-primary)] max-h-48 overflow-auto app-scrollbar pl-0 border-l border-r border-b border-[var(--border-secondary)] rounded-b-sm px-2 py-1">
                        {stdout.split('\n').map((line, i) => (
                            <div key={i}>{line}</div>
                        ))}
                    </pre>
                </div>
            )}
            {stderr && (
                <div className="ml-2 min-w-0">
                    <div className="border-t border-l border-r border-[var(--border-secondary)] rounded-t-sm px-2 py-0.5" style={{ color: 'var(--danger)' }}>stderr</div>
                    <pre className="whitespace-pre-wrap break-all max-h-48 overflow-auto app-scrollbar pl-0 border-l border-r border-b border-[var(--border-secondary)] rounded-b-sm px-2 py-1" style={{ color: 'var(--danger)' }}>
                        {stderr.split('\n').map((line, i) => (
                            <div key={i}>{line}</div>
                        ))}
                    </pre>
                </div>
            )}
        </div>
    )
}

export function WorkerOutputPanel({ output }: { output: WorkerOutput }) {
    const exitColor = output.exitStatus === 'success' ? 'var(--success)' : 'var(--danger)'

    return (
        <div className="font-mono text-xs space-y-2 min-w-0 overflow-hidden">
            {/* Exit status */}
            <div className="flex items-center gap-2 text-[var(--text-tertiary)] min-w-0">
                <div className="border-t border-[var(--border-secondary)] w-3 shrink-0" />
                <span className="text-[var(--text-primary)] shrink-0">Worker Output</span>
                <span className="shrink-0" style={{ color: exitColor }}>[{output.exitStatus}]</span>
                <div className="flex-1 border-t border-[var(--border-secondary)]" />
            </div>

            {/* Summary */}
            {output.summary && (
                <CliSection title="Summary" defaultOpen>
                    <p className="text-[var(--text-primary)] whitespace-pre-wrap break-words">{output.summary}</p>
                </CliSection>
            )}

            {/* Files Changed */}
            {output.filesChanged.length > 0 && (
                <CliSection title={`Files Changed (${output.filesChanged.length})`} defaultOpen>
                    <div className="space-y-0 min-w-0">
                        {output.filesChanged.map((f, i) => {
                            const prefix = f.startsWith('D ') ? 'D' : f.startsWith('A ') ? 'A' : 'M'
                            const name = f.replace(/^[MAD]\s+/, '')
                            const prefixColor = prefix === 'D' ? 'var(--danger)' : prefix === 'A' ? 'var(--success)' : 'var(--cursor-info)'
                            return (
                                <div key={i} className="truncate min-w-0">
                                    <span style={{ color: prefixColor }}>{prefix}</span>{' '}
                                    <span className="text-[var(--text-primary)]">{name}</span>
                                </div>
                            )
                        })}
                    </div>
                </CliSection>
            )}

            {/* Diff */}
            {output.diff && (
                <CliSection title="Diff" suffix={(() => {
                    const lines = output.diff.split('\n')
                    const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
                    const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length
                    return `(+${added} -${removed})`
                })()}>
                    <pre className="whitespace-pre-wrap break-all max-h-96 overflow-auto app-scrollbar min-w-0">
                        {output.diff.split('\n').map((line, i) => {
                            let style: React.CSSProperties = { color: 'var(--text-primary)' }
                            if (line.startsWith('+')) style = { color: 'var(--added)', backgroundColor: 'var(--bg-success-secondary)' }
                            else if (line.startsWith('-')) style = { color: 'var(--removed)', backgroundColor: 'var(--bg-danger-secondary)' }
                            else if (line.startsWith('@@')) style = { color: 'var(--text-tertiary)' }
                            return (
                                <div key={i} style={style}>
                                    {line || ' '}
                                </div>
                            )
                        })}
                    </pre>
                </CliSection>
            )}

            {/* Commands */}
            {output.commands.length > 0 && (
                <CliSection title={`Commands (${output.commands.length})`}>
                    <div className="space-y-2 min-w-0">
                        {output.commands.map((cmd, i) => (
                            <CommandEntry key={i} {...cmd} />
                        ))}
                    </div>
                </CliSection>
            )}

            {/* Raw Response */}
            {output.rawResponse && (
                <CliSection title="Raw Response">
                    <pre className="whitespace-pre-wrap break-all text-[var(--text-primary)] max-h-64 overflow-auto app-scrollbar min-w-0">
                        {output.rawResponse}
                    </pre>
                </CliSection>
            )}
        </div>
    )
}
