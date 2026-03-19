export function CliDivider({ label }: { label?: string }) {
    if (!label) return <div className="border-t border-[var(--app-border)]" />
    return (
        <div className="flex items-center gap-2 text-[var(--app-hint)] font-mono text-xs">
            <div className="border-t border-[var(--app-border)] w-4" />
            <span className="shrink-0">{label}</span>
            <div className="flex-1 border-t border-[var(--app-border)]" />
        </div>
    )
}
