import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import {
    CursorButton,
    CursorCollapsibleSection,
    CursorCodeBlock,
    CursorEmptyState,
    CursorExpandableRow,
    CursorFieldLabel,
    CursorInlineCode,
    CursorNotice,
    CursorSettingsBadge,
    CursorSettingsHeader,
    CursorSettingsSection,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'
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
        <CursorCollapsibleSection
            title={t('cloud.tokens.title')}
            description="Active enrollment tokens for this hub"
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
        >
            {activeTokens.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] leading-[18px] text-[var(--text-secondary)]">{t('cloud.tokens.empty')}</div>
            ) : (
                <div>
                    <div className="border-b border-[var(--border-tertiary)] px-4 py-3 text-[12px] leading-4 text-[var(--text-secondary)]">
                        Full tokens are shown only once at creation. Revoke and regenerate if needed.
                    </div>
                    {activeTokens.map((token) => {
                        const isExpired = token.expiresAt ? token.expiresAt < Date.now() : false
                        const isEditing = editingTokenId === token.id
                        return (
                            <div
                                key={token.id}
                                className="border-b border-[var(--border-tertiary)] px-4 py-4 last:border-b-0"
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
                                                    <CursorTextField
                                                        type="text"
                                                        value={editLabel}
                                                        onChange={(e) => setEditLabel(e.target.value)}
                                                        placeholder="Label"
                                                        compact
                                                        className="w-32"
                                                        autoFocus
                                                    />
                                                    <CursorButton type="submit" size="sm" disabled={labelMutation.isPending}>
                                                        {labelMutation.isPending ? '...' : 'Save'}
                                                    </CursorButton>
                                                    <CursorButton type="button" variant="outline" size="sm" onClick={() => setEditingTokenId(null)}>
                                                        Cancel
                                                    </CursorButton>
                                                </form>
                                            ) : (
                                                <>
                                                    {token.label ? (
                                                        <span className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">{token.label}</span>
                                                    ) : (
                                                        <span className="text-[13px] leading-[18px] italic text-[var(--text-secondary)]">no label</span>
                                                    )}
                                                    <CursorInlineCode>{token.tokenPreview}</CursorInlineCode>
                                                    {isExpired ? (
                                                        <CursorSettingsBadge tone="danger">expired</CursorSettingsBadge>
                                                    ) : (
                                                        <CursorSettingsBadge tone="success">active</CursorSettingsBadge>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                            <span>{t('cloud.tokens.created')} {formatDate(token.createdAt)}</span>
                                            {token.expiresAt ? (
                                                <span>{t('cloud.tokens.expires')} {formatDate(token.expiresAt)}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    {!isEditing ? (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <CursorButton
                                                variant="outline"
                                                size="sm"
                                                onClick={() => startEditLabel(token)}
                                            >
                                                Rename
                                            </CursorButton>
                                            <CursorButton
                                                variant="outline"
                                                size="sm"
                                                onClick={() => extendMutation.mutate(token.id)}
                                                disabled={extendMutation.isPending}
                                            >
                                                {extendMutation.isPending ? '...' : '+1h'}
                                            </CursorButton>
                                            <CursorButton
                                                variant="danger"
                                                size="sm"
                                                onClick={() => setRevokeTokenId(token.id)}
                                                disabled={revokeMutation.isPending}
                                            >
                                                {t('cloud.tokens.revoke')}
                                            </CursorButton>
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
        </CursorCollapsibleSection>
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
        <div className="px-4 py-4">
            <CursorEmptyState
                title={t('cloud.workers.empty')}
                description="No workers connected yet. Start a local worker here or enroll a remote machine with a generated token."
                className="border-dashed bg-[var(--bg-quinary)] py-8"
            />

            {/* Local worker status */}
            {hasLocalWorker ? (
                <div className="mt-4 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-quinary)] p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${localWorker!.running ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                            <span className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">
                                Local Worker {localWorker!.running ? '(running)' : '(stopped)'}
                            </span>
                            {localWorker!.pid ? (
                                <span className="text-[12px] leading-4 text-[var(--text-secondary)]">pid {localWorker!.pid}</span>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                            <CursorButton
                                variant="outline"
                                size="sm"
                                onClick={() => setShowLogs(v => !v)}
                            >
                                {showLogs ? 'Hide Logs' : 'Logs'}
                            </CursorButton>
                            {localWorker!.running ? (
                                <CursorButton
                                    variant="danger"
                                    size="sm"
                                    onClick={() => void handleStopLocal()}
                                >
                                    Stop
                                </CursorButton>
                            ) : (
                                <CursorButton
                                    size="sm"
                                    onClick={() => void handleStartLocal()}
                                    disabled={starting}
                                >
                                    {starting ? 'Starting...' : 'Restart'}
                                </CursorButton>
                            )}
                        </div>
                    </div>
                    {localWorker!.exitCode != null && localWorker!.exitCode !== 0 ? (
                        <div className="mt-2 text-[12px] leading-4 text-[var(--danger)]">
                            Exited with code {localWorker!.exitCode}
                        </div>
                    ) : null}
                    {localWorker!.running ? (
                        <div className="mt-2 text-[12px] leading-4 text-[var(--text-secondary)]">
                            Waiting for worker to finish enrollment and connect...
                        </div>
                    ) : null}
                    {showLogs && localWorker!.logs?.length ? (
                        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-[var(--border-tertiary)] bg-black/85 p-3 font-[var(--font-mono)] text-[12px] leading-4 text-[var(--success)]">
                            {localWorker!.logs.map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="mt-4 flex justify-center">
                    <CursorButton
                        size="sm"
                        onClick={() => void handleStartLocal()}
                        disabled={starting}
                    >
                        {starting ? 'Starting...' : 'Start Worker on This Machine'}
                    </CursorButton>
                    {startError ? (
                        <p className="ml-3 text-[13px] leading-[18px] text-[var(--danger)]">{startError}</p>
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
                <CursorButton
                    variant="danger"
                    size="sm"
                    onClick={() => void handleStop()}
                    disabled={stopping}
                >
                    {stopping ? 'Stopping...' : 'Stop'}
                </CursorButton>
            ) : worker.active ? (
                <CursorSettingsBadge>remote</CursorSettingsBadge>
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
            <CursorSettingsHeader
                title="Workers"
                description="Self-hosted cloud workers enrolled to this hub. Generate tokens, start a local worker, and inspect connected capacity."
            />

            <CursorSettingsSection className="space-y-4">
                <CursorCollapsibleSection
                    title="Add Worker"
                    description="Generate an enrollment token and use it to connect a new worker to this hub."
                    isExpanded={addWorkerExpanded}
                    onToggle={() => setAddWorkerExpanded(!addWorkerExpanded)}
                >
                    <div className="px-4 pb-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[14rem] flex-1">
                                <div className="mb-1">
                                    <CursorFieldLabel>Label (optional)</CursorFieldLabel>
                                </div>
                                <CursorTextField
                                    type="text"
                                    placeholder="e.g. gpu-worker-1"
                                    value={tokenLabel}
                                    onChange={(event) => setTokenLabel(event.target.value)}
                                />
                            </div>
                            <div className="w-28">
                                <div className="mb-1">
                                    <CursorFieldLabel>TTL (min)</CursorFieldLabel>
                                </div>
                                <CursorTextField
                                    type="number"
                                    min={1}
                                    value={tokenTtl}
                                    onChange={(event) => setTokenTtl(event.target.value)}
                                />
                            </div>
                            <CursorButton
                                type="button"
                                size="sm"
                                onClick={() => tokenMutation.mutate()}
                                disabled={tokenMutation.isPending}
                            >
                                {tokenMutation.isPending ? 'Generating...' : 'Generate Token'}
                            </CursorButton>
                        </div>
                        {tokenMutation.error instanceof Error ? (
                            <CursorNotice tone="danger" className="mt-3">
                                {tokenMutation.error.message}
                            </CursorNotice>
                        ) : null}
                        {generatedToken ? (
                            <div className="mt-4 rounded-lg border border-[var(--border-success)] bg-[var(--bg-success-quaternary)] p-4">
                                <div className="text-[13px] leading-[18px] font-semibold text-[var(--success)]">
                                    Token generated. Copy it now; it will not be shown again.
                                </div>
                                <div className="mt-3 flex items-start gap-2">
                                    <CursorCodeBlock>
                                        {generatedToken}
                                    </CursorCodeBlock>
                                    <CursorButton
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCopy(generatedToken, 'token')}
                                    >
                                        {copiedField === 'token' ? 'Copied' : 'Copy Token'}
                                    </CursorButton>
                                </div>
                                <div className="mt-4">
                                    <CursorFieldLabel>Install command</CursorFieldLabel>
                                    <div className="mt-2 flex items-start gap-2">
                                        <CursorCodeBlock>
                                            {installCommand}
                                        </CursorCodeBlock>
                                        <CursorButton
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleCopy(installCommand, 'cmd')}
                                        >
                                            {copiedField === 'cmd' ? 'Copied' : 'Copy Command'}
                                        </CursorButton>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </CursorCollapsibleSection>

                <EnrollmentTokensSection />

                <CursorCollapsibleSection
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
                                <CursorExpandableRow
                                    key={worker.machineId}
                                    defaultOpen={false}
                                    title={(
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span
                                                className={`h-2 w-2 shrink-0 rounded-full ${
                                                    worker.active ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'
                                                }`}
                                            />
                                            <span className="font-[var(--font-mono)] text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">{worker.machineId}</span>
                                            {worker.provider ? (
                                                <span className="text-[12px] leading-4 text-[var(--text-secondary)]">{worker.provider}</span>
                                            ) : null}
                                        </div>
                                    )}
                                    description={(
                                        <div className="flex items-center gap-2">
                                            {worker.lifecycle ? (
                                                <CursorSettingsBadge tone="accent">{worker.lifecycle}</CursorSettingsBadge>
                                            ) : null}
                                            <span className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                {formatLastSeen(worker.updatedAt)}
                                            </span>
                                        </div>
                                    )}
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                                {worker.region ? (
                                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.workers.region')}</span>{' '}
                                                        {worker.region}
                                                    </div>
                                                ) : null}
                                                {worker.workerVersion ? (
                                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.workers.version')}</span>{' '}
                                                        {worker.workerVersion}
                                                    </div>
                                                ) : null}
                                                {worker.resources?.cpu != null ? (
                                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.workers.cpu')}</span>{' '}
                                                        {worker.resources.cpu} cores
                                                    </div>
                                                ) : null}
                                                {worker.resources?.memoryMb != null ? (
                                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.workers.memory')}</span>{' '}
                                                        {formatMemory(worker.resources.memoryMb)}
                                                    </div>
                                                ) : null}
                                                {worker.resources?.diskGb != null ? (
                                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                                                        <span className="font-medium text-[var(--text-primary)]">{t('cloud.workers.disk')}</span>{' '}
                                                        {worker.resources.diskGb} GB
                                                    </div>
                                                ) : null}
                                            </div>
                                            <WorkerActions worker={worker} />
                                        </div>
                                        {worker.labels && worker.labels.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {worker.labels.map((label) => (
                                                    <CursorSettingsBadge key={label}>{label}</CursorSettingsBadge>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </CursorExpandableRow>
                            ))}
                        </div>
                    )}
                </CursorCollapsibleSection>
            </CursorSettingsSection>
        </div>
    )
}
