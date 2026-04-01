import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudWorkspace } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        ready: 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]',
        provisioning: 'bg-[var(--app-badge-warning-bg)] text-[var(--app-badge-warning-text)] border border-[var(--app-badge-warning-border)]',
        starting: 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]',
        active: 'bg-[var(--app-badge-success-bg)] text-[var(--app-badge-success-text)] border border-[var(--app-badge-success-border)]',
        stopped: 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]',
        failed: 'bg-[var(--app-badge-error-bg)] text-[var(--app-badge-error-text)] border border-[var(--app-badge-error-border)]',
    }
    const classes = colorMap[status] ?? 'bg-[var(--app-badge-info-bg)] text-[var(--app-badge-info-text)]'
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
            {status}
        </span>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function CollapsibleSection(props: {
    title: string
    description: string
    isExpanded: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    const sectionContentId = useId()
    return (
        <section className="border-b border-[var(--app-divider)]">
            <button
                type="button"
                onClick={props.onToggle}
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                aria-expanded={props.isExpanded}
                aria-controls={sectionContentId}
            >
                <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-[var(--app-fg)]">{props.title}</span>
                    <span className="text-xs text-[var(--app-hint)]">{props.description}</span>
                </div>
                <ChevronDownIcon
                    className={`mt-0.5 shrink-0 text-[var(--app-hint)] transition-transform ${
                        props.isExpanded ? 'rotate-180' : ''
                    }`}
                />
            </button>
            {props.isExpanded && (
                <div id={sectionContentId}>
                    {props.children}
                </div>
            )}
        </section>
    )
}

export default function CloudWorkspacesPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const [isExpanded, setIsExpanded] = useState(true)

    const workspacesQuery = useQuery({
        queryKey: queryKeys.cloudWorkspaces,
        enabled: Boolean(api),
        refetchInterval: 10_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkspaces()
        }
    })

    if (workspacesQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (workspacesQuery.isError) {
        return <div className="p-4 text-sm text-[var(--app-badge-error-text)]">Failed to load workspaces</div>
    }

    const workspaces = (workspacesQuery.data?.workspaces ?? []) as CloudWorkspace[]

    return (
        <div className="mx-auto w-full max-w-content">
            <CollapsibleSection
                title="Workspaces"
                description={`${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''} tracked`}
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
            >
                {workspaces.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-[var(--app-hint)]">
                        <p>{t('cloud.workspaces.empty')}</p>
                    </div>
                ) : (
                    <div>
                        {workspaces.map((workspace) => (
                            <Link
                                key={workspace.id}
                                to="/cloud/workspaces/$workspaceId"
                                params={{ workspaceId: workspace.id }}
                                className="flex items-start justify-between gap-3 border-b border-[var(--app-divider)] px-3 py-3 transition-colors hover:bg-[var(--app-subtle-bg)]"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={workspace.status} />
                                        <span className="font-mono text-sm font-medium text-[var(--app-fg)]">{workspace.id}</span>
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--app-hint)]">
                                        {workspace.mode ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">Mode</span>{' '}
                                                {workspace.mode}
                                            </span>
                                        ) : null}
                                        {workspace.machineId ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">Worker</span>{' '}
                                                {workspace.machineId}
                                            </span>
                                        ) : null}
                                        {workspace.path ? (
                                            <span>
                                                <span className="font-medium text-[var(--app-fg)]">Path</span>{' '}
                                                <span className="font-mono">{workspace.path}</span>
                                            </span>
                                        ) : null}
                                        <span>{formatDate(workspace.createdAt)}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </CollapsibleSection>
        </div>
    )
}
