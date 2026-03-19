export default function ReviewLoopsIndexPage() {
    return (
        <div className="flex h-full items-center justify-center font-mono">
            <div className="text-xs text-[var(--app-hint)] leading-relaxed">
                <div className="flex">
                    <span className="text-[var(--app-divider)] select-none mr-2">{'│'}</span>
                    <span>&nbsp;</span>
                </div>
                <div className="flex">
                    <span className="text-[var(--app-divider)] select-none mr-2">{'│'}</span>
                    <span>Select a loop from the sidebar</span>
                </div>
                <div className="flex">
                    <span className="text-[var(--app-divider)] select-none mr-2">{'│'}</span>
                    <span>or wait for a new one to appear.</span>
                </div>
                <div className="flex">
                    <span className="text-[var(--app-divider)] select-none mr-2">{'│'}</span>
                    <span>&nbsp;</span>
                </div>
            </div>
        </div>
    )
}
