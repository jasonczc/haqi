import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import type {
    ExecutionBackend,

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
import { queryKeys } from '@/lib/query-keys'
import {
    ChipPopover,
    PopoverGroup,
    PopoverRow,
    PopoverOption,
    PopoverPillRow,
} from '@/components/ChipPopover'
import {

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
    const [repoBranchMode, setRepoBranchMode] = useState<'create' | 'reuse' | 'detached'>(() => lastConfig?.repositoryBranchMode ?? 'create')
    const [repoBranchPrefix, setRepoBranchPrefix] = useState(() => lastConfig?.repositoryBranchPrefix ?? 'haqi/')
    const [repoBranchName, setRepoBranchName] = useState(() => lastConfig?.repositoryBranchName ?? '')
    const [gitName, setGitName] = useState(() => lastConfig?.gitName ?? '')
    const [gitEmail, setGitEmail] = useState(() => lastConfig?.gitEmail ?? '')
    const [showRepoPanel, setShowRepoPanel] = useState(false)
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => lastConfig?.workspaceMode ?? 'ephemeral')
    const [directory] = useState('')

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
    // Search filters for long machine / checkpoint lists inside the Cloud popover
    const [machineSearch, setMachineSearch] = useState('')
    const [checkpointSearch, setCheckpointSearch] = useState('')

    // ── Refs ──
    const modelChipRef = useRef<HTMLButtonElement>(null)
    const cloudChipRef = useRef<HTMLButtonElement>(null)
    const configChipRef = useRef<HTMLButtonElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── Hooks ──
    const queryClient = useQueryClient()
    const { spawnSession, isPending } = useSpawnSession(props.api)
    const { machines } = useMachines(props.api, true)
    const isCloud = isCloudBackend(executionBackend)
    const { workers: allWorkers } = useCloudWorkers(props.api, true, undefined, 3000) // always enabled for phase detection
    const { environments: cloudEnvironments } = useCloudEnvironments(props.api, isCloud)
    const { checkpoints: cloudCheckpoints } = useCloudCheckpoints(props.api, true) // always enabled for phase detection
    const cloudAgentSettingsQuery = useQuery({
        queryKey: queryKeys.cloudAgentSettings,
        enabled: Boolean(props.api),
        queryFn: async () => {
            if (!props.api) throw new Error('API unavailable')
            return await props.api.getCloudAgentSettings()
        }
    })
    const localRuntimeQuery = useQuery({
        queryKey: queryKeys.localRuntime,
        enabled: Boolean(props.api),
        refetchInterval: 3000,
        queryFn: async () => {
            if (!props.api) {
                throw new Error('API unavailable')
            }
            return await props.api.getLocalRuntimeStatus()
        }
    })

    useEffect(() => {
        const settings = cloudAgentSettingsQuery.data?.settings
        if (!settings) return
        if (!lastConfig?.repositoryUrl && !repoUrl.trim() && settings.defaultRepositoryUrl) {
            setRepoUrl(settings.defaultRepositoryUrl)
        }
        if (!lastConfig?.repositoryBranch && !repoBranch.trim() && settings.baseBranch) {
            setRepoBranch(settings.baseBranch)
        }
        if (!lastConfig?.repositoryBranchPrefix && !repoBranchPrefix.trim() && settings.branchPrefix) {
            setRepoBranchPrefix(settings.branchPrefix)
        }
        if (!lastConfig?.gitName && !gitName.trim() && settings.gitName) {
            setGitName(settings.gitName)
        }
        if (!lastConfig?.gitEmail && !gitEmail.trim() && settings.gitEmail) {
            setGitEmail(settings.gitEmail)
        }
    }, [
        cloudAgentSettingsQuery.data?.settings,
        gitEmail,
        gitName,
        lastConfig?.gitEmail,
        lastConfig?.gitName,
        lastConfig?.repositoryBranch,
        lastConfig?.repositoryBranchPrefix,
        lastConfig?.repositoryUrl,
        repoBranch,
        repoBranchPrefix,
        repoUrl
    ])

    // ── Phase detection ──
    const hasConnectedWorker = allWorkers.some(w => w.active)
    const selectableWorker = allWorkers.find(w => w.active && w.selectable)
    const hasSelectableWorker = Boolean(selectableWorker)
    const activeWorkerFailure = allWorkers.find(w => w.active && w.selectable === false)?.runnerState?.lastWorkspaceError?.message
        ?? allWorkers.find(w => w.active && w.selectable === false)?.runnerState?.lastSpawnError?.message
        ?? null
    const runtimeReady = Boolean(localRuntimeQuery.data?.ready)
    const runtimeBuilding = Boolean(localRuntimeQuery.data?.running)
    const runtimeLogs = localRuntimeQuery.data?.logs ?? []
    const runtimeMessage = runtimeLogs.at(-1) ?? null
    const hasCheckpoint = cloudCheckpoints.length > 0
    const [skipOnboard, setSkipOnboard] = useState(() => localStorage.getItem('haqi-onboard-skip') === 'true')
    const [startingLocalWorker, setStartingLocalWorker] = useState(false)
    const [localWorkerError, setLocalWorkerError] = useState<string | null>(null)
    const [setupAgent, setSetupAgent] = useState<'claude' | 'codex'>('claude')
    const [setupRepoUrl, setSetupRepoUrl] = useState('')

    const onboardPhase: 'worker' | 'runtime' | 'setup' | 'ready' =
        !hasConnectedWorker ? 'worker' :
        !runtimeReady ? 'runtime' :
        !hasCheckpoint && !skipOnboard ? 'setup' :
        'ready'

    const handleSkipOnboard = useCallback(() => {
        setSkipOnboard(true)
        localStorage.setItem('haqi-onboard-skip', 'true')
    }, [])

    const handleStartLocalWorker = useCallback(async () => {
        if (!props.api) return
        setStartingLocalWorker(true)
        setLocalWorkerError(null)
        try {
            await props.api.startLocalWorker()
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch (err: any) {
            setLocalWorkerError(err?.message ?? 'Failed to start worker')
        } finally {
            setStartingLocalWorker(false)
        }
    }, [props.api, queryClient])

    const handleStartSetup = useCallback(async () => {
        const worker = selectableWorker
        if (!worker) {
            setLocalWorkerError(activeWorkerFailure ?? 'Worker is online but not ready yet')
            return
        }
        try {
            const result = await spawnSession({
                machineId: worker.machineId,
                agent: setupAgent,
                sessionType: 'setup',
                executionBackend: (worker as any).executorType ?? 'cloud-self-hosted',
                runtimeKind: 'daemon-session',
                yolo: true,
                workspaceSource: setupRepoUrl.trim() ? { repository: { url: setupRepoUrl.trim() } } : undefined,
            })
            if (result.type === 'success' && result.sessionId) {
                props.onOpenSession(result.sessionId)
            } else if (result.type === 'accepted') {
                navigate({ to: '/settings/requests/$requestId', params: { requestId: result.requestId } })
            }
        } catch (err: any) {
            setLocalWorkerError(err?.message ?? 'Failed to start setup')
        }
    }, [selectableWorker, activeWorkerFailure, setupAgent, setupRepoUrl, spawnSession, props, navigate])

    const handlePrepareRuntime = useCallback(async () => {
        if (!props.api) return
        setLocalWorkerError(null)
        try {
            await props.api.prepareLocalRuntime()
            await queryClient.invalidateQueries({ queryKey: queryKeys.localRuntime })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch (err: any) {
            setLocalWorkerError(err?.message ?? 'Failed to prepare runtime')
        }
    }, [props.api, queryClient])

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

    // ── Apply one-shot preset from sessionStorage (set by Settings → Checkpoints links) ──
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('home-composer-preset')
            if (!raw) return
            sessionStorage.removeItem('home-composer-preset')
            const preset = JSON.parse(raw) as { checkpointId?: string; sessionType?: SessionType }
            if (preset.checkpointId) {
                setCheckpointId(preset.checkpointId)
                setRuntimeKind('daemon-session')
            }
            if (preset.sessionType) {
                setSessionType(preset.sessionType)
            }
        } catch { /* ignore malformed preset */ }
        // Run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Auto-select machine ──
    useEffect(() => {
        if (isCloud) {
            if (runtimeKind !== 'daemon-session') {
                setRuntimeKind('daemon-session')
            }
            // If the chosen cloud backend has no live workers, fall back to the other one.
            // Users don't need to understand the self-hosted vs managed distinction —
            // we pick whichever backend actually has capacity.
            if (selectableMachines.length === 0) {
                const fallback: ExecutionBackend = executionBackend === 'cloud-managed' ? 'cloud-self-hosted' : 'cloud-managed'
                const fallbackHasMachines = machines.some(m => m.metadata?.executorType === fallback)
                if (fallbackHasMachines) {
                    setExecutionBackend(fallback)
                    return
                }
            }
            if (machineId === AUTO_CLOUD_MACHINE_ID) return
            if (machineId && selectableMachines.some(m => m.id === machineId)) return
            setMachineId(AUTO_CLOUD_MACHINE_ID)
            return
        }
        if (runtimeKind !== 'host-process') {
            setRuntimeKind('host-process')
        }
        if (selectableMachines.length === 0) return
        if (machineId && selectableMachines.some(m => m.id === machineId)) return
        setMachineId(selectableMachines[0]?.id ?? null)
    }, [executionBackend, isCloud, machineId, runtimeKind, selectableMachines, machines])

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
    const closePopover = useCallback(() => {
        setOpenPopover(null)
        // Reset in-popover search state so reopening starts fresh
        setMachineSearch('')
        setCheckpointSearch('')
    }, [])

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
                        branchStrategy: {
                            mode: repoBranchMode,
                            ...(repoBranch.trim() ? { baseBranch: repoBranch.trim() } : {}),
                            ...(repoBranchMode === 'create' && repoBranchPrefix.trim() ? { prefix: repoBranchPrefix.trim() } : {}),
                            ...(repoBranchMode === 'create' && repoBranchName.trim() ? { name: repoBranchName.trim() } : {})
                        }
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
                gitIdentity: {
                    ...(gitName.trim() ? { name: gitName.trim() } : {}),
                    ...(gitEmail.trim() ? { email: gitEmail.trim() } : {}),
                    ...(cloudAgentSettingsQuery.data?.settings.githubUsername?.trim()
                        ? { githubUsername: cloudAgentSettingsQuery.data.settings.githubUsername.trim() }
                        : {}),
                },
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
                    repositoryBranchMode: repoBranchMode,
                    repositoryBranchPrefix: repoBranchPrefix.trim(),
                    repositoryBranchName: repoBranchName.trim(),
                    gitName: gitName.trim(),
                    gitEmail: gitEmail.trim(),
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
                    repositoryBranchMode: repoBranchMode,
                    repositoryBranchPrefix: repoBranchPrefix.trim(),
                    repositoryBranchName: repoBranchName.trim(),
                    gitName: gitName.trim(),
                    gitEmail: gitEmail.trim(),
                    workspaceMode,
                    networkPolicy,
                    ttlMinutes: ttlMinutes.trim(),
                    labels: labels.trim(),
                    secrets: secrets.trim(),
                    previewAutoDetect,
                    previewPreferredPort: previewPreferredPort.trim(),
                })
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
        sessionType, worktreeName, previewUrl, repoUrl, repoBranch, repoBranchMode, repoBranchPrefix, repoBranchName, gitName, gitEmail, checkpointId,
        workspaceMode, directory, ttlMinutes, environmentId, runtimeKind, yolo,
        executionBackend, launchMode, previewAutoDetect, spawnSession, props, navigate, cloudAgentSettingsQuery.data?.settings.githubUsername,
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

                    {/* ── Phase 1: No worker ── */}
                    {onboardPhase === 'worker' ? (
                        <div className="prompt-container">
                            <div className="prompt-card" style={{ padding: '24px' }}>
                                <div className="chip-popover-label" style={{ padding: 0, marginBottom: 8, fontSize: 14, textTransform: 'none', letterSpacing: 'normal', color: 'var(--cursor-text-primary)', fontWeight: 600 }}>
                                    Connect a worker to start
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--cursor-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                                    A worker runs on your machine and executes agent tasks. Start one with a single click.
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className="action-btn active"
                                        style={{ width: 'auto', borderRadius: 8, padding: '8px 16px', height: 'auto', fontSize: 13, gap: 6 }}
                                        onClick={handleStartLocalWorker}
                                        disabled={startingLocalWorker}
                                    >
                                        {startingLocalWorker ? <SpinnerSvg /> : null}
                                        {startingLocalWorker ? 'Starting...' : 'Start Worker on This Machine'}
                                    </button>
                                </div>
                                {localWorkerError ? (
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cursor-danger, #dc2626)' }}>{localWorkerError}</div>
                                ) : null}
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--cursor-text-tertiary)' }}>
                                    {startingLocalWorker ? 'Starting worker...' : 'Waiting for worker to come online...'}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* ── Phase 2: Prepare runtime ── */}
                    {onboardPhase === 'runtime' ? (
                        <div className="prompt-container">
                            <div className="prompt-card" style={{ padding: '24px' }}>
                                <div style={{ fontSize: 14, color: 'var(--cursor-text-primary)', fontWeight: 600, marginBottom: 8 }}>
                                    Prepare runtime
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--cursor-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                                    Build the Docker runtime image once on this worker before starting setup sessions.
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className="action-btn active"
                                        style={{ width: 'auto', borderRadius: 8, padding: '8px 16px', height: 'auto', fontSize: 13, gap: 6 }}
                                        onClick={handlePrepareRuntime}
                                        disabled={runtimeBuilding}
                                    >
                                        {runtimeBuilding ? <SpinnerSvg /> : null}
                                        {runtimeBuilding ? 'Preparing...' : 'Prepare Runtime'}
                                    </button>
                                </div>
                                {localWorkerError ? (
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cursor-danger, #dc2626)' }}>{localWorkerError}</div>
                                ) : null}
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--cursor-text-tertiary)' }}>
                                    {runtimeBuilding
                                        ? (runtimeMessage ?? 'Building haqi-workspace:dev...')
                                        : 'Docker runtime image is not ready yet.'}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* ── Phase 3: No checkpoint ── */}
                    {onboardPhase === 'setup' ? (
                        <div className="prompt-container">
                            <div className="prompt-card" style={{ padding: '24px' }}>
                                <div style={{ fontSize: 14, color: 'var(--cursor-text-primary)', fontWeight: 600, marginBottom: 8 }}>
                                    Setup your environment
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--cursor-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                                    Start a setup session to install dependencies. Save a checkpoint when done to reuse the environment instantly.
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                    <input
                                        type="text"
                                        className="chip-popover-input"
                                        placeholder="Repository URL (optional)"
                                        value={setupRepoUrl}
                                        onChange={e => setSetupRepoUrl(e.target.value)}
                                    />
                                    <div className="chip-popover-pills">
                                        <button type="button" className={`chip-popover-pill ${setupAgent === 'claude' ? 'active' : ''}`} onClick={() => setSetupAgent('claude')}>Claude</button>
                                        <button type="button" className={`chip-popover-pill ${setupAgent === 'codex' ? 'active' : ''}`} onClick={() => setSetupAgent('codex')}>Codex</button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className="action-btn active"
                                        style={{ width: 'auto', borderRadius: 8, padding: '8px 16px', height: 'auto', fontSize: 13 }}
                                        onClick={handleStartSetup}
                                        disabled={isPending || !hasSelectableWorker}
                                    >
                                        {isPending ? <SpinnerSvg /> : null}
                                        {isPending ? 'Starting...' : 'Start Setup Session'}
                                    </button>
                                    <button
                                        type="button"
                                        className="pill-btn"
                                        onClick={handleSkipOnboard}
                                    >
                                        Skip — use without Docker
                                    </button>
                                </div>
                                {!hasSelectableWorker ? (
                                    <div style={{ marginTop: 8, fontSize: 12, color: activeWorkerFailure ? 'var(--cursor-danger, #dc2626)' : 'var(--cursor-text-tertiary)' }}>
                                        {activeWorkerFailure ?? 'Worker connected. Waiting for it to become ready...'}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {/* ── Phase 3: Normal composer ── */}
                    {onboardPhase !== 'ready' ? null : (<>

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
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Branch mode</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <PopoverPillRow
                                            options={[
                                                { value: 'create', label: 'Create' },
                                                { value: 'reuse', label: 'Reuse' },
                                                { value: 'detached', label: 'Detached' },
                                            ]}
                                            value={repoBranchMode}
                                            onChange={v => setRepoBranchMode(v as 'create' | 'reuse' | 'detached')}
                                        />
                                    </div>
                                </div>
                                {repoBranchMode === 'create' ? (
                                    <>
                                        <div className="chip-popover-row">
                                            <div className="chip-popover-row-left">
                                                <span className="chip-popover-row-label">Branch prefix</span>
                                            </div>
                                            <div className="chip-popover-row-right">
                                                <input
                                                    type="text"
                                                    className="chip-popover-input"
                                                    placeholder="haqi/"
                                                    value={repoBranchPrefix}
                                                    onChange={e => setRepoBranchPrefix(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="chip-popover-row">
                                            <div className="chip-popover-row-left">
                                                <span className="chip-popover-row-label">Branch name</span>
                                            </div>
                                            <div className="chip-popover-row-right">
                                                <input
                                                    type="text"
                                                    className="chip-popover-input"
                                                    placeholder="auto from prompt"
                                                    value={repoBranchName}
                                                    onChange={e => setRepoBranchName(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Git name</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <input
                                            type="text"
                                            className="chip-popover-input"
                                            placeholder="Jane Doe"
                                            value={gitName}
                                            onChange={e => setGitName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="chip-popover-row">
                                    <div className="chip-popover-row-left">
                                        <span className="chip-popover-row-label">Git email</span>
                                    </div>
                                    <div className="chip-popover-row-right">
                                        <input
                                            type="email"
                                            className="chip-popover-input"
                                            placeholder="jane@example.com"
                                            value={gitEmail}
                                            onChange={e => setGitEmail(e.target.value)}
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
                    </>)}
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
                            {selectableMachines.length > 4 ? (
                                <div className="chip-popover-search">
                                    <input
                                        type="text"
                                        className="chip-popover-input"
                                        placeholder="Search machines…"
                                        value={machineSearch}
                                        onChange={(e) => setMachineSearch(e.target.value)}
                                    />
                                </div>
                            ) : null}
                            <div className="chip-popover-scrollable">
                                {isCloud && !machineSearch.trim() ? (
                                    <PopoverOption
                                        selected={machineId === AUTO_CLOUD_MACHINE_ID}
                                        onClick={() => setMachineId(AUTO_CLOUD_MACHINE_ID)}
                                    >
                                        <span className="chip-popover-option-body">
                                            <span className="chip-popover-option-primary">Auto</span>
                                            <span className="chip-popover-option-secondary">Pick any available worker</span>
                                        </span>
                                    </PopoverOption>
                                ) : null}
                                {(() => {
                                    const q = machineSearch.trim().toLowerCase()
                                    const filtered = q
                                        ? selectableMachines.filter(m => {
                                            const name = (m.metadata?.host ?? '').toLowerCase()
                                            return name.includes(q) || m.id.toLowerCase().includes(q)
                                        })
                                        : selectableMachines
                                    if (filtered.length === 0) {
                                        return <div className="chip-popover-empty">No machines match</div>
                                    }
                                    return filtered.map(m => {
                                        const host = m.metadata?.host ?? null
                                        return (
                                            <PopoverOption
                                                key={m.id}
                                                selected={machineId === m.id}
                                                onClick={() => setMachineId(m.id)}
                                            >
                                                <span className="chip-popover-option-body">
                                                    <span className="chip-popover-option-primary">{host ?? m.id.slice(0, 8)}</span>
                                                    <span className="chip-popover-option-secondary">{m.id}</span>
                                                </span>
                                            </PopoverOption>
                                        )
                                    })
                                })()}
                            </div>
                        </PopoverGroup>
                    ) : null}

                    <PopoverGroup label="Runtime">
                        <PopoverPillRow
                            options={RUNTIME_OPTIONS.filter((option) => isCloud ? option.value === 'daemon-session' : option.value === 'host-process')}
                            value={runtimeKind}
                            onChange={v => setRuntimeKind(v as RuntimeKind)}
                        />
                    </PopoverGroup>

                    {isCloud && cloudEnvironments.length > 0 ? (
                        <PopoverGroup label="Environment">
                            <div className="chip-popover-scrollable">
                                <PopoverOption
                                    selected={!environmentId.trim()}
                                    onClick={() => setEnvironmentId('')}
                                >
                                    <span className="chip-popover-option-body">
                                        <span className="chip-popover-option-primary">None</span>
                                        <span className="chip-popover-option-secondary">Default environment</span>
                                    </span>
                                </PopoverOption>
                                {cloudEnvironments.map(env => {
                                    const envAny = env as { id: string; name?: string; description?: string }
                                    const primary = envAny.name?.trim() || envAny.id
                                    return (
                                        <PopoverOption
                                            key={envAny.id}
                                            selected={environmentId === envAny.id}
                                            onClick={() => setEnvironmentId(envAny.id)}
                                        >
                                            <span className="chip-popover-option-body">
                                                <span className="chip-popover-option-primary">{primary}</span>
                                                <span className="chip-popover-option-secondary">{envAny.id}</span>
                                            </span>
                                        </PopoverOption>
                                    )
                                })}
                            </div>
                        </PopoverGroup>
                    ) : null}

                    {isCloud && cloudCheckpoints.length > 0 ? (
                        <PopoverGroup label="Checkpoint">
                            {cloudCheckpoints.length > 4 ? (
                                <div className="chip-popover-search">
                                    <input
                                        type="text"
                                        className="chip-popover-input"
                                        placeholder="Search checkpoints…"
                                        value={checkpointSearch}
                                        onChange={(e) => setCheckpointSearch(e.target.value)}
                                    />
                                </div>
                            ) : null}
                            <div className="chip-popover-scrollable">
                                {!checkpointSearch.trim() ? (
                                    <PopoverOption
                                        selected={!checkpointId.trim()}
                                        onClick={() => setCheckpointId('')}
                                    >
                                        <span className="chip-popover-option-body">
                                            <span className="chip-popover-option-primary">None</span>
                                            <span className="chip-popover-option-secondary">Start from the base image</span>
                                        </span>
                                    </PopoverOption>
                                ) : null}
                                {(() => {
                                    const q = checkpointSearch.trim().toLowerCase()
                                    const filtered = q
                                        ? cloudCheckpoints.filter(cp => {
                                            const name = (cp.name ?? '').toLowerCase()
                                            const desc = (cp.description ?? '').toLowerCase()
                                            return name.includes(q) || desc.includes(q) || cp.id.toLowerCase().includes(q)
                                        })
                                        : cloudCheckpoints
                                    if (filtered.length === 0) {
                                        return <div className="chip-popover-empty">No checkpoints match</div>
                                    }
                                    return filtered.map(cp => {
                                        const primary = cp.name?.trim() || cp.id.slice(0, 8)
                                        return (
                                            <PopoverOption
                                                key={cp.id}
                                                selected={checkpointId === cp.id}
                                                onClick={() => { setCheckpointId(cp.id); setRuntimeKind('daemon-session') }}
                                            >
                                                <span className="chip-popover-option-body">
                                                    <span className="chip-popover-option-primary">{primary}</span>
                                                    <span className="chip-popover-option-secondary">{cp.id}</span>
                                                </span>
                                            </PopoverOption>
                                        )
                                    })
                                })()}
                            </div>
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
