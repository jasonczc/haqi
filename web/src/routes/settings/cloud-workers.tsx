import { useState, useId, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import type { CloudWorkerSummary } from '@/types/api'

function formatLastSeen(updatedAt: number): string {
    const now = Date.now()
    const diffMs = now - updatedAt
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return new Date(updatedAt).toLocaleDateString()
}

function formatMemory(memoryMb: number): string {
    if (memoryMb >= 1024) return `${(memoryMb / 1024).toFixed(1)} GB`
    return `${memoryMb} MB`
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString()
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

function EnrollmentTokensSection() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null)
    const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
    const [editLabel, setEditLabel] = useState('')
    const [isExpanded, setIsExpanded] = useState(true)

    const tokensQuery = useQuery({
        queryKey: queryKeys.cloudWorkerEnrollmentTokens,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkerEnrollmentTokens()
        }
    })

    const revokeMutation = useMutation({
        mutationFn: async (tokenId: string) => {
            if (!api) throw new Error('API unavailable')
            await api.revokeCloudWorkerEnrollmentToken(tokenId)
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
    })

    const extendMutation = useMutation({
        mutationFn: async (tokenId: string) => {
            if (!api) throw new Error('API unavailable')
            await api.updateCloudWorkerEnrollmentToken(tokenId, { extendMinutes: 60 })
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
    })

    const labelMutation = useMutation({
        mutationFn: async ({ tokenId, label }: { tokenId: string; label: string }) => {
            if (!api) throw new Error('API unavailable')
            await api.updateCloudWorkerEnrollmentToken(tokenId, { label: label.trim() || null })
        },
        onSuccess: () => {
            setEditingTokenId(null)
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        }
    })

    const tokens = tokensQuery.data?.tokens ?? []
    const activeTokens = tokens.filter(tok => !tok.revokedAt)

    if (tokensQuery.isLoading) {
        return null
    }

    function startEditLabel(token: { id: string; label?: string | null }) {
        setEditingTokenId(token.id)
        setEditLabel(token.label ?? '')
    }

    return (
        <CollapsibleSection
            title={t('cloud.tokens.title')}
            description="Active enrollment tokens for this hub"
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
        >
            {activeTokens.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-[var(--cursor-text-secondary)]">
                    {t('cloud.tokens.empty')}
                </div>
            ) : (
                <div>
                    <div className="border-b border-[var(--cursor-stroke-secondary)] px-3 py-2 text-xs text-[var(--cursor-text-secondary)]">
                        Full tokens are shown only once at creation. Revoke and regenerate if needed.
                    </div>
                    {activeTokens.map((token) => {
                        const isExpired = token.expiresAt ? token.expiresAt < Date.now() : false
                        const isEditing = editingTokenId === token.id
                        return (
                            <div
                                key={token.id}
                                className="border-b border-[var(--cursor-stroke-secondary)] px-3 py-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 flex-col">
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <form
                                                    className="flex items-center gap-1"
                                                    onSubmit={(e) => {
                                                        e.preventDefault()
                                                        labelMutation.mutate({ tokenId: token.id, label: editLabel })
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={editLabel}
                                                        onChange={(e) => setEditLabel(e.target.value)}
                                                        placeholder="Label"
                                                        className="w-32 rounded border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--cursor-link)]"
                                                        autoFocus
                                                    />
                                                    <Button type="submit" size="sm" disabled={labelMutation.isPending}>
                                                        {labelMutation.isPending ? '...' : 'Save'}
                                                    </Button>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingTokenId(null)}>
                                                        Cancel
                                                    </Button>
                                                </form>
                                            ) : (
                                                <>
                                                    {token.label ? (
                                                        <span className="text-sm font-medium text-[var(--cursor-text-primary)]">{token.label}</span>
                                                    ) : (
                                                        <span className="text-sm text-[var(--cursor-text-secondary)] italic">no label</span>
                                                    )}
                                                    <code className="font-mono text-xs text-[var(--cursor-text-secondary)]">{token.tokenPreview}</code>
                                                    {isExpired ? (
                                                        <span className="rounded bg-[var(--cursor-badge-error-bg)] px-1.5 py-0.5 text-xs text-[var(--cursor-badge-error-text)]">
                                                            expired
                                                        </span>
                                                    ) : (
                                                        <span className="rounded bg-[var(--cursor-badge-success-bg)] px-1.5 py-0.5 text-xs text-[var(--cursor-badge-success-text)]">
                                                            active
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--cursor-text-secondary)]">
                                            <span>{t('cloud.tokens.created')} {formatDate(token.createdAt)}</span>
                                            {token.expiresAt ? (
                                                <span>{t('cloud.tokens.expires')} {formatDate(token.expiresAt)}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    {!isEditing ? (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => startEditLabel(token)}
                                            >
                                                Rename
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => extendMutation.mutate(token.id)}
                                                disabled={extendMutation.isPending}
                                            >
                                                {extendMutation.isPending ? '...' : '+1h'}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setRevokeTokenId(token.id)}
                                                disabled={revokeMutation.isPending}
                                            >
                                                {t('cloud.tokens.revoke')}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            <ConfirmDialog
                isOpen={!!revokeTokenId}
                onClose={() => setRevokeTokenId(null)}
                title={t('cloud.tokens.confirmRevoke')}
                description={t('cloud.tokens.confirmRevoke')}
                confirmLabel={t('cloud.tokens.revoke')}
                confirmingLabel={t('cloud.tokens.revoke')}
                onConfirm={async () => {
                    if (revokeTokenId) {
                        await revokeMutation.mutateAsync(revokeTokenId)
                    }
                }}
                isPending={revokeMutation.isPending}
                destructive
            />
        </CollapsibleSection>
    )
}

function WorkersEmptyState() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [starting, setStarting] = useState(false)
    const [startError, setStartError] = useState<string | null>(null)
    const [showLogs, setShowLogs] = useState(false)
    const logsEndRef = useRef<HTMLDivElement>(null)

    const localWorkerQuery = useQuery({
        queryKey: ['cloud-local-worker'],
        enabled: Boolean(api),
        refetchInterval: 3000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getLocalWorkerStatus()
        }
    })

    const localWorker = localWorkerQuery.data
    const hasLocalWorker = localWorker && (localWorker.running || (localWorker.logs?.length ?? 0) > 0)

    // Auto-scroll logs
    useEffect(() => {
        if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [localWorker?.logs?.length, showLogs])

    async function handleStartLocal() {
        if (!api) return
        setStarting(true)
        setStartError(null)
        try {
            await api.startLocalWorker()
            setShowLogs(true)
            void queryClient.invalidateQueries({ queryKey: ['cloud-local-worker'] })
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch (err) {
            setStartError(err instanceof Error ? err.message : 'Failed to start worker')
        } finally {
            setStarting(false)
        }
    }

    async function handleStopLocal() {
        if (!api) return
        try {
            await api.stopLocalWorker()
            void queryClient.invalidateQueries({ queryKey: ['cloud-local-worker'] })
        } catch { /* ignore */ }
    }

    return (
        <div className="px-3 py-4 text-sm text-[var(--cursor-text-secondary)]">
            <p className="text-center">{t('cloud.workers.empty')}</p>

            {/* Local worker status */}
            {hasLocalWorker ? (
                <div className="mt-3 rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-quiet)] p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${localWorker!.running ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                            <span className="text-sm font-medium text-[var(--cursor-text-primary)]">
                                Local Worker {localWorker!.running ? '(running)' : '(stopped)'}
                            </span>
                            {localWorker!.pid ? (
                                <span className="text-xs text-[var(--cursor-text-secondary)]">pid {localWorker!.pid}</span>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowLogs(v => !v)}
                            >
                                {showLogs ? 'Hide Logs' : 'Logs'}
                            </Button>
                            {localWorker!.running ? (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void handleStopLocal()}
                                >
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={() => void handleStartLocal()}
                                    disabled={starting}
                                >
                                    {starting ? 'Starting...' : 'Restart'}
                                </Button>
                            )}
                        </div>
                    </div>
                    {localWorker!.exitCode != null && localWorker!.exitCode !== 0 ? (
                        <div className="mt-1 text-xs text-[var(--cursor-badge-error-text)]">
                            Exited with code {localWorker!.exitCode}
                        </div>
                    ) : null}
                    {localWorker!.running ? (
                        <div className="mt-1 text-xs text-[var(--cursor-text-secondary)]">
                            Waiting for worker to finish enrollment and connect...
                        </div>
                    ) : null}
                    {showLogs && localWorker!.logs?.length ? (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded bg-black/80 p-2 font-mono text-xs text-[var(--success)]">
                            {localWorker!.logs.map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="mt-3 text-center">
                    <Button
                        size="sm"
                        onClick={() => void handleStartLocal()}
                        disabled={starting}
                    >
                        {starting ? 'Starting...' : 'Start Worker on This Machine'}
                    </Button>
                    {startError ? (
                        <p className="mt-2 text-[var(--cursor-badge-error-text)]">{startError}</p>
                    ) : null}
                </div>
            )}
        </div>
    )
}

function WorkerActions({ worker }: { worker: CloudWorkerSummary }) {
    const { api } = useAppContext()
    const queryClient = useQueryClient()
    const [stopping, setStopping] = useState(false)

    const localWorkerQuery = useQuery({
        queryKey: ['cloud-local-worker'],
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getLocalWorkerStatus()
        }
    })

    const isLocalWorker = localWorkerQuery.data?.running
        && worker.runnerState?.pid === localWorkerQuery.data?.pid

    async function handleStop() {
        if (!api) return
        setStopping(true)
        try {
            await api.stopLocalWorker()
            void queryClient.invalidateQueries({ queryKey: ['cloud-local-worker'] })
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch { /* ignore */ } finally {
            setStopping(false)
        }
    }

    return (
        <div className="flex items-center gap-1">
            {isLocalWorker ? (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleStop()}
                    disabled={stopping}
                >
                    {stopping ? 'Stopping...' : 'Stop'}
                </Button>
            ) : worker.active ? (
                <span className="text-xs text-[var(--cursor-text-secondary)]">remote</span>
            ) : null}
        </div>
    )
}

export default function CloudWorkersPage() {
    const { api, baseUrl } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [tokenLabel, setTokenLabel] = useState('')
    const [tokenTtl, setTokenTtl] = useState('1440')
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)
    const [copiedField, setCopiedField] = useState<string | null>(null)
    const [addWorkerExpanded, setAddWorkerExpanded] = useState(true)
    const [workersExpanded, setWorkersExpanded] = useState(true)

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        refetchInterval: 5000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        }
    })

    const tokenMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.createCloudWorkerEnrollmentToken({
                label: tokenLabel.trim() || undefined,
                ttlMinutes: tokenTtl.trim() ? Number(tokenTtl.trim()) : undefined
            })
        },
        onSuccess: async (result) => {
            setGeneratedToken(result.token)
            setTokenLabel('')
            setCopiedField(null)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        }
    })

    const hubUrl = baseUrl || window.location.origin
    const installCommand = generatedToken
        ? `haqi worker start --token ${generatedToken} --hub-url ${hubUrl}`
        : ''

    function handleCopy(text: string, field: string) {
        void navigator.clipboard?.writeText(text).then(() => {
            setCopiedField(field)
            setTimeout(() => setCopiedField(null), 2000)
        }).catch(() => undefined)
    }

    if (workersQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    if (workersQuery.isError) {
        return <div className="p-4 text-sm text-[var(--cursor-badge-error-text)]">Failed to load workers</div>
    }

    const workers: CloudWorkerSummary[] = workersQuery.data?.workers ?? []

    return (
        <div className="mx-auto w-full max-w-content">
            <CollapsibleSection
                title="Add Worker"
                description="Generate an enrollment token and use it to connect a new worker to this hub."
                isExpanded={addWorkerExpanded}
                onToggle={() => setAddWorkerExpanded(!addWorkerExpanded)}
            >
                <div className="px-3 pb-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[14rem] flex-1">
                            <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                                Label (optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. gpu-worker-1"
                                value={tokenLabel}
                                onChange={(event) => setTokenLabel(event.target.value)}
                                className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                            />
                        </div>
                        <div className="w-28">
                            <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                                TTL (min)
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={tokenTtl}
                                onChange={(event) => setTokenTtl(event.target.value)}
                                className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => tokenMutation.mutate()}
                            disabled={tokenMutation.isPending}
                        >
                            {tokenMutation.isPending ? 'Generating...' : 'Generate Token'}
                        </Button>
                    </div>
                    {tokenMutation.error instanceof Error ? (
                        <div className="mt-2 text-sm text-[var(--cursor-badge-error-text)]">{tokenMutation.error.message}</div>
                    ) : null}
                    {generatedToken ? (
                        <div className="mt-3 rounded-md border border-[var(--cursor-badge-success-border)] bg-[var(--cursor-badge-success-bg)] p-3">
                            <div className="text-sm font-medium text-[var(--cursor-badge-success-text)]">
                                Token generated — copy it now, it will not be shown again.
                            </div>
                            <div className="mt-2 flex items-start gap-2">
                                <code className="flex-1 break-all rounded bg-black/5 px-2 py-1 font-mono text-xs">
                                    {generatedToken}
                                </code>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopy(generatedToken, 'token')}
                                >
                                    {copiedField === 'token' ? 'Copied' : 'Copy Token'}
                                </Button>
                            </div>
                            <div className="mt-3">
                                <div className="text-xs font-medium text-[var(--cursor-text-secondary)]">Install command:</div>
                                <div className="mt-1 flex items-start gap-2">
                                    <code className="flex-1 break-all rounded bg-black/5 px-2 py-1 font-mono text-xs">
                                        {installCommand}
                                    </code>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCopy(installCommand, 'cmd')}
                                    >
                                        {copiedField === 'cmd' ? 'Copied' : 'Copy Command'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </CollapsibleSection>

            <EnrollmentTokensSection />

            <CollapsibleSection
                title="Workers"
                description={`${workers.length} worker${workers.length !== 1 ? 's' : ''} registered`}
                isExpanded={workersExpanded}
                onToggle={() => setWorkersExpanded(!workersExpanded)}
            >
                {workers.length === 0 ? (
                    <WorkersEmptyState />
                ) : (
                    <div>
                        {workers.map((worker) => (
                            <div
                                key={worker.machineId}
                                className="border-b border-[var(--cursor-stroke-secondary)] px-3 py-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${
                                                worker.active
                                                    ? 'bg-[var(--success)]'
                                                    : 'bg-[var(--cursor-text-secondary)]'
                                            }`}
                                        />
                                        <span className="font-mono text-sm font-medium text-[var(--cursor-text-primary)]">{worker.machineId}</span>
                                        {worker.provider ? (
                                            <span className="text-xs text-[var(--cursor-text-secondary)]">{worker.provider}</span>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {worker.lifecycle ? (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--cursor-badge-info-bg)] text-[var(--cursor-badge-info-text)]">
                                                {worker.lifecycle}
                                            </span>
                                        ) : null}
                                        <span className="text-xs text-[var(--cursor-text-secondary)]">
                                            {formatLastSeen(worker.updatedAt)}
                                        </span>
                                        <WorkerActions worker={worker} />
                                    </div>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-4 text-xs text-[var(--cursor-text-secondary)]">
                                    {worker.region ? (
                                        <span>
                                            <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.workers.region')}</span>{' '}
                                            {worker.region}
                                        </span>
                                    ) : null}
                                    {worker.workerVersion ? (
                                        <span>
                                            <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.workers.version')}</span>{' '}
                                            {worker.workerVersion}
                                        </span>
                                    ) : null}
                                    {worker.resources?.cpu != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.workers.cpu')}</span>{' '}
                                            {worker.resources.cpu} cores
                                        </span>
                                    ) : null}
                                    {worker.resources?.memoryMb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.workers.memory')}</span>{' '}
                                            {formatMemory(worker.resources.memoryMb)}
                                        </span>
                                    ) : null}
                                    {worker.resources?.diskGb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--cursor-text-primary)]">{t('cloud.workers.disk')}</span>{' '}
                                            {worker.resources.diskGb} GB
                                        </span>
                                    ) : null}
                                </div>
                                {worker.labels && worker.labels.length > 0 ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                                        {worker.labels.map((label) => (
                                            <span
                                                key={label}
                                                className="rounded bg-[var(--cursor-bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--cursor-text-secondary)]"
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>
        </div>
    )
}
