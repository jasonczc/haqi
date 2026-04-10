import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
    CursorButton,
    CursorEmptyState,
    CursorSelect,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorTextArea,
    CursorTextField,
    CursorToggle,
} from '@/components/settings/CursorSettingsPrimitives'
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
        <div className="mx-auto w-full max-w-content">
            <CursorSettingsHeader
                title="Advanced & Diagnostics"
                description="Memory editing, machine diagnostics, Codex credential inspection, and other advanced operational settings."
            />

            <CursorSettingsSection title="Global Memory">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Enable memory injection"
                        description="Inject MEMORY.md context into supported agents."
                        control={(
                            <CursorToggle
                                checked={memory?.enabled ?? false}
                                disabled={memoryLoading || toggleMemoryMutation.isPending || Boolean(memory?.pureContextMode)}
                                onCheckedChange={() => { void toggleMemoryMutation.mutateAsync({ enabled: !(memory?.enabled ?? false) }) }}
                            />
                        )}
                    />
                    <CursorSettingsRow
                        title="Pure context mode"
                        description="Prefer pure context loading instead of standard memory injection."
                        control={(
                            <CursorToggle
                                checked={memory?.pureContextMode ?? false}
                                disabled={memoryLoading || toggleMemoryMutation.isPending}
                                onCheckedChange={() => { void toggleMemoryMutation.mutateAsync({ pureContextMode: !(memory?.pureContextMode ?? false) }) }}
                            />
                        )}
                    />
                    <CursorSettingsRow
                        title="Memory file"
                        description={memory?.path ?? 'Loading memory path…'}
                        control={<CursorSettingsBadge>{memory ? `${memory.bytes} bytes` : '—'}</CursorSettingsBadge>}
                    />
                    <div className="px-4 py-4">
                        <CursorTextArea
                            value={memoryDraft}
                            onChange={(event) => setMemoryDraft(event.target.value)}
                            placeholder={memoryLoading ? 'Loading memory…' : 'Edit MEMORY.md content'}
                            className="min-h-[240px] w-full resize-y"
                            spellCheck={false}
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[13px] leading-[18px] text-[var(--text-secondary)]">
                                {memoryError ?? memoryStatus ?? (memoryDirty ? 'Unsaved changes' : 'Synced')}
                            </span>
                            <div className="flex gap-2">
                                <CursorButton
                                    variant="outline"
                                    type="button"
                                    size="sm"
                                    onClick={() => { void refetchMemory(); setMemoryStatus('Memory reloaded') }}
                                >
                                    Reload
                                </CursorButton>
                                <CursorButton
                                    type="button"
                                    size="sm"
                                    disabled={!memoryDirty || saveMemoryMutation.isPending}
                                    onClick={() => { void saveMemoryMutation.mutateAsync(memoryDraft) }}
                                >
                                    Save
                                </CursorButton>
                            </div>
                        </div>
                    </div>
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Report Domain">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Public report base URL"
                        description={`Source: ${reportDomainSource}${reportDomainEnvOverride ? ' · locked by env' : ''}`}
                        control={(
                            <div className="w-full max-w-[320px]">
                                <CursorTextField
                                    value={reportDomainDraft}
                                    disabled={reportDomainEnvOverride}
                                    onChange={(event) => setReportDomainDraft(event.target.value)}
                                    placeholder="https://reports.example.com"
                                />
                            </div>
                        )}
                    />
                    <CursorSettingsRow
                        description={reportDomainStatus ?? (reportDomainDirty ? 'Unsaved changes' : 'Synced')}
                        control={(
                            <CursorButton
                                type="button"
                                size="sm"
                                disabled={reportDomainEnvOverride || !reportDomainDirty || saveReportDomainMutation.isPending}
                                onClick={() => { void saveReportDomainMutation.mutateAsync(reportDomainDraft) }}
                            >
                                Save
                            </CursorButton>
                        )}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Machine Diagnostics">
                {machinesError ? (
                    <CursorEmptyState title="Failed to load machines" description={machinesError} />
                ) : machinesLoading ? (
                    <CursorEmptyState title="Loading machines…" description="Fetching connected runner and host metadata." />
                ) : (
                    <CursorSettingsCard>
                        {machines.map((machine) => (
                            <CursorSettingsRow
                                key={machine.id}
                                title={(
                                    <>
                                        {machine.metadata?.displayName ?? machine.metadata?.host ?? machine.id}
                                        {machine.active ? <CursorSettingsBadge tone="success">Connected</CursorSettingsBadge> : null}
                                    </>
                                )}
                                description={`${machine.metadata?.host ?? 'unknown host'} · ${machine.metadata?.platform ?? 'unknown platform'} · last seen ${formatDateTime(machine.updatedAt)}`}
                                control={<CursorSettingsBadge>{machine.id}</CursorSettingsBadge>}
                            />
                        ))}
                    </CursorSettingsCard>
                )}
            </CursorSettingsSection>

            <CursorSettingsSection title="Experimental">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Claude login shell"
                        description="Launch Claude in login-shell mode for environments that require shell startup files."
                        control={(
                            <CursorToggle
                                checked={experimentalClaudeLoginShellEnabled}
                                disabled={experimentalMutation.isPending}
                                onCheckedChange={() => { void experimentalMutation.mutateAsync(!experimentalClaudeLoginShellEnabled) }}
                            />
                        )}
                    />
                    {experimentalStatus ? (
                        <CursorSettingsRow description={experimentalStatus} />
                    ) : null}
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Codex Credentials">
                {activeMachines.length === 0 ? (
                    <CursorEmptyState
                        title="No connected machines"
                        description="Connect a machine to inspect or export Codex credential state."
                    />
                ) : (
                    <div className="space-y-4">
                        <CursorSettingsCard>
                            <CursorSettingsRow
                                title="Target machine"
                                description="Choose which connected machine to inspect."
                                control={(
                                    <CursorSelect value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
                                        {activeMachines.map((machine) => (
                                            <option key={machine.id} value={machine.id}>
                                                {machine.metadata?.displayName ?? machine.metadata?.host ?? machine.id}
                                            </option>
                                        ))}
                                    </CursorSelect>
                                )}
                            />
                            <CursorSettingsRow
                                description={codexError ?? codexStatus ?? (codexLoading ? 'Loading credentials…' : 'Credential state loaded')}
                                control={(
                                    <div className="flex gap-2">
                                        <CursorButton
                                            variant="outline"
                                            type="button"
                                            size="sm"
                                            disabled={!selectedMachineId || codexLoading}
                                            onClick={() => setCodexReloadNonce((value) => value + 1)}
                                        >
                                            Refresh
                                        </CursorButton>
                                        <CursorButton
                                            type="button"
                                            size="sm"
                                            disabled={!codexState?.current.exists || exportCodexMutation.isPending}
                                            onClick={() => { void exportCodexMutation.mutateAsync() }}
                                        >
                                            Export
                                        </CursorButton>
                                    </div>
                                )}
                            />
                        </CursorSettingsCard>

                        <CursorSettingsCard>
                            <CursorSettingsRow
                                title="Current credential state"
                                description={codexState?.current.exists ? 'Managed on machine' : 'No Codex credentials found'}
                                control={<CursorSettingsBadge>{codexState?.current.activeProfileId ? 'Profile active' : 'Unmanaged'}</CursorSettingsBadge>}
                            />
                            {codexSummaryRows.length > 0 ? codexSummaryRows.map((row) => (
                                <CursorSettingsRow key={row} description={row} />
                            )) : (
                                <CursorSettingsRow description="No current credential summary available." />
                            )}
                        </CursorSettingsCard>

                        <CursorSettingsCard>
                            <div className="px-4 py-4">
                                <div className="mb-2 text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">Manage profiles</div>
                                <CursorTextField
                                    className="mb-3 w-full"
                                    placeholder="Optional profile name"
                                    value={codexNameDraft}
                                    onChange={(event) => setCodexNameDraft(event.target.value)}
                                />
                                <div className="mb-3 flex gap-2">
                                    <CursorButton
                                        type="button"
                                        size="sm"
                                        disabled={!codexState?.current.exists || codexActionPendingId !== null}
                                        onClick={() => { void saveCurrentCodexMutation.mutateAsync() }}
                                    >
                                        Save current
                                    </CursorButton>
                                </div>
                                <CursorTextArea
                                    className="min-h-[180px] w-full resize-y"
                                    placeholder="Paste exported Codex credential JSON"
                                    value={codexImportDraft}
                                    onChange={(event) => setCodexImportDraft(event.target.value)}
                                    spellCheck={false}
                                />
                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <span className="text-[13px] leading-[18px] text-[var(--text-secondary)]">
                                        Import exported credential JSON onto the selected machine.
                                    </span>
                                    <CursorButton
                                        type="button"
                                        size="sm"
                                        disabled={!codexImportDraft.trim() || codexActionPendingId !== null}
                                        onClick={() => { void importCodexMutation.mutateAsync() }}
                                    >
                                        Import
                                    </CursorButton>
                                </div>
                            </div>
                        </CursorSettingsCard>

                        <CursorSettingsSection title={`Saved profiles: ${codexState?.profiles.length ?? 0}`} className="mb-0">
                            <CursorSettingsCard>
                                {codexState?.profiles.length ? codexState.profiles.map((profile) => (
                                    <CursorSettingsRow
                                        key={profile.id}
                                        title={(
                                            <>
                                                {profile.name}
                                                {profile.isActive ? <CursorSettingsBadge tone="success">Active</CursorSettingsBadge> : null}
                                            </>
                                        )}
                                        description={`${profile.importSource} · updated ${formatDateTime(profile.updatedAt)}`}
                                        control={(
                                            <div className="flex gap-2">
                                                <CursorButton
                                                    variant="outline"
                                                    type="button"
                                                    size="sm"
                                                    disabled={profile.isActive || codexActionPendingId !== null}
                                                    onClick={() => { void activateCodexMutation.mutateAsync(profile.id) }}
                                                >
                                                    {profile.isActive ? 'Active' : 'Activate'}
                                                </CursorButton>
                                                <CursorButton
                                                    variant="outline"
                                                    type="button"
                                                    size="sm"
                                                    disabled={profile.isActive || codexActionPendingId !== null}
                                                    onClick={() => {
                                                        if (!window.confirm(`Delete profile ${profile.name}?`)) return
                                                        void deleteCodexMutation.mutateAsync(profile)
                                                    }}
                                                >
                                                    Delete
                                                </CursorButton>
                                            </div>
                                        )}
                                    />
                                )) : (
                                    <CursorSettingsRow description="No saved credential profiles." />
                                )}
                            </CursorSettingsCard>
                        </CursorSettingsSection>
                    </div>
                )}
            </CursorSettingsSection>

            <CursorSettingsSection title="About">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Website"
                        description="Project homepage and docs entrypoint."
                        control={<a className="text-[13px] leading-[18px] text-[var(--accent)] hover:underline" href="https://hapi.run" target="_blank" rel="noreferrer">hapi.run</a>}
                    />
                    <CursorSettingsRow
                        title="App version"
                        description="Build version embedded in the current web bundle."
                        control={<CursorSettingsBadge>{__APP_VERSION__}</CursorSettingsBadge>}
                    />
                    <CursorSettingsRow
                        title="Protocol version"
                        description="Hub / runner protocol version expected by this client."
                        control={<CursorSettingsBadge>{PROTOCOL_VERSION}</CursorSettingsBadge>}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>
        </div>
    )
}
