import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CloudSecret } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'

function SecretRow(props: {
    secret: CloudSecret
    onDelete: (id: string) => void
    isDeleting: boolean
}) {
    const { secret } = props
    return (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--cursor-stroke-secondary)] px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--cursor-text-primary)] font-mono">
                        {secret.name}
                    </span>
                    {secret.adapter && (
                        <span className="rounded bg-[var(--cursor-bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--cursor-text-tertiary)]">
                            {secret.adapter}
                        </span>
                    )}
                </div>
                {secret.description && (
                    <div className="mt-0.5 text-[11px] text-[var(--cursor-text-tertiary)] truncate">
                        {secret.description}
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={() => props.onDelete(secret.id)}
                disabled={props.isDeleting}
                className="rounded p-1 text-[var(--cursor-text-tertiary)] hover:text-[var(--cursor-danger)] hover:bg-[var(--cursor-danger-bg)] transition-colors disabled:opacity-50"
                title="Delete secret"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
            </button>
        </div>
    )
}

/**
 * Embeddable secrets management panel for the workbench.
 * Lists existing secrets and allows adding new ones inline.
 */
export function SecretsPanel(props: { api: ApiClient | null }) {
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')
    const [newDescription, setNewDescription] = useState('')

    const secretsQuery = useQuery({
        queryKey: queryKeys.cloudSecrets,
        enabled: Boolean(props.api),
        queryFn: async () => {
            if (!props.api) throw new Error('API unavailable')
            return await props.api.getCloudSecrets()
        },
        staleTime: 30_000
    })

    const createMutation = useMutation({
        mutationFn: async () => {
            if (!props.api) throw new Error('API unavailable')
            return await props.api.createCloudSecret({
                name: newName.trim(),
                value: newValue,
                description: newDescription.trim() || undefined
            })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudSecrets })
            setNewName('')
            setNewValue('')
            setNewDescription('')
            setShowAdd(false)
            addToast({ title: 'Secret created', body: newName.trim(), sessionId: '', url: '' })
        },
        onError: (err) => {
            addToast({ title: 'Failed to create secret', body: err instanceof Error ? err.message : 'Unknown error', sessionId: '', url: '' })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!props.api) throw new Error('API unavailable')
            await props.api.deleteCloudSecret(id)
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudSecrets })
        }
    })

    const secrets = secretsQuery.data?.secrets ?? []

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--cursor-stroke-secondary)] px-4 py-2.5">
                <span className="text-[13px] font-semibold text-[var(--cursor-text-primary)]">
                    Secrets ({secrets.length})
                </span>
                <button
                    type="button"
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--cursor-link)] hover:bg-[var(--cursor-info-bg)] transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add
                </button>
            </div>

            {/* Add form */}
            {showAdd && (
                <div className="border-b border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-soft)] px-4 py-3 space-y-2">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="SECRET_NAME"
                        className="w-full rounded border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                    <input
                        type="password"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Value"
                        className="w-full rounded border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                    <input
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full rounded border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowAdd(false)}
                            className="rounded px-3 py-1 text-[11px] text-[var(--cursor-text-tertiary)] hover:bg-[var(--cursor-bg-quiet)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => createMutation.mutate()}
                            disabled={!newName.trim() || !newValue || createMutation.isPending}
                            className="rounded bg-[var(--cursor-button)] px-3 py-1 text-[11px] font-medium text-[var(--cursor-bg-card)] disabled:opacity-50 transition-colors"
                        >
                            {createMutation.isPending ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </div>
            )}

            {/* Secrets list */}
            <div className="flex-1 overflow-y-auto">
                {secretsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-[var(--cursor-text-tertiary)]">
                        Loading secrets...
                    </div>
                ) : secrets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-sm text-[var(--cursor-text-tertiary)]">
                        <div>No secrets configured.</div>
                        <div className="mt-1 text-[11px]">Add GITHUB_TOKEN to enable repo access.</div>
                    </div>
                ) : (
                    secrets.map(secret => (
                        <SecretRow
                            key={secret.id}
                            secret={secret}
                            onDelete={(id) => deleteMutation.mutate(id)}
                            isDeleting={deleteMutation.isPending}
                        />
                    ))
                )}
            </div>
        </div>
    )
}
