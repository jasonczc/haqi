import { Link } from '@tanstack/react-router'

/**
 * Placeholder route so Bugbot nav matches cursor-clone wiring; replace with full Bugbot UI when available.
 */
export default function CloudBugbotPage() {
    return (
        <div className="cursor-theme space-y-4 text-[var(--text-primary)]">
            <h1 className="text-lg font-semibold">Bugbot</h1>
            <p className="text-sm text-[var(--text-tertiary)]">
                Bugbot 功能尚未接入。参考设计见仓库内{' '}
                <code className="rounded bg-[var(--bg-tertiary)] px-1">cursor-clone/settings-bugbot.html</code>。
            </p>
            <Link to="/sessions" className="text-sm text-[var(--accent)] underline">
                返回 Agents
            </Link>
        </div>
    )
}
