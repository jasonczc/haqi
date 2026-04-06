function getProgressColor(progress: number): string {
    if (progress < 30) return 'var(--danger)'
    if (progress <= 70) return 'var(--warn)'
    return 'var(--success)'
}

export function ProgressBar({ progress }: { progress: number }) {
    const clamped = Math.max(0, Math.min(100, progress))
    const color = getProgressColor(clamped)

    return (
        <div className="font-mono text-xs inline-flex items-center gap-2 min-w-0 max-w-full">
            <div className="flex-1 h-2 bg-[var(--cursor-code-bg)] rounded-sm overflow-hidden min-w-0" style={{ border: '1px solid var(--border-secondary)' }}>
                <div
                    className="h-full rounded-sm transition-all"
                    style={{ width: `${clamped}%`, backgroundColor: color }}
                />
            </div>
            <span className="text-[var(--text-tertiary)] w-8 text-right tabular-nums shrink-0">{clamped}%</span>
        </div>
    )
}
