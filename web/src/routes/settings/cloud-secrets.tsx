import { useMemo, useState, useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'

type SecretDraft = {
    id?: string
    name: string
    value: string
    description: string
    mountAs: 'env' | 'file'
    envName: string
    filePath: string
    adapter: 'generic' | 'git' | 'claude' | 'gemini' | 'codex'
}

const EMPTY_DRAFT: SecretDraft = {
    name: '',
    value: '',
    description: '',
    mountAs: 'env',
    envName: '',
    filePath: '',
    adapter: 'generic'
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

export default function CloudSecretsPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [draft, setDraft] = useState<SecretDraft>(EMPTY_DRAFT)
    const [lastIssuedToken, setLastIssuedToken] = useState<string | null>(null)
    const [tokenLabel, setTokenLabel] = useState('')
    const [tokenTtl, setTokenTtl] = useState('60')
    const [deleteSecretId, setDeleteSecretId] = useState<string | null>(null)
    const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null)
    const [secretsExpanded, setSecretsExpanded] = useState(true)
    const [createExpanded, setCreateExpanded] = useState(false)
    const [tokensExpanded, setTokensExpanded] = useState(true)

    const secretsQuery = useQuery({
        queryKey: queryKeys.cloudSecrets,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudSecrets()
        }
    })

    const tokensQuery = useQuery({
        queryKey: queryKeys.cloudWorkerEnrollmentTokens,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getCloudWorkerEnrollmentTokens()
        }
    })

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            const payload = {
                name: draft.name,
                value: draft.value || undefined,
                description: draft.description || undefined,
                mountAs: draft.mountAs,
                envName: draft.envName || undefined,
                filePath: draft.filePath || undefined,
                adapter: draft.adapter
            }
            if (draft.id) {
                return await api.updateCloudSecret(draft.id, payload)
            }
            if (!payload.value) {
                throw new Error('Value is required for new secrets')
            }
            return await api.createCloudSecret({
                ...payload,
                value: payload.value
            })
        },
        onSuccess: async () => {
            setDraft(EMPTY_DRAFT)
            setCreateExpanded(false)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudSecrets })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (secretId: string) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.deleteCloudSecret(secretId)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudSecrets })
        }
    })

    const tokenMutation = useMutation({
        mutationFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.createCloudWorkerEnrollmentToken({
                label: tokenLabel || undefined,
                ttlMinutes: tokenTtl.trim() ? Number(tokenTtl.trim()) : undefined
            })
        },
        onSuccess: async (result) => {
            setLastIssuedToken(result.token)
            setTokenLabel('')
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        }
    })

    const revokeTokenMutation = useMutation({
        mutationFn: async (tokenId: string) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.revokeCloudWorkerEnrollmentToken(tokenId)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        }
    })

    const secrets = secretsQuery.data?.secrets ?? []
    const tokens = tokensQuery.data?.tokens ?? []
    const submitLabel = draft.id ? 'Update secret' : 'Create secret'
    const helperText = useMemo(() => {
        if (draft.adapter === 'claude') {
            return 'Maps to CLAUDE_CODE_OAUTH_TOKEN'
        }
        if (draft.adapter === 'gemini') {
            return draft.mountAs === 'env' ? 'Maps to GEMINI_API_KEY by default' : 'File path can be exported through envName'
        }
        if (draft.adapter === 'codex') {
            return 'Stores auth.json in a temporary CODEX_HOME'
        }
        if (draft.adapter === 'git') {
            return 'Used for private repo clone/fetch'
        }
        return draft.mountAs === 'env' ? 'Secret value exposed as env var' : 'Secret value written to a temporary file'
    }, [draft.adapter, draft.mountAs])

    if (secretsQuery.isLoading && tokensQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <LoadingState label={t('loading')} />
            </div>
        )
    }

    return (
        <>
            <div className="mx-auto w-full max-w-content">
                <CollapsibleSection
                    title="Secrets"
                    description={`${secrets.length} secret${secrets.length !== 1 ? 's' : ''} configured`}
                    isExpanded={secretsExpanded}
                    onToggle={() => setSecretsExpanded(!secretsExpanded)}
                >
                    {secrets.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-[var(--app-hint)]">
                            No cloud secrets yet.
                        </div>
                    ) : (
                        <div>
                            {secrets.map((secret) => (
                                <div
                                    key={secret.id}
                                    className="flex items-start justify-between gap-3 border-b border-[var(--app-divider)] px-3 py-3"
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <span className="text-sm font-medium text-[var(--app-fg)]">{secret.name}</span>
                                        <span className="mt-0.5 text-xs text-[var(--app-hint)]">
                                            {secret.adapter ?? 'generic'} · {secret.mountAs ?? 'env'}
                                            {secret.envName ? ` · ${secret.envName}` : ''}
                                            {secret.filePath ? ` · ${secret.filePath}` : ''}
                                        </span>
                                        {secret.description ? (
                                            <span className="mt-0.5 text-xs text-[var(--app-hint)]">{secret.description}</span>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setDraft({
                                                    id: secret.id,
                                                    name: secret.name,
                                                    value: '',
                                                    description: secret.description ?? '',
                                                    mountAs: secret.mountAs ?? 'env',
                                                    envName: secret.envName ?? '',
                                                    filePath: secret.filePath ?? '',
                                                    adapter: secret.adapter ?? 'generic'
                                                })
                                                setCreateExpanded(true)
                                            }}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                void navigator.clipboard?.writeText(secret.name).catch(() => undefined)
                                            }}
                                        >
                                            Copy ref
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => setDeleteSecretId(secret.id)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CollapsibleSection>

                <CollapsibleSection
                    title={submitLabel}
                    description="Add or update a cloud secret for worker containers"
                    isExpanded={createExpanded}
                    onToggle={() => setCreateExpanded(!createExpanded)}
                >
                    <div className="px-3 pb-3">
                        <div className="grid gap-3 text-sm">
                            <input
                                type="text"
                                placeholder="Secret name"
                                value={draft.name}
                                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            />
                            <textarea
                                placeholder={draft.id ? 'Leave empty to keep current value' : 'Secret value'}
                                value={draft.value}
                                onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
                                rows={4}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            />
                            <textarea
                                placeholder="Description"
                                value={draft.description}
                                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                                rows={2}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <select
                                    value={draft.adapter}
                                    onChange={(event) => setDraft((current) => ({ ...current, adapter: event.target.value as SecretDraft['adapter'] }))}
                                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                                >
                                    <option value="generic">generic</option>
                                    <option value="git">git</option>
                                    <option value="claude">claude</option>
                                    <option value="gemini">gemini</option>
                                    <option value="codex">codex</option>
                                </select>
                                <select
                                    value={draft.mountAs}
                                    onChange={(event) => setDraft((current) => ({ ...current, mountAs: event.target.value as SecretDraft['mountAs'] }))}
                                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                                >
                                    <option value="env">env</option>
                                    <option value="file">file</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                placeholder="Env name (optional)"
                                value={draft.envName}
                                onChange={(event) => setDraft((current) => ({ ...current, envName: event.target.value }))}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            />
                            <input
                                type="text"
                                placeholder="File path inside temp mount (optional)"
                                value={draft.filePath}
                                onChange={(event) => setDraft((current) => ({ ...current, filePath: event.target.value }))}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            />
                            <div className="text-xs text-[var(--app-hint)]">{helperText}</div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => saveMutation.mutate()}
                                    disabled={saveMutation.isPending || !draft.name.trim()}
                                >
                                    {submitLabel}
                                </Button>
                                {draft.id ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setDraft(EMPTY_DRAFT)}
                                    >
                                        {t('button.cancel')}
                                    </Button>
                                ) : null}
                            </div>
                            {saveMutation.error instanceof Error ? (
                                <div className="text-sm text-[var(--app-badge-error-text)]">{saveMutation.error.message}</div>
                            ) : null}
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title={t('cloud.tokens.title')}
                    description="Enrollment tokens for connecting workers"
                    isExpanded={tokensExpanded}
                    onToggle={() => setTokensExpanded(!tokensExpanded)}
                >
                    <div className="border-b border-[var(--app-divider)] px-3 pb-3">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[14rem] flex-1">
                                <label className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                                    Token label
                                </label>
                                <input
                                    type="text"
                                    placeholder="Token label"
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
                            <Button type="button" size="sm" onClick={() => tokenMutation.mutate()} disabled={tokenMutation.isPending}>
                                Mint token
                            </Button>
                        </div>
                        {lastIssuedToken ? (
                            <div className="mt-3 rounded-md border border-[var(--app-badge-success-border)] bg-[var(--app-badge-success-bg)] p-3 text-sm text-[var(--app-badge-success-text)]">
                                <div className="font-medium">Copy this token now</div>
                                <div className="mt-1 break-all font-mono text-xs">{lastIssuedToken}</div>
                            </div>
                        ) : null}
                    </div>
                    {tokens.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-[var(--app-hint)]">
                            {t('cloud.tokens.empty')}
                        </div>
                    ) : (
                        <div>
                            {tokens.map((token) => (
                                <div
                                    key={token.id}
                                    className="flex items-start justify-between gap-3 border-b border-[var(--app-divider)] px-3 py-3"
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <span className="text-sm font-medium text-[var(--app-fg)]">
                                            {token.label ?? token.tokenPreview}
                                        </span>
                                        <span className="mt-0.5 text-xs text-[var(--app-hint)]">
                                            {token.tokenPreview}
                                            {token.expiresAt ? ` · expires ${new Date(token.expiresAt).toLocaleString()}` : ''}
                                            {token.revokedAt ? ' · revoked' : ''}
                                        </span>
                                    </div>
                                    {!token.revokedAt ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => setRevokeTokenId(token.id)}
                                            disabled={revokeTokenMutation.isPending}
                                        >
                                            {t('cloud.tokens.revoke')}
                                        </Button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </CollapsibleSection>
            </div>
            <ConfirmDialog
                isOpen={!!deleteSecretId}
                onClose={() => setDeleteSecretId(null)}
                title="Delete secret?"
                description="This action cannot be undone."
                confirmLabel="Delete"
                confirmingLabel="Deleting..."
                onConfirm={async () => {
                    if (deleteSecretId) {
                        await deleteMutation.mutateAsync(deleteSecretId)
                    }
                }}
                isPending={deleteMutation.isPending}
                destructive
            />
            <ConfirmDialog
                isOpen={!!revokeTokenId}
                onClose={() => setRevokeTokenId(null)}
                title={t('cloud.tokens.revoke')}
                description={t('cloud.tokens.confirmRevoke')}
                confirmLabel={t('cloud.tokens.revoke')}
                confirmingLabel={t('cloud.tokens.revoke')}
                onConfirm={async () => {
                    if (revokeTokenId) {
                        await revokeTokenMutation.mutateAsync(revokeTokenId)
                    }
                }}
                isPending={revokeTokenMutation.isPending}
                destructive
            />
        </>
    )
}
