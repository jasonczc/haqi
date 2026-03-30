import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'

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

export default function CloudSecretsPage() {
    const { api } = useAppContext()
    const queryClient = useQueryClient()
    const [draft, setDraft] = useState<SecretDraft>(EMPTY_DRAFT)
    const [lastIssuedToken, setLastIssuedToken] = useState<string | null>(null)
    const [tokenLabel, setTokenLabel] = useState('')
    const [tokenTtl, setTokenTtl] = useState('60')

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
                <LoadingState label="Loading cloud secrets…" />
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
            <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">Cloud</div>
                <h1 className="text-xl font-semibold">Secrets & Worker Enrollment</h1>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                    <h2 className="text-sm font-semibold">Secret Catalog</h2>
                    <div className="mt-3 grid gap-3">
                        {secrets.map((secret) => (
                            <div key={secret.id} className="rounded-md border border-[var(--app-border)] p-3 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{secret.name}</div>
                                        <div className="mt-1 text-xs text-[var(--app-hint)]">
                                            {secret.adapter ?? 'generic'} · {secret.mountAs ?? 'env'}
                                            {secret.envName ? ` · ${secret.envName}` : ''}
                                            {secret.filePath ? ` · ${secret.filePath}` : ''}
                                        </div>
                                        {secret.description ? (
                                            <div className="mt-2 text-[var(--app-hint)]">{secret.description}</div>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
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
                                            variant="outline"
                                            onClick={() => deleteMutation.mutate(secret.id)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {secrets.length === 0 ? (
                            <div className="rounded-md border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-hint)]">
                                No cloud secrets yet.
                            </div>
                        ) : null}
                    </div>
                </section>

                <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                    <h2 className="text-sm font-semibold">{submitLabel}</h2>
                    <div className="mt-3 grid gap-3 text-sm">
                        <input
                            type="text"
                            placeholder="Secret name"
                            value={draft.name}
                            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                        />
                        <textarea
                            placeholder={draft.id ? 'Leave empty to keep current value' : 'Secret value'}
                            value={draft.value}
                            onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
                            rows={4}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                        />
                        <textarea
                            placeholder="Description"
                            value={draft.description}
                            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                            rows={2}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <select
                                value={draft.adapter}
                                onChange={(event) => setDraft((current) => ({ ...current, adapter: event.target.value as SecretDraft['adapter'] }))}
                                className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
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
                                className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
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
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                        />
                        <input
                            type="text"
                            placeholder="File path inside temp mount (optional)"
                            value={draft.filePath}
                            onChange={(event) => setDraft((current) => ({ ...current, filePath: event.target.value }))}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
                        />
                        <div className="text-xs text-[var(--app-hint)]">{helperText}</div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending || !draft.name.trim()}
                            >
                                {submitLabel}
                            </Button>
                            {draft.id ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setDraft(EMPTY_DRAFT)}
                                >
                                    Cancel edit
                                </Button>
                            ) : null}
                        </div>
                        {saveMutation.error instanceof Error ? (
                            <div className="text-sm text-red-600">{saveMutation.error.message}</div>
                        ) : null}
                    </div>
                </section>
            </div>

            <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                        <div className="mb-1 text-sm font-semibold">Worker enrollment tokens</div>
                        <input
                            type="text"
                            placeholder="Token label"
                            value={tokenLabel}
                            onChange={(event) => setTokenLabel(event.target.value)}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm"
                        />
                    </div>
                    <div className="w-28">
                        <div className="mb-1 text-sm font-semibold">TTL (min)</div>
                        <input
                            type="number"
                            min={1}
                            value={tokenTtl}
                            onChange={(event) => setTokenTtl(event.target.value)}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm"
                        />
                    </div>
                    <Button type="button" onClick={() => tokenMutation.mutate()} disabled={tokenMutation.isPending}>
                        Mint token
                    </Button>
                </div>
                {lastIssuedToken ? (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                        <div className="font-medium">Copy this token now</div>
                        <div className="mt-1 break-all font-mono text-xs">{lastIssuedToken}</div>
                    </div>
                ) : null}
                <div className="mt-4 grid gap-3">
                    {tokens.map((token) => (
                        <div key={token.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] p-3 text-sm">
                            <div>
                                <div className="font-medium">{token.label ?? token.tokenPreview}</div>
                                <div className="mt-1 text-xs text-[var(--app-hint)]">
                                    {token.tokenPreview}
                                    {token.expiresAt ? ` · expires ${new Date(token.expiresAt).toLocaleString()}` : ''}
                                    {token.revokedAt ? ' · revoked' : ''}
                                </div>
                            </div>
                            {!token.revokedAt ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => revokeTokenMutation.mutate(token.id)}
                                    disabled={revokeTokenMutation.isPending}
                                >
                                    Revoke
                                </Button>
                            ) : null}
                        </div>
                    ))}
                    {tokens.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-hint)]">
                            No enrollment tokens yet.
                        </div>
                    ) : null}
                </div>
            </section>
        </div>
    )
}
