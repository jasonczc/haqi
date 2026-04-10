import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import type {
    ExecutionBackend,
    Machine,
    NetworkMode,
    RuntimeKind,
    SessionSummary,
    WorkspaceMode,
    WorkspaceSource,
    WorkspaceSpec,
} from '@/types/api'
import type { EnvironmentTemplate } from '@hapi/protocol/types'
import { useMachines } from '@/hooks/queries/useMachines'
import { useCloudWorkers } from '@/hooks/queries/useCloudWorkers'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import { useCloudCheckpoints } from '@/hooks/queries/useCloudCheckpoints'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import {
    ChipPopover,
    PopoverGroup,
    PopoverRow,
    PopoverOption,
    PopoverPillRow,
} from '@/components/ChipPopover'
import {
    MODEL_OPTIONS,
    CODEX_SERVICE_TIER_OPTIONS,
    getThinkEffortOptions,
    getModelOptionsForAgent,
    type AgentType,
    type ThinkEffort,
    type ServiceTier,
    type SessionType,
} from '@/components/NewSession/types'
import {
    loadPreferredAgent,
    loadPreferredModel,
    loadPreferredCustomModel,
    loadPreferredThinkEffort,
    loadPreferredServiceTier,
    loadPreferredYoloMode,
    loadPreferredSessionType,
    loadPreferredExecutionBackend,
    loadPreferredRuntimeKind,
    loadLastSessionConfig,
    savePreferredAgent,
    savePreferredModel,
    savePreferredCustomModel,
    savePreferredThinkEffort,
    savePreferredServiceTier,
    savePreferredYoloMode,
    savePreferredSessionType,
    savePreferredExecutionBackend,
    savePreferredRuntimeKind,
    saveLastSessionConfig,
} from '@/components/NewSession/preferences'
import {
    resolveSpawnModel,
    resolveSpawnThinkEffort,
    resolveSpawnServiceTier,
    resolveSpawnSessionSettings,
    normalizeNetworkPolicyInput,
    parseListInput,
    parsePreviewPortInput,
} from '@/components/NewSession/spawnPayload'

const AUTO_CLOUD_MACHINE_ID = 'auto'

const CLAUDE_DEFAULT_EFFORT: ThinkEffort = 'max'
const CODEX_DEFAULT_EFFORT: ThinkEffort = 'auto'

function getDefaultThinkEffort(agent: AgentType): ThinkEffort {
    if (agent === 'claude') return CLAUDE_DEFAULT_EFFORT
    if (agent === 'codex') return CODEX_DEFAULT_EFFORT
    return 'auto'
}

const QUICK_PROMPTS = [
    'Run security audit',
    'Improve AGENTS.md',
    'Solve a TODO',
]

const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
    { value: 'claude', label: 'Claude' },
    { value: 'codex', label: 'Codex' },
    { value: 'cursor', label: 'Cursor' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'opencode', label: 'OpenCode' },
]

const BACKEND_OPTIONS: { value: string; label: string }[] = [
    { value: 'local', label: 'Local' },
    { value: 'cloud-self-hosted', label: 'Self-hosted' },
    { value: 'cloud-managed', label: 'Managed' },
]

const RUNTIME_OPTIONS: { value: string; label: string }[] = [
    { value: 'host-process', label: 'Host' },
    { value: 'docker-session', label: 'Docker' },
    { value: 'daemon-session', label: 'Daemon' },
]

const LAUNCH_OPTIONS: { value: string; label: string }[] = [
    { value: 'interactive', label: 'Interactive' },
    { value: 'background', label: 'Background' },
]

const SESSION_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: 'simple', label: 'Simple' },
    { value: 'worktree', label: 'Worktree' },
]

const NETWORK_OPTIONS: { value: string; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'restricted', label: 'Restricted' },
    { value: 'off', label: 'Off' },
]

const WORKSPACE_MODE_OPTIONS: { value: string; label: string }[] = [
    { value: 'ephemeral', label: 'Ephemeral' },
    { value: 'persistent', label: 'Persistent' },
    { value: 'snapshot-derived', label: 'Snapshot' },
]

type PopoverName = 'model' | 'cloud' | 'config' | null

function isCloudBackend(backend: ExecutionBackend): boolean {
    return backend === 'cloud-self-hosted' || backend === 'cloud-managed'
}

