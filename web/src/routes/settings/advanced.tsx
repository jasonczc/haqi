import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { useMemory } from '@/hooks/queries/useMemory'
import { useMachines } from '@/hooks/queries/useMachines'
import type { CodexCredentialProfile, CodexCredentialStateResponse } from '@/types/api'
import { PROTOCOL_VERSION } from '@hapi/protocol'

function formatDateTime(value: number | string | null | undefined): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
}

function summarizeCodex(summary: CodexCredentialStateResponse['current']['summary'] | null | undefined): string[] {
    if (!summary) return []
    const rows: string[] = []
    if (summary.authMode) rows.push(`Auth mode: ${summary.authMode}`)
    if (summary.email) rows.push(`Email: ${summary.email}`)
    if (summary.organizationTitle) rows.push(`Org: ${summary.organizationTitle}`)
    if (summary.planType) rows.push(`Plan: ${summary.planType}`)
    rows.push(`API key: ${summary.hasOpenAiApiKey ? 'present' : 'absent'}`)
    rows.push(`Tokens: ${summary.hasTokens ? 'present' : 'absent'}`)
    if (summary.lastRefresh) rows.push(`Last refresh: ${summary.lastRefresh}`)
    return rows
}

export default function SettingsAdvancedPage() {
    const { api } = useAppContext()
    const { memory, isLoading: memoryLoading, error: memoryError, refetch: refetchMemory } = useMemory(api)
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)
    const [memoryDraft, setMemoryDraft] = useState('')
    const [memoryStatus, setMemoryStatus] = useState<string | null>(null)
    const [reportDomainDraft, setReportDomainDraft] = useState('')
    const [reportDomainSaved, setReportDomainSaved] = useState('')
    const [reportDomainStatus, setReportDomainStatus] = useState<string | null>(null)
    const [reportDomainSource, setReportDomainSource] = useState<'env' | 'file' | 'default'>('default')
    const [reportDomainEnvOverride, setReportDomainEnvOverride] = useState(false)
    const [selectedMachineId, setSelectedMachineId] = useState('')
    const [codexReloadNonce, setCodexReloadNonce] = useState(0)
    const [codexState, setCodexState] = useState<CodexCredentialStateResponse | null>(null)
    const [codexLoading, setCodexLoading] = useState(false)
    const [codexError, setCodexError] = useState<string | null>(null)
    const [codexStatus, setCodexStatus] = useState<string | null>(null)
    const [codexNameDraft, setCodexNameDraft] = useState('')
    const [codexImportDraft, setCodexImportDraft] = useState('')
    const [codexActionPendingId, setCodexActionPendingId] = useState<string | null>(null)
    const [experimentalClaudeLoginShellEnabled, setExperimentalClaudeLoginShellEnabled] = useState(false)
    const [experimentalStatus, setExperimentalStatus] = useState<string | null>(null)

    useEffect(() => {
        setMemoryDraft(memory?.content ?? '')
    }, [memory?.content])

    useEffect(() => {
        if (!api) return
        let cancelled = false
        ;(async () => {
            try {
                const result = await api.getReportDomainSettings()
                if (cancelled) return
                setReportDomainDraft(result.settings.value)
                setReportDomainSaved(result.settings.value)
                setReportDomainSource(result.settings.source)
                setReportDomainEnvOverride(result.settings.envOverride)
            } catch {
                if (!cancelled) {
                    setReportDomainStatus('Failed to load report domain')
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [api])

    useEffect(() => {
        if (!api) return
        let cancelled = false
        ;(async () => {
            try {
                const result = await api.getExperimentalSettings()
                if (!cancelled) {
                    setExperimentalClaudeLoginShellEnabled(result.settings.claudeLoginShell)
                    setExperimentalStatus(null)
                }
            } catch (error) {
                if (!cancelled) {
                    setExperimentalStatus(error instanceof Error ? error.message : 'Failed to load experimental settings')
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [api])

    useEffect(() => {
        if (!selectedMachineId) {
            const active = machines.find((machine) => machine.active) ?? machines[0]
            setSelectedMachineId(active?.id ?? '')
        }
    }, [machines, selectedMachineId])

    useEffect(() => {
        if (!api || !selectedMachineId) {
            setCodexState(null)
            return
        }
        let cancelled = false
        setCodexLoading(true)
        setCodexError(null)
        ;(async () => {
            try {
                const result = await api.getMachineCodexCredentials(selectedMachineId)
                if (!cancelled) {
                    setCodexState(result)
                    setCodexStatus(null)
                }
            } catch (error) {
                if (!cancelled) {
                    setCodexError(error instanceof Error ? error.message : 'Failed to load Codex credentials')
                    setCodexState(null)
                }
            } finally {
                if (!cancelled) {
                    setCodexLoading(false)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [api, selectedMachineId, codexReloadNonce])

    const saveMemoryMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateMemory({ content, updatedBy: 'user:web:settings-advanced' })
        },
        onSuccess: (result) => {
            setMemoryDraft(result.memory.content)
            setMemoryStatus('Memory saved')
        },
        onError: (error) => {
            setMemoryStatus(error instanceof Error ? error.message : 'Failed to save memory')
        }
    })

    const toggleMemoryMutation = useMutation({
        mutationFn: async (payload: { enabled?: boolean; pureContextMode?: boolean }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateMemory({ ...payload, updatedBy: 'user:web:settings-advanced' })
        },
        onSuccess: (result) => {
            setMemoryDraft(result.memory.content)
            setMemoryStatus('Memory settings updated')
        },
        onError: (error) => {
            setMemoryStatus(error instanceof Error ? error.message : 'Failed to update memory settings')
        }
    })

    const saveReportDomainMutation = useMutation({
        mutationFn: async (value: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateReportDomainSettings({ domain: value.trim() || null })
        },
        onSuccess: (result) => {
            setReportDomainDraft(result.settings.value)
            setReportDomainSaved(result.settings.value)
            setReportDomainSource(result.settings.source)
            setReportDomainEnvOverride(result.settings.envOverride)
            setReportDomainStatus('Report domain saved')
        },
        onError: (error) => {
            setReportDomainStatus(error instanceof Error ? error.message : 'Failed to save report domain')
        }
    })

    const exportCodexMutation = useMutation({
        mutationFn: async () => {
            if (!api || !selectedMachineId) throw new Error('Machine unavailable')
            return await api.exportMachineCodexCredentials(selectedMachineId)
        },
        onSuccess: (result) => {
            const blob = new Blob([result.content], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `codex-credentials-${selectedMachineId}.json`
            anchor.click()
            URL.revokeObjectURL(url)
            setCodexStatus('Codex credentials exported')
        },
        onError: (error) => {
            setCodexError(error instanceof Error ? error.message : 'Failed to export Codex credentials')
        }
    })

    const experimentalMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateExperimentalSettings({ claudeLoginShell: enabled })
        },
        onSuccess: (result) => {
            setExperimentalClaudeLoginShellEnabled(result.settings.claudeLoginShell)
            setExperimentalStatus(result.settings.claudeLoginShell ? 'Claude login shell enabled' : 'Claude login shell disabled')
        },
        onError: (error) => {
            setExperimentalStatus(error instanceof Error ? error.message : 'Failed to update experimental settings')
        }
    })

    const saveCurrentCodexMutation = useMutation({
        mutationFn: async () => {
            if (!api || !selectedMachineId) throw new Error('Machine unavailable')
            return await api.saveCurrentMachineCodexCredentials(selectedMachineId, {
                name: codexNameDraft.trim() || undefined
            })
        },
        onMutate: () => {
            setCodexActionPendingId('save-current')
            setCodexError(null)
            setCodexStatus(null)
        },
        onSuccess: (result) => {
            setCodexState(result)
            setCodexStatus('Current credentials saved as profile')
            setCodexActionPendingId(null)
        },
        onError: (error) => {
            setCodexError(error instanceof Error ? error.message : 'Failed to save current credentials')
            setCodexActionPendingId(null)
        }
    })

    const importCodexMutation = useMutation({
        mutationFn: async () => {
            if (!api || !selectedMachineId) throw new Error('Machine unavailable')
            return await api.importMachineCodexCredentials(selectedMachineId, {
                content: codexImportDraft,
                name: codexNameDraft.trim() || undefined
            })
        },
        onMutate: () => {
            setCodexActionPendingId('import')
            setCodexError(null)
            setCodexStatus(null)
        },
        onSuccess: (result) => {
            setCodexState(result)
            setCodexImportDraft('')
            setCodexStatus('Codex credentials imported')
            setCodexActionPendingId(null)
        },
        onError: (error) => {
            setCodexError(error instanceof Error ? error.message : 'Failed to import credentials')
            setCodexActionPendingId(null)
        }
    })

    const activateCodexMutation = useMutation({
        mutationFn: async (profileId: string) => {
            if (!api || !selectedMachineId) throw new Error('Machine unavailable')
            return await api.activateMachineCodexCredential(selectedMachineId, profileId)
        },
        onMutate: (profileId) => {
            setCodexActionPendingId(profileId)
            setCodexError(null)
            setCodexStatus(null)
        },
        onSuccess: (result) => {
            setCodexState(result)
            setCodexStatus('Codex profile activated')
            setCodexActionPendingId(null)
        },
        onError: (error) => {
            setCodexError(error instanceof Error ? error.message : 'Failed to activate profile')
            setCodexActionPendingId(null)
        }
    })

    const deleteCodexMutation = useMutation({
        mutationFn: async (profile: CodexCredentialProfile) => {
            if (!api || !selectedMachineId) throw new Error('Machine unavailable')
            return await api.deleteMachineCodexCredential(selectedMachineId, profile.id)
        },
        onMutate: (profile) => {
            setCodexActionPendingId(profile.id)
            setCodexError(null)
            setCodexStatus(null)
        },
        onSuccess: (result) => {
            setCodexState(result)
            setCodexStatus('Codex profile deleted')
            setCodexActionPendingId(null)
        },
        onError: (error) => {
            setCodexError(error instanceof Error ? error.message : 'Failed to delete profile')
            setCodexActionPendingId(null)
        }
    })

    const memoryDirty = memoryDraft !== (memory?.content ?? '')
    const reportDomainDirty = reportDomainDraft.trim() !== reportDomainSaved.trim()
    const activeMachines = useMemo(() => machines.filter((machine) => machine.active), [machines])
    const codexSummaryRows = summarizeCodex(codexState?.current.summary)

    return (
        <>
            <div className="settings-header">
                <h1>Advanced &amp; Diagnostics</h1>
                <p>Memory editing, machine diagnostics, Codex credential inspection, and other advanced operational settings.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Global Memory</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Enable memory injection</span>
                            <span className="settings-row-desc">Inject MEMORY.md context into supported agents.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input
                                    type="checkbox"
                                    checked={memory?.enabled ?? false}
                                    disabled={memoryLoading || toggleMemoryMutation.isPending || Boolean(memory?.pureContextMode)}
                                    onChange={() => { void toggleMemoryMutation.mutateAsync({ enabled: !(memory?.enabled ?? false) }) }}
                                />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Pure context mode</span>
                            <span className="settings-row-desc">Prefer pure context loading instead of standard memory injection.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input
                                    type="checkbox"
                                    checked={memory?.pureContextMode ?? false}
                                    disabled={memoryLoading || toggleMemoryMutation.isPending}
                                    onChange={() => { void toggleMemoryMutation.mutateAsync({ pureContextMode: !(memory?.pureContextMode ?? false) }) }}
                                />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Memory file</span>
                            <span className="settings-row-desc">{memory?.path ?? 'Loading memory path…'}</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{memory ? `${memory.bytes} bytes` : '—'}</span>
                        </div>
                    </div>
                    <div className="settings-row settings-row-nobottom" style={{ alignItems: 'stretch', flexDirection: 'column' }}>
                        <textarea
                            value={memoryDraft}
                            onChange={(event) => setMemoryDraft(event.target.value)}
                            placeholder={memoryLoading ? 'Loading memory…' : 'Edit MEMORY.md content'}
                            className="settings-input"
                            style={{ width: '100%', minHeight: 240, resize: 'vertical' }}
                            spellCheck={false}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', marginTop: 12 }}>
                            <span className="settings-row-desc">{memoryError ?? memoryStatus ?? (memoryDirty ? 'Unsaved changes' : 'Synced')}</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="settings-btn-outline" type="button" onClick={() => { void refetchMemory(); setMemoryStatus('Memory reloaded') }}>Reload</button>
                                <button className="settings-btn" type="button" disabled={!memoryDirty || saveMemoryMutation.isPending} onClick={() => { void saveMemoryMutation.mutateAsync(memoryDraft) }}>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Report Domain</div>
                <div className="settings-card">
                    <div className="settings-row settings-row-nobottom">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Public report base URL</span>
                            <span className="settings-row-desc">Source: {reportDomainSource}{reportDomainEnvOverride ? ' · locked by env' : ''}</span>
                        </div>
                        <div className="settings-row-right" style={{ width: '100%', maxWidth: 320 }}>
                            <input
                                className="settings-input"
                                style={{ width: '100%', minWidth: 0 }}
                                value={reportDomainDraft}
                                disabled={reportDomainEnvOverride}
                                onChange={(event) => setReportDomainDraft(event.target.value)}
                                placeholder="https://reports.example.com"
                            />
                        </div>
                    </div>
                    <div className="settings-row settings-row-nobottom">
                        <div className="settings-row-left">
                            <span className="settings-row-desc">{reportDomainStatus ?? (reportDomainDirty ? 'Unsaved changes' : 'Synced')}</span>
                        </div>
                        <div className="settings-row-right">
                            <button className="settings-btn" type="button" disabled={reportDomainEnvOverride || !reportDomainDirty || saveReportDomainMutation.isPending} onClick={() => { void saveReportDomainMutation.mutateAsync(reportDomainDraft) }}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Machine Diagnostics</div>
                {machinesError ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">Failed to load machines</div>
                        <div className="settings-empty-desc">{machinesError}</div>
                    </div>
                ) : machinesLoading ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">Loading machines…</div>
                    </div>
                ) : (
                    <div className="settings-card">
                        {machines.map((machine) => (
                            <div key={machine.id} className="settings-row">
                                <div className="settings-row-left">
                                    <span className="settings-row-title">
                                        {machine.metadata?.displayName ?? machine.metadata?.host ?? machine.id}
                                        {machine.active ? <span className="settings-badge">Connected</span> : null}
                                    </span>
                                    <span className="settings-row-desc">{machine.metadata?.host ?? 'unknown host'} · {machine.metadata?.platform ?? 'unknown platform'} · last seen {formatDateTime(machine.updatedAt)}</span>
                                </div>
                                <div className="settings-row-right">
                                    <span className="settings-badge">{machine.id}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Experimental</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Claude login shell</span>
                            <span className="settings-row-desc">Launch Claude in login-shell mode for environments that require shell startup files.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input
                                    type="checkbox"
                                    checked={experimentalClaudeLoginShellEnabled}
                                    disabled={experimentalMutation.isPending}
                                    onChange={() => { void experimentalMutation.mutateAsync(!experimentalClaudeLoginShellEnabled) }}
                                />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                    {experimentalStatus ? (
                        <div className="settings-row settings-row-nobottom">
                            <div className="settings-row-left">
                                <span className="settings-row-desc">{experimentalStatus}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Codex Credentials</div>
                {activeMachines.length === 0 ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">No connected machines</div>
                        <div className="settings-empty-desc">Connect a machine to inspect or export Codex credential state.</div>
                    </div>
                ) : (
                    <>
                        <div className="settings-card" style={{ marginBottom: 16 }}>
                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <span className="settings-row-title">Target machine</span>
                                    <span className="settings-row-desc">Choose which connected machine to inspect.</span>
                                </div>
                                <div className="settings-row-right">
                                    <select className="settings-input" value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
                                        {activeMachines.map((machine) => (
                                            <option key={machine.id} value={machine.id}>
                                                {machine.metadata?.displayName ?? machine.metadata?.host ?? machine.id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="settings-row settings-row-nobottom">
                                <div className="settings-row-left">
                                    <span className="settings-row-desc">{codexError ?? codexStatus ?? (codexLoading ? 'Loading credentials…' : 'Credential state loaded')}</span>
                                </div>
                                <div className="settings-row-right">
                                    <button className="settings-btn-outline" type="button" disabled={!selectedMachineId || codexLoading} onClick={() => setCodexReloadNonce((value) => value + 1)}>Refresh</button>
                                    <button className="settings-btn" type="button" disabled={!codexState?.current.exists || exportCodexMutation.isPending} onClick={() => { void exportCodexMutation.mutateAsync() }}>
                                        Export
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="settings-card" style={{ marginBottom: 16 }}>
                            <div className="settings-row">
                                <div className="settings-row-left">
                                    <span className="settings-row-title">Current credential state</span>
                                    <span className="settings-row-desc">{codexState?.current.exists ? 'Managed on machine' : 'No Codex credentials found'}</span>
                                </div>
                                <div className="settings-row-right">
                                    <span className="settings-badge">{codexState?.current.activeProfileId ? 'Profile active' : 'Unmanaged'}</span>
                                </div>
                            </div>
                            {codexSummaryRows.length > 0 ? codexSummaryRows.map((row) => (
                                <div key={row} className="settings-row">
                                    <div className="settings-row-left">
                                        <span className="settings-row-desc">{row}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="settings-row settings-row-nobottom">
                                    <div className="settings-row-left">
                                        <span className="settings-row-desc">No current credential summary available.</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="settings-card" style={{ marginBottom: 16 }}>
                            <div className="settings-row settings-row-nobottom" style={{ alignItems: 'stretch', flexDirection: 'column' }}>
                                <div className="settings-section-subtitle" style={{ marginBottom: 8 }}>Manage profiles</div>
                                <input
                                    className="settings-input"
                                    style={{ width: '100%', minWidth: 0, marginBottom: 12 }}
                                    placeholder="Optional profile name"
                                    value={codexNameDraft}
                                    onChange={(event) => setCodexNameDraft(event.target.value)}
                                />
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <button
                                        className="settings-btn"
                                        type="button"
                                        disabled={!codexState?.current.exists || codexActionPendingId !== null}
                                        onClick={() => { void saveCurrentCodexMutation.mutateAsync() }}
                                    >
                                        Save current
                                    </button>
                                </div>
                                <textarea
                                    className="settings-input"
                                    style={{ width: '100%', minHeight: 180, resize: 'vertical' }}
                                    placeholder="Paste exported Codex credential JSON"
                                    value={codexImportDraft}
                                    onChange={(event) => setCodexImportDraft(event.target.value)}
                                    spellCheck={false}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', marginTop: 12 }}>
                                    <span className="settings-row-desc">Import exported credential JSON onto the selected machine.</span>
                                    <button
                                        className="settings-btn"
                                        type="button"
                                        disabled={!codexImportDraft.trim() || codexActionPendingId !== null}
                                        onClick={() => { void importCodexMutation.mutateAsync() }}
                                    >
                                        Import
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="settings-section-subtitle">Saved profiles: {codexState?.profiles.length ?? 0}</div>
                        <div className="settings-card">
                            {codexState?.profiles.length ? codexState.profiles.map((profile) => (
                                <div key={profile.id} className="settings-row">
                                    <div className="settings-row-left">
                                        <span className="settings-row-title">{profile.name}{profile.isActive ? <span className="settings-badge">Active</span> : null}</span>
                                        <span className="settings-row-desc">{profile.importSource} · updated {formatDateTime(profile.updatedAt)}</span>
                                    </div>
                                    <div className="settings-row-right">
                                        <button
                                            className="settings-btn-outline"
                                            type="button"
                                            disabled={profile.isActive || codexActionPendingId !== null}
                                            onClick={() => { void activateCodexMutation.mutateAsync(profile.id) }}
                                        >
                                            {profile.isActive ? 'Active' : 'Activate'}
                                        </button>
                                        <button
                                            className="settings-btn-outline"
                                            type="button"
                                            disabled={profile.isActive || codexActionPendingId !== null}
                                            onClick={() => {
                                                if (!window.confirm(`Delete profile ${profile.name}?`)) return
                                                void deleteCodexMutation.mutateAsync(profile)
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="settings-row settings-row-nobottom">
                                    <div className="settings-row-left">
                                        <span className="settings-row-desc">No saved credential profiles.</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">About</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Website</span>
                            <span className="settings-row-desc">Project homepage and docs entrypoint.</span>
                        </div>
                        <div className="settings-row-right">
                            <a className="settings-link" href="https://hapi.run" target="_blank" rel="noreferrer">hapi.run</a>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">App version</span>
                            <span className="settings-row-desc">Build version embedded in the current web bundle.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{__APP_VERSION__}</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Protocol version</span>
                            <span className="settings-row-desc">Hub / runner protocol version expected by this client.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{PROTOCOL_VERSION}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
