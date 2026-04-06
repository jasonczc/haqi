import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudSpawnRequest } from '@hapi/protocol/types'

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
}

function PhaseBadge({ phase }: { phase: string }) {
    const colorMap: Record<string, string> = {
        succeeded: 'bg-[var(--cursor-badge-success-bg)] text-[var(--cursor-badge-success-text)] border border-[var(--cursor-badge-success-border)]',
        failed: 'bg-[var(--cursor-badge-error-bg)] text-[var(--cursor-badge-error-text)] border border-[var(--cursor-badge-error-border)]',
        canceled: 'bg-[var(--cursor-badge-info-bg)] text-[var(--cursor-badge-info-text)]',
        pending: 'bg-[var(--cursor-badge-warning-bg)] text-[var(--cursor-badge-warning-text)] border border-[var(--cursor-badge-warning-border)]',
        scheduling: 'bg-[var(--cursor-badge-warning-bg)] text-[var(--cursor-badge-warning-text)] border border-[var(--cursor-badge-warning-border)]',
        provisioning: 'bg-[var(--cursor-badge-info-bg)] text-[var(--cursor-badge-info-text)]',
        starting: 'bg-[var(--cursor-badge-info-bg)] text-[var(--cursor-badge-info-text)]',
    }
    const classes = colorMap[phase] ?? 'bg-[var(--cursor-badge-info-bg)] text-[var(--cursor-badge-info-text)]'
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
            {phase}
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
        <section className="border-b border-[var(--cursor-stroke-secondary)]">
            <button
                type="button"
                onClick={props.onToggle}
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--cursor-bg-quiet)]"
                aria-expanded={props.isExpanded}
                aria-controls={sectionContentId}
            >
                <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-[var(--cursor-text-primary)]">{props.title}</span>
                    <span className="text-xs text-[var(--cursor-text-secondary)]">{props.description}</span>
                </div>
                <ChevronDownIcon
                    className={`mt-0.5 shrink-0 text-[var(--cursor-text-secondary)] transition-transform ${
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

export default function CloudRequestsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const [isExpanded, setIsExpanded] = useState(true)

    const requestsQuery = useQuery({
        queryKey: queryKeys.cloudRequests,
        enabled: Boolean(api),
        refetchInterval: 5_000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudRequests()
        }
    })

    if (requestsQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (requestsQuery.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load requests</div>
    }

    const requests = (requestsQuery.data?.requests ?? []) as CloudSpawnRequest[]

    return (
        <div className="mx-auto w-full max-w-content">
            <CollapsibleSection
                title="Requests"
                description={`${requests.length} spawn request${requests.length !== 1 ? 's' : ''}`}
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
            >
                {requests.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-[var(--cursor-text-secondary)]">
                        <p>{t('cloud.requests.empty')}</p>
                    </div>
                ) : (
                    <div>
                        {requests.map((request) => (
                            <Link
                                key={request.id}
                                to="/settings/requests/$requestId"
                                params={{ requestId: request.id }}
                                className="flex items-start justify-between gap-3 border-b border-[var(--cursor-stroke-secondary)] px-3 py-3 transition-colors hover:bg-[var(--cursor-bg-quiet)]"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <div className="flex items-center gap-2">
                                        <PhaseBadge phase={request.phase} />
                                        <span className="font-mono text-sm font-medium text-[var(--cursor-text-primary)]">{request.id}</span>
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--cursor-text-secondary)]">
                                        {request.selectedMachineId ? (
                                            <span>
                                                <span className="font-medium text-[var(--cursor-text-primary)]">Worker</span>{' '}
                                                {request.selectedMachineId}
                                            </span>
                                        ) : null}
                                        {request.request.agent ? (
                                            <span>
                                                <span className="font-medium text-[var(--cursor-text-primary)]">Agent</span>{' '}
                                                {request.request.agent}
                                            </span>
                                        ) : null}
                                        <span>{formatDate(request.createdAt)}</span>
                                    </div>
                                </div>
                                {request.error ? (
                                    <div className="max-w-xs shrink-0 truncate text-xs px-1.5 py-0.5 rounded bg-[var(--cursor-badge-error-bg)] text-[var(--cursor-badge-error-text)]">
                                        {request.error.message ?? request.error.code}
                                    </div>
                                ) : null}
                            </Link>
                        ))}
                    </div>
                )}
            </CollapsibleSection>
        </div>
    )
}
