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
    CursorSelect,
    CursorSettingsCard,
    CursorSettingsRow,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'
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
import { Kbd, KbdHint } from '@/components/ui/Kbd'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/StatusDot'
import { AgentAvatar } from '@/components/ui/AgentAvatar'

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

function GitBranchSvg() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
    )
}

function CheckSvg({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function CloseSvg({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function SearchSvg({ size = 13 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
    )
}

function RepoSvg({ size = 13 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v7.355c.3-.151.633-.245.988-.27L4.5 9.5h8Z" />
        </svg>
    )
}

function LockSvg({ size = 10 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    )
}


function parseRepoShortName(url: string): string | null {
    const trimmed = url.trim().replace(/\.git$/, '').replace(/\/+$/, '')
    if (!trimmed) return null
    const m = trimmed.match(/[:/]([^/:\s]+)\/([^/:\s]+)$/)
    return m ? `${m[1]}/${m[2]}` : null
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
    const [repoSearch, setRepoSearch] = useState('')
    const [repoBranchMode, setRepoBranchMode] = useState<'create' | 'reuse' | 'detached'>(() => lastConfig?.repositoryBranchMode ?? 'create')
    const [repoBranchPrefix, setRepoBranchPrefix] = useState(() => lastConfig?.repositoryBranchPrefix ?? 'haqi/')
    const [repoBranchName, setRepoBranchName] = useState(() => lastConfig?.repositoryBranchName ?? '')
    // Git identity is a global setting (Settings → Cloud Agents → Git identity).
    // Derived from the cloud agent settings query below — no per-launch state.
    const [showRepoPanel, setShowRepoPanel] = useState(false)
    const [showRepoAdvanced, setShowRepoAdvanced] = useState(false)
    const [isRepoPanelExiting, setIsRepoPanelExiting] = useState(false)
    const [isRepoAdvancedExiting, setIsRepoAdvancedExiting] = useState(false)
    const [autoFilledFields, setAutoFilledFields] = useState<Set<'url' | 'branch'>>(() => new Set())
    const autoFillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const repoSearchInputRef = useRef<HTMLInputElement>(null)
    const repoItemRefs = useRef<Array<HTMLButtonElement | null>>([])

    const closeRepoPanel = useCallback(() => {
        setIsRepoPanelExiting(true)
    }, [])
    const handleRepoPanelAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
        if (e.animationName === 'repo-panel-out') {
            setShowRepoPanel(false)
            setIsRepoPanelExiting(false)
        }
    }, [])

    const toggleRepoAdvanced = useCallback(() => {
        if (showRepoAdvanced && !isRepoAdvancedExiting) {
            setIsRepoAdvancedExiting(true)
        } else if (!showRepoAdvanced) {
            setShowRepoAdvanced(true)
            setIsRepoAdvancedExiting(false)
        } else {
            setIsRepoAdvancedExiting(false)
        }
    }, [showRepoAdvanced, isRepoAdvancedExiting])

    const handleAdvancedAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
        if (e.animationName === 'advanced-section-out') {
            setShowRepoAdvanced(false)
            setIsRepoAdvancedExiting(false)
        }
    }, [])

    useEffect(() => () => {
        if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current)
    }, [])

    const handleRepoPick = useCallback((repo: { cloneUrl: string; defaultBranch: string | null }) => {
        const filled: Array<'url' | 'branch'> = ['url']
        setRepoUrl(repo.cloneUrl)
        if (!repoBranch.trim()) {
            setRepoBranch(repo.defaultBranch || 'main')
            filled.push('branch')
        }
        setAutoFilledFields(new Set(filled))
        if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current)
        autoFillTimerRef.current = setTimeout(() => {
            setAutoFilledFields(new Set())
            autoFillTimerRef.current = null
        }, 1100)
    }, [repoBranch])

    const focusRepoItem = useCallback((index: number) => {
        const btn = repoItemRefs.current[index]
        if (!btn) return
        btn.focus()
        btn.scrollIntoView({ block: 'nearest' })
    }, [])

    const handleRepoSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' && repoItemRefs.current[0]) {
            e.preventDefault()
            focusRepoItem(0)
        }
    }, [focusRepoItem])

    const handleRepoItemKeyDown = useCallback((index: number, listLength: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            focusRepoItem(index + 1 < listLength ? index + 1 : 0)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (index === 0) {
                repoSearchInputRef.current?.focus()
            } else {
                focusRepoItem(index - 1)
            }
        }
    }, [focusRepoItem])
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
    const githubConnected = Boolean(cloudAgentSettingsQuery.data?.github?.connected)
    const githubReposQuery = useQuery({
        queryKey: queryKeys.cloudAgentGitHubRepos,
        enabled: Boolean(props.api) && githubConnected,
        staleTime: 60_000,
        retry: false,
        queryFn: async () => {
            if (!props.api) throw new Error('API unavailable')
            return await props.api.getCloudAgentGitHubRepos()
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

    // Effective git identity, pulled from global settings at submit time.
    const effectiveGitName = (cloudAgentSettingsQuery.data?.settings.gitName ?? '').trim()
    const effectiveGitEmail = (cloudAgentSettingsQuery.data?.settings.gitEmail ?? '').trim()

    const githubRepos = githubReposQuery.data?.repos ?? []
    const filteredGithubRepos = useMemo(() => {
        const needle = repoSearch.trim().toLowerCase()
        if (!needle) return githubRepos.slice(0, 8)
        return githubRepos
            .filter((repo) =>
                repo.fullName.toLowerCase().includes(needle)
                || repo.name.toLowerCase().includes(needle)
                || repo.owner.toLowerCase().includes(needle)
            )
            .slice(0, 8)
    }, [githubRepos, repoSearch])
    const selectedGithubRepo = useMemo(() => {
        const needle = repoUrl.trim()
        if (!needle) return null
        return githubRepos.find((repo) => repo.cloneUrl === needle || repo.url === needle) ?? null
    }, [githubRepos, repoUrl])

    const githubBranchesQuery = useQuery({
        queryKey: selectedGithubRepo
            ? queryKeys.cloudAgentGitHubBranches(selectedGithubRepo.owner, selectedGithubRepo.name)
            : ['cloud-agent-github-branches', 'none'] as const,
        enabled: Boolean(props.api) && githubConnected && Boolean(selectedGithubRepo),
        staleTime: 60_000,
        retry: false,
        queryFn: async () => {
            if (!props.api || !selectedGithubRepo) throw new Error('No repo selected')
            return await props.api.getCloudAgentGitHubBranches(selectedGithubRepo.owner, selectedGithubRepo.name)
        }
    })
    const githubBranches = githubBranchesQuery.data?.branches ?? []

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
        const setupAgent: 'claude' | 'codex' = agent === 'codex' ? 'codex' : 'claude'
        const trimmedRepoUrl = repoUrl.trim()
        try {
            const result = await spawnSession({
                machineId: worker.machineId,
                agent: setupAgent,
                sessionType: 'setup',
                executionBackend: (worker as any).executorType ?? 'cloud-self-hosted',
                runtimeKind: 'daemon-session',
                yolo: true,
                workspaceSource: trimmedRepoUrl ? { repository: { url: trimmedRepoUrl } } : undefined,
            })
            if (result.type === 'success' && result.sessionId) {
                props.onOpenSession(result.sessionId)
            } else if (result.type === 'accepted') {
                navigate({ to: '/settings/requests/$requestId', params: { requestId: result.requestId } })
            }
        } catch (err: any) {
            setLocalWorkerError(err?.message ?? 'Failed to start setup')
        }
    }, [selectableWorker, activeWorkerFailure, agent, repoUrl, spawnSession, props, navigate])

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
        const byExecutor = executionBackend === 'cloud-self-hosted'
            ? machines.filter(m => m.metadata?.executorType === 'cloud-self-hosted')
            : executionBackend === 'cloud-managed'
                ? machines.filter(m => m.metadata?.executorType === 'cloud-managed')
                : machines.filter(m =>
                    m.metadata?.executorType !== 'cloud-self-hosted' && m.metadata?.executorType !== 'cloud-managed'
                )
        // Hide inactive machines from the picker — they can't run tasks.
        // Historical records stay visible in Settings → Cloud Workers, where
        // they can be inspected and pruned.
        return byExecutor.filter(m => m.active)
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

    const machineLabel = useMemo(() => {
        if (!isCloud) return 'local'
        if (machineId === AUTO_CLOUD_MACHINE_ID || !machineId) {
            return executionBackend === 'cloud-managed' ? 'managed · auto' : 'self-hosted · auto'
        }
        const m = machines.find(x => x.id === machineId)
        return m?.metadata?.host ?? m?.id.slice(0, 8) ?? 'cloud'
    }, [isCloud, machineId, machines, executionBackend])

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
                    ...(effectiveGitName ? { name: effectiveGitName } : {}),
                    ...(effectiveGitEmail ? { email: effectiveGitEmail } : {}),
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
        sessionType, worktreeName, previewUrl, repoUrl, repoBranch, repoBranchMode, repoBranchPrefix, repoBranchName, effectiveGitName, effectiveGitEmail, checkpointId,
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
                    <h1 className="home-title">Start an agent</h1>
                    <p className="home-subtitle">Describe a task below, or pick a quick start.</p>

                    {/* ── Onboarding banner (slim, ambient) ── */}
                    {onboardPhase !== 'ready' ? (() => {
                        const busy = startingLocalWorker || runtimeBuilding || (onboardPhase === 'setup' && isPending)
                        const errorMsg = localWorkerError ?? (onboardPhase === 'setup' && !hasSelectableWorker ? activeWorkerFailure : null)
                        const title =
                            onboardPhase === 'worker'
                                ? (allWorkers.length > 0
                                    ? `All ${allWorkers.length} worker${allWorkers.length === 1 ? '' : 's'} offline`
                                    : 'Start a worker to run agents')
                                : onboardPhase === 'runtime'
                                    ? (runtimeBuilding ? 'Building runtime image…' : 'Prepare the runtime image')
                                    : 'Save a setup checkpoint to skip rebuilds'
                        const hint = errorMsg ?? (
                            onboardPhase === 'worker'
                                ? (startingLocalWorker ? 'Starting worker…' : 'Runs on this machine and executes agent tasks.')
                                : onboardPhase === 'runtime'
                                    ? (runtimeMessage ?? 'Builds haqi-workspace:dev once, reused by all sessions.')
                                    : 'Install deps once, reuse instantly — or skip to run without Docker.'
                        )
                        return (
                            <div className="status-banner">
                                <span className={`status-banner-dot ${errorMsg ? 'danger' : busy ? 'busy' : ''}`} />
                                <div className="status-banner-body">
                                    <div className="status-banner-title">{title}</div>
                                    <div className={`status-banner-hint ${errorMsg ? 'danger' : ''}`}>{hint}</div>
                                </div>
                                <div className="status-banner-actions">
                                    {onboardPhase === 'worker' ? (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={handleStartLocalWorker}
                                            disabled={startingLocalWorker}
                                            leadingIcon={startingLocalWorker ? <SpinnerSvg /> : undefined}
                                        >
                                            {startingLocalWorker ? 'Starting…' : allWorkers.length > 0 ? 'Restart worker' : 'Start worker'}
                                        </Button>
                                    ) : null}
                                    {onboardPhase === 'runtime' ? (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={handlePrepareRuntime}
                                            disabled={runtimeBuilding}
                                            leadingIcon={runtimeBuilding ? <SpinnerSvg /> : undefined}
                                        >
                                            {runtimeBuilding ? 'Building…' : 'Prepare runtime'}
                                        </Button>
                                    ) : null}
                                    {onboardPhase === 'setup' ? (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleSkipOnboard}
                                            >
                                                Skip
                                            </Button>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={handleStartSetup}
                                                disabled={isPending || !hasSelectableWorker}
                                                leadingIcon={isPending ? <SpinnerSvg /> : undefined}
                                            >
                                                {isPending ? 'Starting…' : 'Start setup'}
                                            </Button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })() : null}

                    {/* ── Composer (always visible, submit gated by onboard phase) ── */}
                    {(<>

                    {/* ── Repo selector ── */}
                    <div className={`repo-selector ${showRepoPanel ? 'items-stretch' : ''}`}>
                        {showRepoPanel ? (
                            <div
                                className={`repo-panel-expanded flex w-full flex-col gap-3 ${isRepoPanelExiting ? 'repo-panel-exiting' : ''}`}
                                onAnimationEnd={handleRepoPanelAnimationEnd}
                            >
                                <div className="repo-panel-head">
                                    <div className="repo-panel-head-title">
                                        {selectedGithubRepo?.fullName ?? parseRepoShortName(repoUrl) ?? 'Choose a repo'}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        iconOnly
                                        onClick={closeRepoPanel}
                                        aria-label="Close repository settings"
                                        title="Close"
                                        leadingIcon={<CloseSvg />}
                                    />
                                </div>
                                <CursorSettingsCard>
                                    {githubConnected ? (
                                        <CursorSettingsRow
                                            alignTop
                                            title="From GitHub"
                                            description={selectedGithubRepo ? undefined : 'Pick a connected repo.'}
                                            control={
                                                <div className="flex w-[320px] max-w-full flex-col gap-2">
                                                    <div className="repo-search">
                                                        <span className="repo-search-icon" aria-hidden><SearchSvg /></span>
                                                        <CursorTextField
                                                            ref={repoSearchInputRef}
                                                            compact
                                                            className="repo-search-input"
                                                            placeholder={githubReposQuery.isLoading
                                                                ? 'Loading repos…'
                                                                : 'Search repositories'}
                                                            value={repoSearch}
                                                            onChange={e => setRepoSearch(e.target.value)}
                                                            onKeyDown={handleRepoSearchKeyDown}
                                                        />
                                                    </div>
                                                    <div className="repo-list">
                                                        {githubReposQuery.isLoading ? (
                                                            <div className="repo-list-empty">Loading…</div>
                                                        ) : filteredGithubRepos.length === 0 ? (
                                                            <div className="repo-list-empty">
                                                                {repoSearch.trim() ? 'No repositories match.' : 'No repositories.'}
                                                            </div>
                                                        ) : (
                                                            filteredGithubRepos.map((repo, index) => {
                                                                const active = selectedGithubRepo?.cloneUrl === repo.cloneUrl
                                                                return (
                                                                    <button
                                                                        key={repo.cloneUrl}
                                                                        ref={el => { repoItemRefs.current[index] = el }}
                                                                        type="button"
                                                                        onClick={() => handleRepoPick(repo)}
                                                                        onKeyDown={handleRepoItemKeyDown(index, filteredGithubRepos.length)}
                                                                        className={`repo-list-item ${active ? 'repo-list-item--active' : ''}`}
                                                                    >
                                                                        <span className="repo-list-item-icon" aria-hidden>
                                                                            <RepoSvg />
                                                                        </span>
                                                                        <div className="repo-list-item-body">
                                                                            <div className="repo-list-item-name">
                                                                                {repo.fullName}
                                                                                {repo.private ? (
                                                                                    <span className="repo-list-item-lock" aria-label="Private">
                                                                                        <LockSvg />
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                            <div className="repo-list-item-meta">
                                                                                {repo.defaultBranch || 'default branch'}
                                                                            </div>
                                                                        </div>
                                                                        {active ? (
                                                                            <span className="repo-list-item-check" aria-hidden>
                                                                                <CheckSvg />
                                                                            </span>
                                                                        ) : null}
                                                                    </button>
                                                                )
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            }
                                        />
                                    ) : null}
                                    <CursorSettingsRow
                                        title="Repository URL"
                                        description={githubConnected ? 'Or paste a git URL.' : 'Git remote to clone.'}
                                        control={
                                            <CursorTextField
                                                compact
                                                className={`w-[280px] max-w-full ${autoFilledFields.has('url') ? 'pulse-fill' : ''}`}
                                                placeholder="https://github.com/org/repo"
                                                value={repoUrl}
                                                onChange={e => setRepoUrl(e.target.value)}
                                            />
                                        }
                                    />
                                    <CursorSettingsRow
                                        title="Base branch"
                                        description={githubBranchesQuery.isLoading
                                            ? 'Loading…'
                                            : githubBranchesQuery.error
                                                ? 'Could not load branches; type a name.'
                                                : undefined}
                                        control={
                                            selectedGithubRepo && githubBranches.length > 0 ? (
                                                <CursorSelect
                                                    className={`w-[240px] max-w-full ${autoFilledFields.has('branch') ? 'pulse-fill' : ''}`}
                                                    value={repoBranch}
                                                    onChange={e => setRepoBranch(e.target.value)}
                                                >
                                                    <option value="">
                                                        {selectedGithubRepo.defaultBranch
                                                            ? `Default (${selectedGithubRepo.defaultBranch})`
                                                            : 'Select branch'}
                                                    </option>
                                                    {githubBranches.map(b => (
                                                        <option key={b.name} value={b.name}>
                                                            {b.name}{b.protected ? ' · protected' : ''}
                                                        </option>
                                                    ))}
                                                </CursorSelect>
                                            ) : (
                                                <CursorTextField
                                                    compact
                                                    className={`w-[200px] max-w-full ${autoFilledFields.has('branch') ? 'pulse-fill' : ''}`}
                                                    placeholder={selectedGithubRepo?.defaultBranch || 'main'}
                                                    value={repoBranch}
                                                    onChange={e => setRepoBranch(e.target.value)}
                                                />
                                            )
                                        }
                                    />
                                    <button
                                        type="button"
                                        className={`repo-advanced-toggle ${showRepoAdvanced && !isRepoAdvancedExiting ? 'is-open' : ''}`}
                                        onClick={toggleRepoAdvanced}
                                        aria-expanded={showRepoAdvanced && !isRepoAdvancedExiting}
                                    >
                                        <span className="repo-advanced-toggle-chevron" aria-hidden>
                                            <ChevronSvg />
                                        </span>
                                        <span>Advanced</span>
                                        <span className="repo-advanced-toggle-hint">
                                            workspace · branch strategy
                                        </span>
                                    </button>
                                    {showRepoAdvanced ? (
                                        <div
                                            className={`repo-advanced-section ${isRepoAdvancedExiting ? 'repo-advanced-section--exiting' : ''}`}
                                            onAnimationEnd={handleAdvancedAnimationEnd}
                                        >
                                            <CursorSettingsRow
                                                title="Workspace"
                                                description="Ephemeral wipes on exit · Persistent keeps files · Snapshot restores from a checkpoint."
                                                control={
                                                    <PopoverPillRow
                                                        options={WORKSPACE_MODE_OPTIONS}
                                                        value={workspaceMode}
                                                        onChange={v => setWorkspaceMode(v as WorkspaceMode)}
                                                    />
                                                }
                                            />
                                            <CursorSettingsRow
                                                title="Branch strategy"
                                                description="How task branches are made."
                                                noBorder={repoBranchMode !== 'create'}
                                                control={
                                                    <PopoverPillRow
                                                        options={[
                                                            { value: 'create', label: 'Create' },
                                                            { value: 'reuse', label: 'Reuse' },
                                                            { value: 'detached', label: 'Detached' },
                                                        ]}
                                                        value={repoBranchMode}
                                                        onChange={v => setRepoBranchMode(v as 'create' | 'reuse' | 'detached')}
                                                    />
                                                }
                                            />
                                            {repoBranchMode === 'create' ? (
                                                <>
                                                    <CursorSettingsRow
                                                        title="Branch prefix"
                                                        description="New task branches become {prefix}{slug}."
                                                        control={
                                                            <CursorTextField
                                                                compact
                                                                className="w-[200px] max-w-full"
                                                                placeholder="haqi/"
                                                                value={repoBranchPrefix}
                                                                onChange={e => setRepoBranchPrefix(e.target.value)}
                                                            />
                                                        }
                                                    />
                                                    <CursorSettingsRow
                                                        title="Branch name"
                                                        description="Optional slug; leave blank to derive from prompt."
                                                        noBorder
                                                        control={
                                                            <CursorTextField
                                                                compact
                                                                className="w-[240px] max-w-full"
                                                                placeholder="auto from prompt"
                                                                value={repoBranchName}
                                                                onChange={e => setRepoBranchName(e.target.value)}
                                                            />
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </CursorSettingsCard>
                            </div>
                        ) : (() => {
                            const shortRepo = selectedGithubRepo?.fullName ?? parseRepoShortName(repoUrl)
                            const branchLabel = repoBranch.trim() || selectedGithubRepo?.defaultBranch || ''
                            if (!shortRepo) {
                                return (
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="repo-btn"
                                        onClick={() => setShowRepoPanel(true)}
                                        trailingIcon={<ChevronSvg />}
                                    >
                                        Select repository
                                    </Button>
                                )
                            }
                            return (
                                <Button
                                    variant="secondary"
                                    size="xs"
                                    className="repo-btn repo-btn--selected"
                                    onClick={() => setShowRepoPanel(true)}
                                    title="Change repository or branch"
                                    leadingIcon={<GitBranchSvg />}
                                    trailingIcon={<ChevronSvg />}
                                >
                                    <span className="repo-chip-name">{shortRepo}</span>
                                    {branchLabel ? (
                                        <>
                                            <span className="repo-chip-sep">·</span>
                                            <span className="repo-chip-branch">{branchLabel}</span>
                                        </>
                                    ) : null}
                                </Button>
                            )
                        })()}
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
                                    <Button
                                        ref={modelChipRef}
                                        variant="ghost"
                                        size="xs"
                                        className="tool-chip tool-chip--with-avatar"
                                        onClick={() => togglePopover('model')}
                                        leadingIcon={<AgentAvatar agent={agent} size={16} />}
                                        trailingIcon={<ChevronSvg />}
                                    >
                                        <span className="tool-chip-text">
                                            {modelLabel}
                                            {effortLabel ? (
                                                <span className="tool-chip-effort">{effortLabel}</span>
                                            ) : null}
                                        </span>
                                    </Button>

                                    {/* Cloud chip */}
                                    <Button
                                        ref={cloudChipRef}
                                        variant="ghost"
                                        size="xs"
                                        className="tool-chip"
                                        onClick={() => togglePopover('cloud')}
                                        trailingIcon={<ChevronSvg />}
                                    >
                                        {isCloud ? 'Cloud' : 'Local'}
                                        {isCloud ? <StatusDot tone="success" size={6} className="ml-1" /> : null}
                                    </Button>

                                    {/* Config chip */}
                                    <Button
                                        ref={configChipRef}
                                        variant="ghost"
                                        size="xs"
                                        className="tool-chip"
                                        onClick={() => togglePopover('config')}
                                        leadingIcon={<GearSvg />}
                                        trailingIcon={<ChevronSvg />}
                                    />
                                </div>
                                <div className="prompt-actions">
                                    {hasPrompt && onboardPhase === 'ready' && !isPending ? (
                                        <KbdHint className="kbd-hint">
                                            <Kbd>⌘</Kbd>
                                            <Kbd>↵</Kbd>
                                        </KbdHint>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={`action-btn ${hasPrompt && onboardPhase === 'ready' ? 'active' : ''}`}
                                        disabled={!hasPrompt || isPending || onboardPhase !== 'ready'}
                                        onClick={() => void handleSubmit()}
                                        title={
                                            onboardPhase === 'worker' ? 'Start a worker before sending'
                                            : onboardPhase === 'runtime' ? 'Runtime image not ready'
                                            : onboardPhase === 'setup' ? 'Finish or skip setup first'
                                            : 'Send (⌘↵)'
                                        }
                                    >
                                        {isPending ? <SpinnerSvg /> : <SendSvg />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {onboardPhase !== 'ready' ? (
                        <div className="mt-2 text-[12px] leading-4 text-[var(--cursor-text-tertiary)]">
                            {onboardPhase === 'worker'
                                ? 'Draft your prompt — send unlocks once a worker is online.'
                                : onboardPhase === 'runtime'
                                    ? 'Draft your prompt — send unlocks once the runtime image is ready.'
                                    : 'Draft your prompt — send unlocks after setup (or skip setup).'}
                        </div>
                    ) : hasPrompt ? (() => {
                        const repoShort = selectedGithubRepo?.fullName ?? parseRepoShortName(repoUrl)
                        const branchShort = repoBranch.trim() || selectedGithubRepo?.defaultBranch || ''
                        const repoSummary = repoShort
                            ? (branchShort ? `${repoShort}@${branchShort}` : repoShort)
                            : null
                        return (
                            <div className="will-run-summary">
                                <span className="will-run-label">Runs</span>
                                <span className="will-run-val will-run-val--agent">{agent}</span>
                                {modelLabel ? (
                                    <>
                                        <span className="will-run-sep">·</span>
                                        <span className="will-run-val">{modelLabel}</span>
                                    </>
                                ) : null}
                                {effortLabel ? (
                                    <span className="will-run-effort">{effortLabel}</span>
                                ) : null}
                                {repoSummary ? (
                                    <>
                                        <span className="will-run-sep">·</span>
                                        <span className="will-run-val">{repoSummary}</span>
                                    </>
                                ) : null}
                                <span className="will-run-sep">·</span>
                                <span className="will-run-val">{machineLabel}</span>
                            </div>
                        )
                    })() : null}

                    {/* ── Spawn error ── */}
                    {spawnError ? (
                        <div className="composer-error" role="alert">
                            <svg className="composer-error-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{spawnError}</span>
                        </div>
                    ) : null}

                    {/* ── Quick prompt pills ── */}
                    <div className="quick-prompts">
                        <div className="quick-prompts-label">Try</div>
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
                                <span className="chip-popover-option-row">
                                    <AgentAvatar agent={opt.value} />
                                    {opt.label}
                                </span>
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
