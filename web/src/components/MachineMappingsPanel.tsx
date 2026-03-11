import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MachineMapping } from '@hapi/protocol/types'
import { queryKeys } from '@/lib/query-keys'
import type { ApiClient } from '@/api/client'

const KIND_OPTIONS: MachineMapping['kind'][] = ['vscode', 'web', 'jupyter', 'ssh', 'custom']

const panelClass = 'rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)]/95 shadow-sm'
const softCardClass = 'rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/70'
const inputClass = 'w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm text-[var(--app-fg)] outline-none transition-colors focus:border-[var(--app-link)]'
const subtleButtonClass = 'rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-60'
const primaryButtonClass = 'rounded-xl bg-[var(--app-link)] px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60'

function getStatusClass(status: MachineMapping['status']): string {
    if (status === 'online') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (status === 'offline') return 'border-rose-200 bg-rose-50 text-rose-700'
    return 'border-slate-200 bg-slate-50 text-slate-700'
}

function getKindLabel(kind: MachineMapping['kind']): string {
    switch (kind) {
        case 'vscode':
            return 'VS Code'
        case 'jupyter':
            return 'Jupyter'
        case 'ssh':
            return 'SSH'
        case 'web':
            return 'Web'
        default:
            return 'Custom'
    }
}

function getSourceClass(source: MachineMapping['source']): string {
    if (source === 'managed') return 'bg-sky-50 text-sky-700'
    if (source === 'imported') return 'bg-violet-50 text-violet-700'
    return 'bg-slate-100 text-slate-700'
}

function createEmptyMapping(): MachineMapping {
    const now = Date.now()
    return {
        id: `manual-${now}`,
        name: '',
        kind: 'web',
        provider: 'manual',
        localUrl: '',
        publicUrl: '',
        status: 'unknown',
        source: 'manual',
        updatedAt: now
    }
}

