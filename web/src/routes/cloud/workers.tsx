import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
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

function EnrollmentTokensSection() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

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

    const tokens = tokensQuery.data?.tokens ?? []
    const activeTokens = tokens.filter(tok => !tok.revokedAt)

    if (tokensQuery.isLoading) {
        return null
    }

    return (
        <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <h2 className="text-sm font-semibold">{t('cloud.tokens.title')}</h2>
            {activeTokens.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--app-hint)]">{t('cloud.tokens.empty')}</p>
            ) : (
                <div className="mt-3 grid gap-2">
                    {activeTokens.map((token) => (
                        <div
                            key={token.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2"
                        >
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                {token.label ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.tokens.label')}</span>{' '}
                                        {token.label}
                                    </span>
                                ) : null}
                                <span>
                                    <span className="font-medium text-[var(--app-fg)]">{t('cloud.tokens.preview')}</span>{' '}
                                    <code className="font-mono">{token.tokenPreview}</code>
                                </span>
                                <span>
                                    <span className="font-medium text-[var(--app-fg)]">{t('cloud.tokens.created')}</span>{' '}
                                    {formatDate(token.createdAt)}
                                </span>
                                {token.expiresAt ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.tokens.expires')}</span>{' '}
                                        {formatDate(token.expiresAt)}
                                    </span>
                                ) : null}
                            </div>
                            <button
                                onClick={() => {
                                    if (window.confirm(t('cloud.tokens.confirmRevoke'))) {
                                        revokeMutation.mutate(token.id)
                                    }
                                }}
                                disabled={revokeMutation.isPending}
                                className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-700 hover:bg-red-500/25 disabled:opacity-50"
                            >
                                {t('cloud.tokens.revoke')}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

export default function CloudWorkersPage() {
    const { api, baseUrl } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [tokenLabel, setTokenLabel] = useState('')
    const [tokenTtl, setTokenTtl] = useState('60')
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
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
            setCopied(false)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        }
    })

    const hubUrl = baseUrl || window.location.origin
    const installCommand = generatedToken
        ? `haqi worker start --token ${generatedToken} --hub-url ${hubUrl}`
        : ''

    function handleCopy(text: string) {
        void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
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
        return <div className="p-4 text-sm text-red-500">Failed to load workers</div>
    }

    const workers: CloudWorkerSummary[] = workersQuery.data?.workers ?? []

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">{t('cloud.workers.title')}</h1>
            </div>

            <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                <h2 className="text-sm font-semibold">Add Worker</h2>
                <p className="mt-1 text-xs text-[var(--app-hint)]">
                    Generate an enrollment token and use it to connect a new worker to this hub.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                            Label (optional)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. gpu-worker-1"
                            value={tokenLabel}
                            onChange={(event) => setTokenLabel(event.target.value)}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                        />
                    </div>
                    <div className="w-28">
                        <label className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                            TTL (min)
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={tokenTtl}
                            onChange={(event) => setTokenTtl(event.target.value)}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={() => tokenMutation.mutate()}
                        disabled={tokenMutation.isPending}
                    >
                        {tokenMutation.isPending ? 'Generating…' : 'Generate Token'}
                    </Button>
                </div>
                {tokenMutation.error instanceof Error ? (
                    <div className="mt-2 text-sm text-red-600">{tokenMutation.error.message}</div>
                ) : null}
                {generatedToken ? (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                        <div className="text-sm font-medium text-emerald-700">
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
                                onClick={() => handleCopy(generatedToken)}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </div>
                        <div className="mt-3">
                            <div className="text-xs font-medium text-[var(--app-hint)]">Install command:</div>
                            <div className="mt-1 flex items-start gap-2">
                                <code className="flex-1 break-all rounded bg-black/5 px-2 py-1 font-mono text-xs">
                                    {installCommand}
                                </code>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopy(installCommand)}
                                >
                                    Copy
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </section>

            <EnrollmentTokensSection />

            {workers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
                    <div className="text-sm font-medium">{t('cloud.workers.empty')}</div>
                    <div className="mt-1 text-sm text-[var(--app-hint)]">
                        {t('cloud.workers.empty.hint')}{' '}
                        <Link to="/cloud/secrets" className="underline hover:no-underline">
                            {t('cloud.workers.empty.link')}
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {workers.map((worker) => (
                        <div
                            key={worker.machineId}
                            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                            worker.active
                                                ? 'bg-emerald-500/15 text-emerald-700'
                                                : 'bg-[var(--app-bg-secondary)] text-[var(--app-hint)]'
                                        }`}
                                    >
                                        {worker.active ? t('cloud.workers.status.online') : t('cloud.workers.status.offline')}
                                    </span>
                                    <span className="font-mono text-sm font-medium">{worker.machineId}</span>
                                </div>
                                <div className="text-xs text-[var(--app-hint)]">
                                    {t('cloud.workers.lastSeen')}: {formatLastSeen(worker.updatedAt)}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                {worker.provider ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.provider')}</span>{' '}
                                        {worker.provider}
                                    </span>
                                ) : null}
                                {worker.lifecycle ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.lifecycle')}</span>{' '}
                                        {worker.lifecycle}
                                    </span>
                                ) : null}
                                {worker.region ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.region')}</span>{' '}
                                        {worker.region}
                                    </span>
                                ) : null}
                                {worker.workerVersion ? (
                                    <span>
                                        <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.version')}</span>{' '}
                                        {worker.workerVersion}
                                    </span>
                                ) : null}
                            </div>

                            {worker.resources ? (
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-hint)]">
                                    {worker.resources.cpu != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.cpu')}</span>{' '}
                                            {worker.resources.cpu} cores
                                        </span>
                                    ) : null}
                                    {worker.resources.memoryMb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.memory')}</span>{' '}
                                            {formatMemory(worker.resources.memoryMb)}
                                        </span>
                                    ) : null}
                                    {worker.resources.diskGb != null ? (
                                        <span>
                                            <span className="font-medium text-[var(--app-fg)]">{t('cloud.workers.disk')}</span>{' '}
                                            {worker.resources.diskGb} GB
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {worker.labels && worker.labels.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {worker.labels.map((label) => (
                                        <span
                                            key={label}
                                            className="rounded bg-[var(--app-bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--app-hint)]"
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
        </div>
    )
}
