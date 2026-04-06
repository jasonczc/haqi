export function CliDivider({ label }: { label?: string }) {
    if (!label) return <div className="border-t border-[var(--border-secondary)]" />
    return (
        <div className="flex items-center gap-2 text-[var(--text-tertiary)] font-mono text-xs">
            <div className="border-t border-[var(--border-secondary)] w-4" />
            <span className="shrink-0">{label}</span>
            <div className="flex-1 border-t border-[var(--border-secondary)]" />
        </div>
    )
}