export function MachineMappingsPanel(props: {
    api: ApiClient | null
    machineId: string
    sessionIdForInvalidation?: string
    title?: string
    compact?: boolean
    editable?: boolean
    onOpenFullPage?: () => void
}) {
    const queryClient = useQueryClient()
    const [mappings, setMappings] = useState<MachineMapping[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [createName, setCreateName] = useState('VSCode')
    const [createKind, setCreateKind] = useState<MachineMapping['kind']>('vscode')
    const [createLocalUrl, setCreateLocalUrl] = useState('http://127.0.0.1:8080')

    const mappingsQuery = useQuery({
        queryKey: queryKeys.machineMappings(props.machineId),
        queryFn: async () => {
            if (!props.api) {
                throw new Error('API unavailable')
            }
            return await props.api.getMachineMappings(props.machineId)
        },
        enabled: Boolean(props.api && props.machineId),
        staleTime: 10_000
    })

    const providerSettingsQuery = useQuery({
        queryKey: ['provider-settings'],
        queryFn: async () => {
            if (!props.api) {
                throw new Error('API unavailable')
            }
            return await props.api.getProviderSettings()
        },
        enabled: Boolean(props.api),
        staleTime: 30_000
    })

    useEffect(() => {
        if (mappingsQuery.data?.mappings) {
            setMappings(mappingsQuery.data.mappings)
        }
    }, [mappingsQuery.data?.mappings])

    const invalidate = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.machineMappings(props.machineId) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.machines })
        if (props.sessionIdForInvalidation) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.session(props.sessionIdForInvalidation) })
        }
    }, [props.machineId, props.sessionIdForInvalidation, queryClient])

    const updateMapping = useCallback((id: string, patch: Partial<MachineMapping>) => {
        setMappings((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item))
    }, [])

    const saveMappings = useCallback(async () => {
        if (!props.api) return
        setError(null)
        setNotice(null)
        setIsSaving(true)
        try {
            const normalized = mappings.map((item, index) => ({
                ...item,
                id: item.id?.trim() || `mapping-${index + 1}`,
                name: item.name.trim() || `Mapping ${index + 1}`,
                localUrl: item.localUrl.trim(),
                publicUrl: item.publicUrl?.trim() || undefined,
                updatedAt: Date.now()
            }))
            const result = await props.api.updateMachineMappings(props.machineId, normalized)
            setMappings(result.mappings)
            setNotice('Saved')
            await invalidate()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save mappings')
        } finally {
            setIsSaving(false)
        }
    }, [invalidate, mappings, props.api, props.machineId])

    const importNgrok = useCallback(async () => {
        if (!props.api) return
        setError(null)
        setNotice(null)
        setIsImporting(true)
        try {
            const result = await props.api.importMachineMappingsFromNgrok(props.machineId)
            setMappings(result.mappings)
            setNotice(result.imported > 0 ? `Imported ${result.imported} ngrok mapping(s)` : 'No ngrok mappings found')
            await invalidate()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to import ngrok mappings')
        } finally {
            setIsImporting(false)
        }
    }, [invalidate, props.api, props.machineId])

    const createNgrok = useCallback(async () => {
        if (!props.api) return
        setError(null)
        setNotice(null)
        setIsCreating(true)
        try {
            const result = await props.api.createManagedMachineMapping(props.machineId, {
                provider: 'ngrok',
                name: createName.trim() || 'ngrok endpoint',
                kind: createKind,
                localUrl: createLocalUrl.trim()
            })
            setMappings(result.mappings)
            setNotice('Created ngrok endpoint')
            await invalidate()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create ngrok endpoint')
        } finally {
            setIsCreating(false)
        }
    }, [createKind, createLocalUrl, createName, invalidate, props.api, props.machineId])

    const refreshMappings = useCallback(async () => {
        if (!props.api) return
        setError(null)
        setNotice(null)
        setIsRefreshing(true)
        try {
            const result = await props.api.refreshMachineMappings(props.machineId)
            setMappings(result.mappings)
            setNotice('Refreshed')
            await invalidate()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to refresh mappings')
        } finally {
            setIsRefreshing(false)
        }
    }, [invalidate, props.api, props.machineId])

    const deleteMapping = useCallback(async (mapping: MachineMapping) => {
        if (!props.api) return
        setError(null)
        setNotice(null)
        setDeletingId(mapping.id)
        try {
            const result = mapping.source === 'managed'
                ? await props.api.deleteManagedMachineMapping(props.machineId, {
                    provider: mapping.provider,
                    mapping
                })
                : await props.api.updateMachineMappings(
                    props.machineId,
                    mappings.filter((item) => item.id !== mapping.id)
                )
            setMappings(result.mappings)
            setNotice('Deleted')
            await invalidate()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete mapping')
        } finally {
            setDeletingId(null)
        }
    }, [invalidate, mappings, props.api, props.machineId])

    const copyValue = useCallback(async (value: string | undefined) => {
        if (!value) return
        try {
            await navigator.clipboard.writeText(value)
            setNotice('Copied')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Copy failed')
        }
    }, [])

    const ngrokProfile = useMemo(
        () => providerSettingsQuery.data?.providers.find((item) => item.provider === 'ngrok'),
        [providerSettingsQuery.data?.providers]
    )
    const visibleMappings = props.compact ? mappings.slice(0, 3) : mappings

    return (
        <div className={`${panelClass} p-4`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-[var(--app-fg)]">{props.title ?? 'Mappings'}</div>
                        <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">
                            {mappings.length} total
                        </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">
                        machine <span className="font-mono">{props.machineId}</span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void importNgrok()}
                        disabled={isImporting}
                        className={subtleButtonClass}
                    >
                        {isImporting ? 'Importing…' : 'Import ngrok'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void refreshMappings()}
                        disabled={isRefreshing}
                        className={subtleButtonClass}
                    >
                        {isRefreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                    {props.onOpenFullPage ? (
                        <button
                            type="button"
                            onClick={props.onOpenFullPage}
                            className={subtleButtonClass}
                        >
                            Open
                        </button>
                    ) : null}
                </div>
            </div>

            {ngrokProfile && !ngrokProfile.hasAuthToken ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    ngrok token not configured; managed creation may fail.
                </div>
            ) : null}
            {error ? (
                <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
            ) : null}
            {notice ? (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{notice}</div>
            ) : null}

            <div className={`${softCardClass} mt-4 p-3`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-medium text-[var(--app-fg)]">Quick create</div>
                        <div className="text-xs text-[var(--app-hint)]">Create a managed ngrok endpoint for a local service.</div>
                    </div>
                    {ngrokProfile ? (
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ngrokProfile.hasAuthToken ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {ngrokProfile.hasAuthToken ? 'ngrok ready' : 'token missing'}
                        </span>
                    ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
                    <input
                        type="text"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                        placeholder="VSCode"
                        className={inputClass}
                    />
                    <select
                        value={createKind}
                        onChange={(event) => setCreateKind(event.target.value as MachineMapping['kind'])}
                        className={inputClass}
                    >
                        {KIND_OPTIONS.map((option) => (
                            <option key={option} value={option}>{getKindLabel(option)}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={createLocalUrl}
                        onChange={(event) => setCreateLocalUrl(event.target.value)}
                        placeholder="http://127.0.0.1:8080"
                        className={inputClass}
                    />
                    <button
                        type="button"
                        onClick={() => void createNgrok()}
                        disabled={isCreating}
                        className={primaryButtonClass}
                    >
                        {isCreating ? 'Creating…' : 'Create ngrok'}
                    </button>
                </div>
            </div>

            {visibleMappings.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/45 p-6 text-center text-sm text-[var(--app-hint)]">
                    <div className="font-medium text-[var(--app-fg)]">No mappings yet</div>
                    <div className="mt-1">Import live ngrok endpoints or add one manually.</div>
                </div>
            ) : (
                <div className="mt-4 flex flex-col gap-3">
                    {visibleMappings.map((mapping) => (
                        <div key={mapping.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/45 p-3">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="truncate text-sm font-semibold text-[var(--app-fg)]">{mapping.name}</div>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusClass(mapping.status)}`}>
                                            {mapping.status}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getSourceClass(mapping.source)}`}>
                                            {mapping.source}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--app-hint)]">
                                        <span>{mapping.provider}</span>
                                        <span>•</span>
                                        <span>{getKindLabel(mapping.kind)}</span>
                                        <span>•</span>
                                        <span className="font-mono">{mapping.id}</span>
                                    </div>
                                </div>
                                {mapping.publicUrl ? (
                                    <div className="flex flex-wrap gap-2">
                                        <a
                                            href={mapping.publicUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={subtleButtonClass}
                                        >
                                            Open
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => void copyValue(mapping.publicUrl)}
                                            className={subtleButtonClass}
                                        >
                                            Copy URL
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            {props.editable ? (
                                <div className="grid gap-2 md:grid-cols-2">
                                    <input
                                        type="text"
                                        value={mapping.name}
                                        onChange={(event) => updateMapping(mapping.id, { name: event.target.value })}
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={mapping.id}
                                        onChange={(event) => updateMapping(mapping.id, { id: event.target.value })}
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={mapping.localUrl}
                                        onChange={(event) => updateMapping(mapping.id, { localUrl: event.target.value })}
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={mapping.publicUrl ?? ''}
                                        onChange={(event) => updateMapping(mapping.id, { publicUrl: event.target.value })}
                                        className={inputClass}
                                    />
                                </div>
                            ) : (
                                <div className="grid gap-2 md:grid-cols-2">
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2">
                                        <div className="text-[11px] uppercase tracking-wide text-[var(--app-hint)]">Local</div>
                                        <div className="mt-1 break-all font-mono text-xs text-[var(--app-fg)]">{mapping.localUrl}</div>
                                    </div>
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2">
                                        <div className="text-[11px] uppercase tracking-wide text-[var(--app-hint)]">Public</div>
                                        <div className="mt-1 break-all font-mono text-xs text-[var(--app-link)]">{mapping.publicUrl ?? 'Not exposed yet'}</div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {props.editable ? (
                                    <button
                                        type="button"
                                        onClick={() => void deleteMapping(mapping)}
                                        disabled={deletingId === mapping.id}
                                        className={subtleButtonClass}
                                    >
                                        {deletingId === mapping.id ? 'Removing…' : 'Remove'}
                                    </button>
                                ) : null}
                                {mapping.auth?.summary ? (
                                    <span className="rounded-full bg-[var(--app-bg)] px-2 py-1 text-[11px] text-[var(--app-hint)]">
                                        auth: {mapping.auth.summary}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {props.editable ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--app-divider)] pt-4">
                    <button
                        type="button"
                        onClick={() => setMappings((current) => [...current, createEmptyMapping()])}
                        className={subtleButtonClass}
                    >
                        Add manual
                    </button>
                    <button
                        type="button"
                        onClick={() => void saveMappings()}
                        disabled={isSaving}
                        className={primaryButtonClass}
                    >
                        {isSaving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            ) : null}
        </div>
    )
}