function ChevronSvg() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function GearSvg() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

function SendSvg() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    )
}

function SpinnerSvg() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

export function HomeComposer(props: {
    api: ApiClient | null
    onOpenSession: (sessionId: string) => void
    sessions: SessionSummary[]
    renderAgentList: () => React.ReactNode
}) {
    const navigate = useNavigate()
    const lastConfig = loadLastSessionConfig()

    // ── Core state ──
    const [prompt, setPrompt] = useState('')
    const [repoUrl, setRepoUrl] = useState(() => lastConfig?.repositoryUrl ?? '')
    const [repoBranch, setRepoBranch] = useState(() => lastConfig?.repositoryBranch ?? '')
    const [showRepoPanel, setShowRepoPanel] = useState(false)
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => lastConfig?.workspaceMode ?? 'ephemeral')
    const [directory, setDirectory] = useState('')

    // ── Agent / Model state ──
    const initialAgent = lastConfig?.agent ?? loadPreferredAgent()
    const [agent, setAgent] = useState<AgentType>(initialAgent)
    const [model, setModel] = useState(() => {
        const opts = getModelOptionsForAgent(initialAgent)
        if (lastConfig?.model && opts.some(o => o.value === lastConfig.model)) return lastConfig.model
        return loadPreferredModel(initialAgent) ?? (opts[0]?.value ?? 'auto')
    })
    const [customModel, setCustomModel] = useState(() => lastConfig?.customModel ?? loadPreferredCustomModel(initialAgent))
    const [thinkEffort, setThinkEffort] = useState<ThinkEffort>(() => {
        const opts = getThinkEffortOptions(initialAgent)
        if (lastConfig?.thinkEffort && opts.some(o => o.value === lastConfig.thinkEffort)) return lastConfig.thinkEffort
        return loadPreferredThinkEffort(initialAgent) ?? getDefaultThinkEffort(initialAgent)
    })
    const [serviceTier, setServiceTier] = useState<ServiceTier>(() =>
        lastConfig?.serviceTier ?? loadPreferredServiceTier(initialAgent) ?? 'auto'
    )

    // ── Execution state ──
    const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>(() => lastConfig?.executionBackend ?? loadPreferredExecutionBackend())
    const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>(() => lastConfig?.runtimeKind ?? loadPreferredRuntimeKind())
    const [launchMode, setLaunchMode] = useState<'interactive' | 'background'>(() => lastConfig?.launchMode ?? 'interactive')
    const [machineId, setMachineId] = useState<string | null>(null)
    const [environmentId, setEnvironmentId] = useState(() => lastConfig?.environmentId ?? '')
    const [checkpointId, setCheckpointId] = useState(() => lastConfig?.checkpointId ?? '')

    // ── Session config state ──
    const [sessionType, setSessionType] = useState<SessionType>(() => lastConfig?.sessionType ?? loadPreferredSessionType())
    const [worktreeName, setWorktreeName] = useState(() => lastConfig?.worktreeName ?? '')
    const [yolo, setYolo] = useState(() => lastConfig?.yoloMode ?? loadPreferredYoloMode())
    const [networkPolicy, setNetworkPolicy] = useState<NetworkMode>(() => lastConfig?.networkPolicy ?? 'default')
    const [ttlMinutes, setTtlMinutes] = useState(() => lastConfig?.ttlMinutes ?? '')
    const [labels, setLabels] = useState(() => lastConfig?.labels ?? '')
    const [secrets, setSecrets] = useState(() => lastConfig?.secrets ?? '')
    const [previewUrl, setPreviewUrl] = useState(() => lastConfig?.previewUrl ?? '')
    const [previewAutoDetect, setPreviewAutoDetect] = useState(() => lastConfig?.previewAutoDetect ?? false)
    const [previewPreferredPort, setPreviewPreferredPort] = useState(() => lastConfig?.previewPreferredPort ?? '')

    // ── UI state ──
    const [spawnError, setSpawnError] = useState<string | null>(null)
    const [openPopover, setOpenPopover] = useState<PopoverName>(null)

    // ── Refs ──
    const modelChipRef = useRef<HTMLButtonElement>(null)
    const cloudChipRef = useRef<HTMLButtonElement>(null)
    const configChipRef = useRef<HTMLButtonElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── Hooks ──
    const { spawnSession, isPending } = useSpawnSession(props.api)
    const { machines } = useMachines(props.api, true)
    const isCloud = isCloudBackend(executionBackend)
    const { workers: cloudWorkers } = useCloudWorkers(props.api, isCloud)
    const { environments: cloudEnvironments } = useCloudEnvironments(props.api, isCloud)
    const { checkpoints: cloudCheckpoints } = useCloudCheckpoints(props.api, isCloud)

    // ── Derived data ──
    const selectableMachines = useMemo(() => {
        if (executionBackend === 'cloud-self-hosted') {
            return machines.filter(m => m.metadata?.executorType === 'cloud-self-hosted')
        }
        if (executionBackend === 'cloud-managed') {
            return machines.filter(m => m.metadata?.executorType === 'cloud-managed')
        }
        return machines.filter(m =>
            m.metadata?.executorType !== 'cloud-self-hosted' && m.metadata?.executorType !== 'cloud-managed'
        )
    }, [executionBackend, machines])

    const modelOptions = useMemo(() => getModelOptionsForAgent(agent), [agent])
    const thinkEffortOptions = useMemo(() => getThinkEffortOptions(agent), [agent])
    const modelLabel = useMemo(() => {
        if (customModel.trim()) return customModel.trim()
        return modelOptions.find(o => o.value === model)?.label ?? model
    }, [model, customModel, modelOptions])
    const effortLabel = useMemo(() => {
        if (thinkEffortOptions.length === 0) return null
        return thinkEffortOptions.find(o => o.value === thinkEffort)?.label ?? thinkEffort
    }, [thinkEffort, thinkEffortOptions])

    // ── Auto-select machine ──
    useEffect(() => {
        if (isCloud) {
            if (runtimeKind !== 'docker-session' && runtimeKind !== 'daemon-session') {
                setRuntimeKind('docker-session')
            }
            if (machineId === AUTO_CLOUD_MACHINE_ID) return
            if (machineId && selectableMachines.some(m => m.id === machineId)) return
            setMachineId(AUTO_CLOUD_MACHINE_ID)
            return
        }
        if (selectableMachines.length === 0) return
        if (machineId && selectableMachines.some(m => m.id === machineId)) return
        setMachineId(selectableMachines[0]?.id ?? null)
    }, [executionBackend, isCloud, machineId, runtimeKind, selectableMachines])

    // ── Sync agent change → model/effort/serviceTier ──
    useEffect(() => {
        setModel(loadPreferredModel(agent) ?? (getModelOptionsForAgent(agent)[0]?.value ?? 'auto'))
        setCustomModel(loadPreferredCustomModel(agent))
        setThinkEffort(loadPreferredThinkEffort(agent) ?? getDefaultThinkEffort(agent))
        setServiceTier(loadPreferredServiceTier(agent) ?? 'auto')
    }, [agent])

    // ── Popover toggle ──
    const togglePopover = useCallback((name: PopoverName) => {
        setOpenPopover(prev => (prev === name ? null : name))
    }, [])
    const closePopover = useCallback(() => setOpenPopover(null), [])

    // ── Submit ──
    const handleSubmit = useCallback(async () => {
        const trimmedPrompt = prompt.trim()
        if (!trimmedPrompt || isPending) return

        const resolvedMachineId = isCloud
            ? (machineId ?? AUTO_CLOUD_MACHINE_ID)
            : (machineId ?? selectableMachines[0]?.id)

        if (!resolvedMachineId) {
            setSpawnError('No machine available. Please check your settings.')
            return
        }

        setSpawnError(null)

        try {
            const resolvedModel = resolveSpawnModel(agent, model, customModel)
            const resolvedThinkEffort = resolveSpawnThinkEffort(agent, thinkEffort)
            const resolvedServiceTier = resolveSpawnServiceTier(agent, serviceTier)
            const parsedNetworkPolicy = normalizeNetworkPolicyInput(networkPolicy)
            const parsedLabels = parseListInput(labels)
            const parsedSecrets = parseListInput(secrets)
            const parsedPreviewPort = parsePreviewPortInput(previewPreferredPort)
            const sessionSettings = resolveSpawnSessionSettings(sessionType, worktreeName, previewUrl)

            const trimmedRepoUrl = repoUrl.trim()
            const trimmedCheckpointId = checkpointId.trim()
            const workspaceSource: WorkspaceSource | undefined = isCloud && trimmedRepoUrl
                ? {
                    type: 'repo',
                    repository: {
                        url: trimmedRepoUrl,
                        ref: repoBranch.trim() ? { branch: repoBranch.trim() } : undefined,
                    },
                }
                : undefined
            const workspace: WorkspaceSpec | undefined = isCloud
                ? { mode: workspaceMode }
                : undefined
            const spawnDirectory = workspaceSource?.type === 'repo'
                ? undefined
                : directory.trim() || undefined
            const ttlValue = ttlMinutes.trim() ? Number(ttlMinutes.trim()) : undefined
            const cloudEnvironment: EnvironmentTemplate | undefined = environmentId.trim()
                ? {
                    id: environmentId.trim(),
                    runtime: {
                        kind: runtimeKind,
                        checkpointId: trimmedCheckpointId || undefined,
                    },
                }
                : runtimeKind !== 'host-process'
                    ? {
                        runtime: {
                            kind: runtimeKind,
                            checkpointId: trimmedCheckpointId || undefined,
                        },
                    }
                    : undefined

            const result = await spawnSession({
                machineId: resolvedMachineId,
                directory: spawnDirectory,
                agent,
                model: resolvedModel,
                thinkEffort: resolvedThinkEffort,
                serviceTier: resolvedServiceTier,
                yolo,
                sessionType: sessionSettings.sessionType,
                worktreeName: sessionSettings.worktreeName,
                previewUrl: sessionSettings.previewUrl,
                executionBackend,
                runtimeKind,
                launchMode,
                environmentId: environmentId.trim() || undefined,
                environment: cloudEnvironment,
                checkpointId: isCloud ? (trimmedCheckpointId || undefined) : undefined,
                repoSyncPolicy: isCloud ? 'fetch-reset' : undefined,
                workspaceSource,
                workspace,
                networkPolicy: parsedNetworkPolicy,
                ttlMinutes: typeof ttlValue === 'number' && Number.isFinite(ttlValue) && ttlValue > 0 ? ttlValue : undefined,
                persistentWorkspace: workspaceMode === 'persistent',
                labels: parsedLabels,
                secrets: parsedSecrets,
                preview: {
                    autoDetect: previewAutoDetect,
                    preferredPort: parsedPreviewPort,
                },
                initialPrompt: trimmedPrompt,
            })

            if (result.type === 'success') {
                // Save preferences on success
                const customModelValue = customModel.trim()
                savePreferredAgent(agent)
                savePreferredModel(agent, model)
                savePreferredCustomModel(agent, customModelValue)
                savePreferredThinkEffort(agent, thinkEffort)
                savePreferredServiceTier(agent, serviceTier)
                savePreferredYoloMode(yolo)
                savePreferredSessionType(sessionType)
                savePreferredExecutionBackend(executionBackend)
                savePreferredRuntimeKind(runtimeKind)
                saveLastSessionConfig({
                    agent,
                    model,
                    customModel: customModelValue,
                    thinkEffort,
                    serviceTier,
                    yoloMode: yolo,
                    sessionType,
                    worktreeName: worktreeName.trim(),
                    previewUrl: previewUrl.trim(),
                    executionBackend,
                    runtimeKind,
                    launchMode,
                    environmentId: environmentId.trim(),
                    checkpointId: trimmedCheckpointId,
                    repositoryUrl: trimmedRepoUrl,
                    repositoryBranch: repoBranch.trim(),
                    workspaceMode,
                    networkPolicy,
                    ttlMinutes: ttlMinutes.trim(),
                    labels: labels.trim(),
                    secrets: secrets.trim(),
                    previewAutoDetect,
                    previewPreferredPort: previewPreferredPort.trim(),
                })
                props.onOpenSession(result.sessionId)
                return
            }

            if (result.type === 'accepted') {
                // Save preferences on accepted too
                savePreferredAgent(agent)
                savePreferredExecutionBackend(executionBackend)
                savePreferredRuntimeKind(runtimeKind)
                void navigate({ to: '/settings/requests/$requestId', params: { requestId: result.requestId } })
                return
            }

            if (result.type === 'error') {
                setSpawnError(result.message)
                return
            }

            if (result.type === 'requestToApproveDirectoryCreation') {
                setSpawnError(`Directory creation requires approval: ${result.directory}`)
            }
        } catch (e) {
            setSpawnError(e instanceof Error ? e.message : 'Failed to spawn session')
        }
    }, [
        prompt, isPending, isCloud, machineId, selectableMachines, agent, model, customModel,
        thinkEffort, serviceTier, networkPolicy, labels, secrets, previewPreferredPort,
        sessionType, worktreeName, previewUrl, repoUrl, repoBranch, checkpointId,
        workspaceMode, directory, ttlMinutes, environmentId, runtimeKind, yolo,
        executionBackend, launchMode, previewAutoDetect, spawnSession, props, navigate,
    ])

    // ── Keyboard handler for textarea ──
    const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void handleSubmit()
        }
    }, [handleSubmit])

    // ── Quick prompt buttons ──
    const handleQuickPrompt = useCallback((text: string) => {
        setPrompt(text)
        textareaRef.current?.focus()
    }, [])

    const hasPrompt = prompt.trim().length > 0

    return (
        <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto">
            <div className="content-wrapper">
                <div className="home-hero">
                    <div className="home-eyebrow">New agent</div>

                    {/* ── Repo selector ── */}
                    <div className="repo-selector">
                        {showRepoPanel ? (
                            <div className="chip-popover-group">
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Repository URL</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <input
                                            type="text"
                                            className="chip-popover-input"
                                            placeholder="https://github.com/org/repo"
                                            value={repoUrl}
                                            onChange={e => setRepoUrl(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Branch</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <input
                                            type="text"
                                            className="chip-popover-input"
                                            placeholder="main"
                                            value={repoBranch}
                                            onChange={e => setRepoBranch(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Workspace</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <PopoverPillRow
                                            options={WORKSPACE_MODE_OPTIONS}
                                            value={workspaceMode}
                                            onChange={v => setWorkspaceMode(v as WorkspaceMode)}
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="repo-btn"
                                    onClick={() => setShowRepoPanel(false)}
                                >
                                    Collapse
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="repo-btn"
                                onClick={() => setShowRepoPanel(true)}
                            >
                                Select repository &#9662;
                            </button>
                        )}
                    </div>

                    {/* ── Prompt card ── */}
                    <div className="prompt-container">
                        <div className="prompt-card">
                            <textarea
                                ref={textareaRef}
                                className="prompt-input"
                                placeholder="What should the agent do?"
                                rows={4}
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                onKeyDown={handleTextareaKeyDown}
                            />
                            <div className="prompt-footer">
                                <div className="prompt-tools">
                                    {/* Model chip */}
                                    <button
                                        ref={modelChipRef}
                                        type="button"
                                        className="tool-chip"
                                        onClick={() => togglePopover('model')}
                                    >
                                        {agent}{' '}
                                        {modelLabel}
                                        {effortLabel ? ` ${effortLabel}` : ''}
                                        {' '}<ChevronSvg />
                                    </button>

                                    {/* Cloud chip */}
                                    <button
                                        ref={cloudChipRef}
                                        type="button"
                                        className="tool-chip"
                                        onClick={() => togglePopover('cloud')}
                                    >
                                        {isCloud ? 'Cloud' : 'Local'}
                                        {isCloud ? (
                                            <span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-1" />
                                        ) : null}
                                        {' '}<ChevronSvg />
                                    </button>

                                    {/* Config chip */}
                                    <button
                                        ref={configChipRef}
                                        type="button"
                                        className="tool-chip"
                                        onClick={() => togglePopover('config')}
                                    >
                                        <GearSvg /> <ChevronSvg />
                                    </button>
                                </div>
                                <div className="prompt-actions">
                                    <button
                                        type="button"
                                        className={`action-btn ${hasPrompt ? 'active' : ''}`}
                                        disabled={!hasPrompt || isPending}
                                        onClick={() => void handleSubmit()}
                                    >
                                        {isPending ? <SpinnerSvg /> : <SendSvg />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Spawn error ── */}
                    {spawnError ? (
                        <div className="mt-2 text-sm text-red-400">{spawnError}</div>
                    ) : null}

                    {/* ── Quick prompt pills ── */}
                    <div className="action-pills">
                        {QUICK_PROMPTS.map(text => (
                            <button
                                key={text}
                                type="button"
                                className="pill-btn"
                                onClick={() => handleQuickPrompt(text)}
                            >
                                {text}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Agent list ── */}
                {props.renderAgentList()}

                {/* ═══ MODEL POPOVER ═══ */}
                <ChipPopover open={openPopover === 'model'} onClose={closePopover} anchorRef={modelChipRef} width={300}>
                    <PopoverGroup label="Agent">
                        {AGENT_OPTIONS.map(opt => (
                            <PopoverOption
                                key={opt.value}
                                selected={agent === opt.value}
                                onClick={() => setAgent(opt.value)}
                            >
                                {opt.label}
                            </PopoverOption>
                        ))}
                    </PopoverGroup>

                    {modelOptions.length > 0 ? (
                        <PopoverGroup label="Model">
                            {modelOptions.map(opt => (
                                <PopoverOption
                                    key={opt.value}
                                    selected={model === opt.value && !customModel.trim()}
                                    onClick={() => { setModel(opt.value); setCustomModel('') }}
                                >
                                    {opt.label}
                                </PopoverOption>
                            ))}
                            <PopoverRow label="Custom">
                                <input
                                    type="text"
                                    className="chip-popover-input"
                                    placeholder="model-id"
                                    value={customModel}
                                    onChange={e => setCustomModel(e.target.value)}
                                />
                            </PopoverRow>
                        </PopoverGroup>
                    ) : null}

                    {thinkEffortOptions.length > 0 ? (
                        <PopoverGroup label="Think effort">
                            <PopoverPillRow
                                options={thinkEffortOptions.map(o => ({ value: o.value, label: o.label }))}
                                value={thinkEffort}
                                onChange={v => setThinkEffort(v as ThinkEffort)}
                            />
                        </PopoverGroup>
                    ) : null}

                    {agent === 'codex' ? (
                        <PopoverGroup label="Service tier">
                            <PopoverPillRow
                                options={CODEX_SERVICE_TIER_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                                value={serviceTier}
                                onChange={v => setServiceTier(v as ServiceTier)}
                            />
                        </PopoverGroup>
                    ) : null}
                </ChipPopover>

                {/* ═══ CLOUD POPOVER ═══ */}
                <ChipPopover open={openPopover === 'cloud'} onClose={closePopover} anchorRef={cloudChipRef} width={300}>
                    <PopoverGroup label="Execution backend">
                        <PopoverPillRow
                            options={BACKEND_OPTIONS}
                            value={executionBackend}
                            onChange={v => setExecutionBackend(v as ExecutionBackend)}
                        />
                    </PopoverGroup>

                    {selectableMachines.length > 0 ? (
                        <PopoverGroup label="Machine">
                            {isCloud ? (
                                <PopoverOption
                                    selected={machineId === AUTO_CLOUD_MACHINE_ID}
                                    onClick={() => setMachineId(AUTO_CLOUD_MACHINE_ID)}
                                >
                                    Auto
                                </PopoverOption>
                            ) : null}
                            {selectableMachines.map(m => (
                                <PopoverOption
                                    key={m.id}
                                    selected={machineId === m.id}
                                    onClick={() => setMachineId(m.id)}
                                >
                                    {m.name ?? m.id}
                                </PopoverOption>
                            ))}
                        </PopoverGroup>
                    ) : null}

                    <PopoverGroup label="Runtime">
                        <PopoverPillRow
                            options={RUNTIME_OPTIONS}
                            value={runtimeKind}
                            onChange={v => setRuntimeKind(v as RuntimeKind)}
                        />
                    </PopoverGroup>

                    {isCloud && cloudEnvironments.length > 0 ? (
                        <PopoverGroup label="Environment">
                            <PopoverOption
                                selected={!environmentId.trim()}
                                onClick={() => setEnvironmentId('')}
                            >
                                None
                            </PopoverOption>
                            {cloudEnvironments.map(env => (
                                <PopoverOption
                                    key={env.id}
                                    selected={environmentId === env.id}
                                    onClick={() => setEnvironmentId(env.id)}
                                >
                                    {env.id}
                                </PopoverOption>
                            ))}
                        </PopoverGroup>
                    ) : null}

                    {isCloud && cloudCheckpoints.length > 0 ? (
                        <PopoverGroup label="Checkpoint">
                            <PopoverOption
                                selected={!checkpointId.trim()}
                                onClick={() => setCheckpointId('')}
                            >
                                None
                            </PopoverOption>
                            {cloudCheckpoints.map(cp => (
                                <PopoverOption
                                    key={cp.id}
                                    selected={checkpointId === cp.id}
                                    onClick={() => setCheckpointId(cp.id)}
                                >
                                    {cp.id}
                                </PopoverOption>
                            ))}
                        </PopoverGroup>
                    ) : null}

                    <PopoverGroup label="Launch mode">
                        <PopoverPillRow
                            options={LAUNCH_OPTIONS}
                            value={launchMode}
                            onChange={v => setLaunchMode(v as 'interactive' | 'background')}
                        />
                    </PopoverGroup>
                </ChipPopover>

                {/* ═══ CONFIG POPOVER ═══ */}
                <ChipPopover open={openPopover === 'config'} onClose={closePopover} anchorRef={configChipRef} width={300}>
                    <PopoverGroup label="Session type">
                        <PopoverPillRow
                            options={SESSION_TYPE_OPTIONS}
                            value={sessionType}
                            onChange={v => setSessionType(v as SessionType)}
                        />
                        {sessionType === 'worktree' ? (
                            <PopoverRow label="Worktree name">
                                <input
                                    type="text"
                                    className="chip-popover-input"
                                    placeholder="feature-branch"
                                    value={worktreeName}
                                    onChange={e => setWorktreeName(e.target.value)}
                                />
                            </PopoverRow>
                        ) : null}
                    </PopoverGroup>

                    <PopoverGroup label="Permissions">
                        <PopoverRow label="YOLO mode">
                            <button
                                type="button"
                                className={`chip-popover-pill ${yolo ? 'active' : ''}`}
                                onClick={() => setYolo(prev => !prev)}
                            >
                                {yolo ? 'On' : 'Off'}
                            </button>
                        </PopoverRow>
                    </PopoverGroup>

                    <PopoverGroup label="Network">
                        <PopoverPillRow
                            options={NETWORK_OPTIONS}
                            value={networkPolicy}
                            onChange={v => setNetworkPolicy(v as NetworkMode)}
                        />
                    </PopoverGroup>

                    <PopoverGroup label="TTL">
                        <PopoverRow label="Minutes">
                            <input
                                type="text"
                                className="chip-popover-input"
                                placeholder="60"
                                value={ttlMinutes}
                                onChange={e => setTtlMinutes(e.target.value)}
                            />
                        </PopoverRow>
                    </PopoverGroup>

                    <PopoverGroup label="Labels & Secrets">
                        <PopoverRow label="Labels">
                            <input
                                type="text"
                                className="chip-popover-input"
                                placeholder="key=value, ..."
                                value={labels}
                                onChange={e => setLabels(e.target.value)}
                            />
                        </PopoverRow>
                        <PopoverRow label="Secrets">
                            <input
                                type="text"
                                className="chip-popover-input"
                                placeholder="SECRET_NAME, ..."
                                value={secrets}
                                onChange={e => setSecrets(e.target.value)}
                            />
                        </PopoverRow>
                    </PopoverGroup>

                    <PopoverGroup label="Preview">
                        <PopoverRow label="URL">
                            <input
                                type="text"
                                className="chip-popover-input"
                                placeholder="http://localhost:3000"
                                value={previewUrl}
                                onChange={e => setPreviewUrl(e.target.value)}
                            />
                        </PopoverRow>
                        <PopoverRow label="Auto-detect">
                            <button
                                type="button"
                                className={`chip-popover-pill ${previewAutoDetect ? 'active' : ''}`}
                                onClick={() => setPreviewAutoDetect(prev => !prev)}
                            >
                                {previewAutoDetect ? 'On' : 'Off'}
                            </button>
                        </PopoverRow>
                        <PopoverRow label="Preferred port">
                            <input
                                type="text"
                                className="chip-popover-input"
                                placeholder="3000"
                                value={previewPreferredPort}
                                onChange={e => setPreviewPreferredPort(e.target.value)}
                            />
                        </PopoverRow>
                    </PopoverGroup>
                </ChipPopover>
            </div>
        </div>
    )
}
