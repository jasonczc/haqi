import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent as ReactFormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type {
    CloudEnvironmentSummary,
    CloudProviderSummary,
    CloudWorkerSummary,
    ExecutionBackend,
    EnvironmentTemplate,
    Machine,
    RuntimeKind,
    SpawnResponse,
    WorkspaceSource,
    WorkspaceSpec
} from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import { useCloudCheckpoints } from '@/hooks/queries/useCloudCheckpoints'
import { useCloudProviders } from '@/hooks/queries/useCloudProviders'
import { useCloudWorkers } from '@/hooks/queries/useCloudWorkers'
import { useActiveSuggestions, type Suggestion } from '@/hooks/useActiveSuggestions'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { queryKeys } from '@/lib/query-keys'
import { normalizePreviewUrlInput } from '@/lib/preview-url'
import { CursorBadgeButton, CursorFieldLabel, CursorNotice, CursorTextField } from '@/components/settings/CursorSettingsPrimitives'
import {
    CLAUDE_THINK_EFFORT_OPTIONS,
    CODEX_THINK_EFFORT_OPTIONS,
    MODEL_OPTIONS,
    getModelOptionsForAgent,
    getThinkEffortOptions,
    type AgentType,
    type ThinkEffort,
    type SessionType
} from './types'
import { ActionButtons } from './ActionButtons'
import { AgentSelector } from './AgentSelector'
import { DirectorySection } from './DirectorySection'
import { CloudSettingsSection } from './CloudSettingsSection'
import { MachineSelector } from './MachineSelector'
import { ModelSelector } from './ModelSelector'
import { ServiceTierSelector } from './ServiceTierSelector'
import { ThinkEffortSelector } from './ThinkEffortSelector'
import {
    loadLastSessionConfig,
    loadPreferredAgent,
    loadPreferredCustomModel,
    loadPreferredExecutionBackend,
    loadPreferredRuntimeKind,
    loadPreferredModel,
    loadPreferredSessionType,
    loadPreferredServiceTier,
    loadPreferredThinkEffort,
    loadPreferredYoloMode,
    saveLastSessionConfig,
    savePreferredAgent,
    savePreferredCustomModel,
    savePreferredExecutionBackend,
    savePreferredModel,
    savePreferredRuntimeKind,
    savePreferredSessionType,
    savePreferredServiceTier,
    savePreferredThinkEffort,
    savePreferredYoloMode,
} from './preferences'
import { SessionTypeSelector } from './SessionTypeSelector'
import { YoloToggle } from './YoloToggle'
import {
    normalizeNetworkPolicyInput,
    parseListInput,
    parsePreviewPortInput,
    resolveSpawnModel,
    resolveSpawnServiceTier,
    resolveSpawnSessionSettings,
    resolveSpawnThinkEffort
} from './spawnPayload'
import { formatRunnerSpawnError } from '@/utils/formatRunnerSpawnError'
import { getCloudInventorySummary, getCloudRuntimeWarning } from './cloudInventory'

const AUTO_CLOUD_MACHINE_ID = 'auto'

function isCloudMachine(machine: Machine): boolean {
    return machine.metadata?.executorType === 'cloud-self-hosted'
        || machine.metadata?.executorType === 'cloud-managed'
}

function getDefaultThinkEffort(agent: AgentType): ThinkEffort {
    if (agent === 'claude') {
        return CLAUDE_THINK_EFFORT_OPTIONS[0]?.value ?? 'auto'
    }
    if (agent === 'codex') {
        return CODEX_THINK_EFFORT_OPTIONS[0]?.value ?? 'auto'
    }
    return 'auto'
}

export function NewSession(props: {
    api: ApiClient
    machines: Machine[]
    isLoading?: boolean
    initialDirectory?: string
    initialMachineId?: string
    initialCheckpointId?: string
    initialSessionType?: string
    formId?: string
    onSuccess: (result: SpawnResponse) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()
    const lastSessionConfig = loadLastSessionConfig()
    const initialAgent = lastSessionConfig?.agent ?? loadPreferredAgent()
    const initialModel = (
        lastSessionConfig?.model && getModelOptionsForAgent(initialAgent).some((option) => option.value === lastSessionConfig.model)
            ? lastSessionConfig.model
            : (loadPreferredModel(initialAgent) ?? (getModelOptionsForAgent(initialAgent)[0]?.value ?? 'auto'))
    )
    const initialThinkEffort = (
        lastSessionConfig?.thinkEffort && getThinkEffortOptions(initialAgent).some((option) => option.value === lastSessionConfig.thinkEffort)
            ? lastSessionConfig.thinkEffort
            : (loadPreferredThinkEffort(initialAgent) ?? getDefaultThinkEffort(initialAgent))
    )

    const [machineId, setMachineId] = useState<string | null>(props.initialMachineId ?? null)
    const [directory, setDirectory] = useState(props.initialDirectory ?? '')
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)
    const [pathExistence, setPathExistence] = useState<Record<string, boolean>>({})
    const [agent, setAgent] = useState<AgentType>(initialAgent)
    const [model, setModel] = useState(initialModel)
    const [customModel, setCustomModel] = useState(() => lastSessionConfig?.customModel ?? loadPreferredCustomModel(initialAgent))
    const [thinkEffort, setThinkEffort] = useState<ThinkEffort>(initialThinkEffort)
    const [serviceTier, setServiceTier] = useState(() => (
        lastSessionConfig?.serviceTier
        ?? loadPreferredServiceTier(initialAgent)
        ?? 'auto'
    ))
    const [yoloMode, setYoloMode] = useState(() => lastSessionConfig?.yoloMode ?? loadPreferredYoloMode())
    const [sessionType, setSessionType] = useState<SessionType>(() => {
        if (props.initialSessionType === 'simple' || props.initialSessionType === 'worktree' || props.initialSessionType === 'setup') {
            return props.initialSessionType
        }
        return lastSessionConfig?.sessionType ?? loadPreferredSessionType()
    })
    const [worktreeName, setWorktreeName] = useState(() => lastSessionConfig?.worktreeName ?? '')
    const [previewUrlInput, setPreviewUrlInput] = useState(() => lastSessionConfig?.previewUrl ?? '')
    const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>(() => lastSessionConfig?.executionBackend ?? loadPreferredExecutionBackend())
    const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>(() => lastSessionConfig?.runtimeKind ?? loadPreferredRuntimeKind())
    const [launchMode, setLaunchMode] = useState<'interactive' | 'background'>(() => lastSessionConfig?.launchMode ?? 'interactive')
    const [environmentId, setEnvironmentId] = useState(() => lastSessionConfig?.environmentId ?? '')
    const [checkpointId, setCheckpointId] = useState(() => props.initialCheckpointId ?? lastSessionConfig?.checkpointId ?? '')
    const [repositoryUrl, setRepositoryUrl] = useState(() => lastSessionConfig?.repositoryUrl ?? '')
    const [repositoryBranch, setRepositoryBranch] = useState(() => lastSessionConfig?.repositoryBranch ?? '')
    const [repositoryBranchMode, setRepositoryBranchMode] = useState<'create' | 'reuse' | 'detached'>(() => lastSessionConfig?.repositoryBranchMode ?? 'create')
    const [repositoryBranchPrefix, setRepositoryBranchPrefix] = useState(() => lastSessionConfig?.repositoryBranchPrefix ?? 'haqi/')
    const [repositoryBranchName, setRepositoryBranchName] = useState(() => lastSessionConfig?.repositoryBranchName ?? '')
    const [gitName, setGitName] = useState(() => lastSessionConfig?.gitName ?? '')
    const [gitEmail, setGitEmail] = useState(() => lastSessionConfig?.gitEmail ?? '')
    const [workspaceMode, setWorkspaceMode] = useState<'ephemeral' | 'persistent' | 'snapshot-derived'>(() => lastSessionConfig?.workspaceMode ?? 'ephemeral')
    const persistentWorkspace = workspaceMode === 'persistent'
    const setPersistentWorkspace = useCallback((value: boolean) => {
        setWorkspaceMode(value ? 'persistent' : 'ephemeral')
    }, [])
    const [networkPolicy, setNetworkPolicy] = useState<'default' | 'restricted' | 'off'>(() => lastSessionConfig?.networkPolicy ?? 'default')
    const [labelsInput, setLabelsInput] = useState(() => lastSessionConfig?.labels ?? '')
    const [secretsInput, setSecretsInput] = useState(() => lastSessionConfig?.secrets ?? '')
    const [previewAutoDetect, setPreviewAutoDetect] = useState(() => lastSessionConfig?.previewAutoDetect ?? false)
    const [previewPreferredPort, setPreviewPreferredPort] = useState(() => lastSessionConfig?.previewPreferredPort ?? '')
    const [ttlMinutes, setTtlMinutes] = useState(() => lastSessionConfig?.ttlMinutes ?? '')
    const [error, setError] = useState<string | null>(null)
    const worktreeInputRef = useRef<HTMLInputElement>(null)
    const hasPresetDirectory = Boolean(props.initialDirectory?.trim())

    useEffect(() => {
        setMachineId(props.initialMachineId ?? null)
    }, [props.initialMachineId])

    useEffect(() => {
        setDirectory(props.initialDirectory ?? '')
    }, [props.initialDirectory])

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    useEffect(() => {
        setModel(loadPreferredModel(agent) ?? (getModelOptionsForAgent(agent)[0]?.value ?? 'auto'))
        setCustomModel(loadPreferredCustomModel(agent))
        setThinkEffort(loadPreferredThinkEffort(agent) ?? getDefaultThinkEffort(agent))
        setServiceTier(loadPreferredServiceTier(agent) ?? 'auto')
    }, [agent])

    const selectableMachines = useMemo(() => {
        if (executionBackend === 'cloud-self-hosted') {
            return props.machines.filter((machine) => machine.metadata?.executorType === 'cloud-self-hosted')
        }
        if (executionBackend === 'cloud-managed') {
            return props.machines.filter((machine) => machine.metadata?.executorType === 'cloud-managed')
        }
        return props.machines.filter((machine) => !isCloudMachine(machine))
    }, [executionBackend, props.machines])

    const machineIdForPathQueries = useMemo(() => {
        if (!machineId || machineId === AUTO_CLOUD_MACHINE_ID) {
            return null
        }
        return selectableMachines.some((machine) => machine.id === machineId)
            ? machineId
            : null
    }, [machineId, selectableMachines])

    useEffect(() => {
        if (executionBackend !== 'local') {
            if (runtimeKind !== 'daemon-session') {
                setRuntimeKind('daemon-session')
            }
            if (machineId === AUTO_CLOUD_MACHINE_ID) return
            if (machineId && selectableMachines.find((machine) => machine.id === machineId)) return
            setMachineId(AUTO_CLOUD_MACHINE_ID)
            return
        }

        if (runtimeKind !== 'host-process') {
            setRuntimeKind('host-process')
        }

        if (selectableMachines.length === 0) return
        if (machineId && selectableMachines.find((machine) => machine.id === machineId)) return

        const lastUsed = getLastUsedMachineId()
        const foundLast = lastUsed ? selectableMachines.find((machine) => machine.id === lastUsed) : null

        if (foundLast) {
            setMachineId(foundLast.id)
            if (!hasPresetDirectory) {
                const paths = getRecentPaths(foundLast.id)
                if (paths[0]) setDirectory(paths[0])
            }
        } else if (selectableMachines[0]) {
            setMachineId(selectableMachines[0].id)
        }
    }, [executionBackend, getLastUsedMachineId, getRecentPaths, hasPresetDirectory, machineId, selectableMachines])

    const selectedMachine = useMemo(
        () => (machineIdForPathQueries ? selectableMachines.find((machine) => machine.id === machineIdForPathQueries) ?? null : null),
        [machineIdForPathQueries, selectableMachines]
    )
    const runnerSpawnError = useMemo(
        () => formatRunnerSpawnError(selectedMachine),
        [selectedMachine]
    )

    const recentPaths = useMemo(
        () => getRecentPaths(machineIdForPathQueries),
        [getRecentPaths, machineIdForPathQueries]
    )

    const modelOptions = useMemo(() => {
        return getModelOptionsForAgent(agent)
    }, [agent])
    const defaultModelValue = modelOptions[0]?.value ?? 'auto'

    useEffect(() => {
        if (customModel.trim() || model === defaultModelValue) {
            return
        }
        if (modelOptions.some((option) => option.value === model)) {
            return
        }
        setModel(defaultModelValue)
    }, [customModel, model, modelOptions, defaultModelValue])

    const previewUrlHistoryQuery = useQuery({
        queryKey: queryKeys.previewUrlHistory,
        queryFn: async () => {
            if (!props.api) {
                throw new Error('API unavailable')
            }
            return await props.api.getPreviewUrlHistory(20)
        },
        enabled: Boolean(props.api),
        staleTime: 30_000
    })

    const previewUrlHistory = previewUrlHistoryQuery.data?.urls ?? []
    const {
        providers: cloudProviders,
        isLoading: cloudProvidersLoading,
        error: cloudProvidersError
    } = useCloudProviders(props.api, executionBackend !== 'local')
    const {
        workers: cloudWorkers,
        isLoading: cloudWorkersLoading,
        error: cloudWorkersError
    } = useCloudWorkers(props.api, executionBackend !== 'local')
    const {
        checkpoints: cloudCheckpoints,
        isLoading: cloudCheckpointsLoading,
        error: cloudCheckpointsError
    } = useCloudCheckpoints(props.api, executionBackend !== 'local')
    const {
        environments: cloudEnvironments,
        isLoading: cloudEnvironmentsLoading,
        error: cloudEnvironmentsError
    } = useCloudEnvironments(props.api, executionBackend !== 'local')
    const cloudAgentSettingsQuery = useQuery({
        queryKey: queryKeys.cloudAgentSettings,
        enabled: Boolean(props.api),
        queryFn: async () => await props.api.getCloudAgentSettings()
    })

    useEffect(() => {
        const settings = cloudAgentSettingsQuery.data?.settings
        if (!settings) return
        if (!lastSessionConfig?.gitName && !gitName.trim() && settings.gitName) {
            setGitName(settings.gitName)
        }
        if (!lastSessionConfig?.gitEmail && !gitEmail.trim() && settings.gitEmail) {
            setGitEmail(settings.gitEmail)
        }
    }, [
        cloudAgentSettingsQuery.data?.settings,
        gitEmail,
        gitName,
        lastSessionConfig?.gitEmail,
        lastSessionConfig?.gitName
    ])

    const allPaths = useDirectorySuggestions(machineIdForPathQueries, sessions, recentPaths)

    const pathsToCheck = useMemo(
        () => Array.from(new Set(allPaths)).slice(0, 1000),
        [allPaths]
    )

    useEffect(() => {
        let cancelled = false

        if (!machineIdForPathQueries || pathsToCheck.length === 0) {
            setPathExistence((previous) => Object.keys(previous).length === 0 ? previous : {})
            return () => { cancelled = true }
        }

        void props.api.checkMachinePathsExists(machineIdForPathQueries, pathsToCheck)
            .then((result) => {
                if (cancelled) return
                setPathExistence(result.exists ?? {})
            })
            .catch(() => {
                if (cancelled) return
                setPathExistence({})
            })

        return () => {
            cancelled = true
        }
    }, [machineIdForPathQueries, pathsToCheck, props.api])

    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
    )
    const cloudInventorySummary = useMemo(
        () => getCloudInventorySummary({
            backend: executionBackend,
            selectedMachineId: machineIdForPathQueries,
            environmentId,
            providers: cloudProviders,
            workers: cloudWorkers,
            environments: cloudEnvironments
        }),
        [cloudEnvironments, cloudProviders, cloudWorkers, environmentId, executionBackend, machineIdForPathQueries]
    )
    const selectedCloudWorker = useMemo<CloudWorkerSummary | null>(
        () => executionBackend === 'local'
            ? null
            : machineIdForPathQueries
                ? cloudWorkers.find((worker) => worker.machineId === machineIdForPathQueries) ?? null
                : null,
        [cloudWorkers, executionBackend, machineIdForPathQueries]
    )
    const selectedCloudProvider = useMemo<CloudProviderSummary | null>(
        () => selectedCloudWorker
            ? cloudProviders.find((provider) => provider.id === selectedCloudWorker.provider) ?? null
            : null,
        [cloudProviders, selectedCloudWorker]
    )
    const cloudRuntimeWarning = useMemo(
        () => getCloudRuntimeWarning({
            runtimeKind,
            selectedWorker: selectedCloudWorker
        }),
        [runtimeKind, selectedCloudWorker]
    )
    const selectedEnvironmentSummary = useMemo<CloudEnvironmentSummary | null>(
        () => environmentId.trim()
            ? cloudEnvironments.find((environment) => environment.id === environmentId.trim()) ?? null
            : null,
        [cloudEnvironments, environmentId]
    )
    const selectedCheckpoint = useMemo(
        () => checkpointId.trim()
            ? cloudCheckpoints.find((checkpoint) => checkpoint.id === checkpointId.trim()) ?? null
            : null,
        [checkpointId, cloudCheckpoints]
    )

    const getSuggestions = useCallback(async (query: string): Promise<Suggestion[]> => {
        const lowered = query.toLowerCase()
        return verifiedPaths
            .filter((path) => path.toLowerCase().includes(lowered))
            .slice(0, 8)
            .map((path) => ({
                key: path,
                text: path,
                label: path
            }))
    }, [verifiedPaths])

    const activeQuery = (!isDirectoryFocused || suppressSuggestions) ? null : directory

    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeQuery,
        getSuggestions,
        { allowEmptyQuery: true, autoSelectFirst: false }
    )

    const handleMachineChange = useCallback((newMachineId: string) => {
        setMachineId(newMachineId)
        const paths = newMachineId === AUTO_CLOUD_MACHINE_ID ? [] : getRecentPaths(newMachineId)
        if (paths[0]) {
            setDirectory(paths[0])
        } else {
            setDirectory('')
        }
    }, [getRecentPaths])

    const handlePathClick = useCallback((path: string) => {
        setDirectory(path)
    }, [])

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (suggestion) {
            setDirectory(suggestion.text)
            clearSuggestions()
            setSuppressSuggestions(true)
        }
    }, [suggestions, clearSuggestions])

    const handleDirectoryChange = useCallback((value: string) => {
        setSuppressSuggestions(false)
        setDirectory(value)
    }, [])

    const handleDirectoryFocus = useCallback(() => {
        setSuppressSuggestions(false)
        setIsDirectoryFocused(true)
    }, [])

    const handleDirectoryBlur = useCallback(() => {
        setIsDirectoryFocused(false)
    }, [])

    const handleDirectoryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            return
        }

        if (suggestions.length === 0) return

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveUp()
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveDown()
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
            if (selectedIndex >= 0) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex)
            }
        }

        if (event.key === 'Escape') {
            clearSuggestions()
        }
    }, [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions, handleSuggestionSelect])

    async function handleCreate() {
        const trimmedDirectory = directory.trim()
        const trimmedRepositoryUrl = repositoryUrl.trim()
        const trimmedCheckpointId = checkpointId.trim()

        if (!machineId) return
        if (executionBackend === 'local' && !trimmedDirectory) return
        if (executionBackend !== 'local' && !trimmedRepositoryUrl && !trimmedCheckpointId && !environmentId.trim()) return

        setError(null)
        try {
            const normalizedPreviewUrl = normalizePreviewUrlInput(previewUrlInput)
            if (normalizedPreviewUrl.error) {
                setError(normalizedPreviewUrl.error)
                return
            }

            const customModelValue = customModel.trim()
            const resolvedModel = resolveSpawnModel(agent, model, customModelValue)
            const resolvedThinkEffort = resolveSpawnThinkEffort(agent, thinkEffort)
            const resolvedServiceTier = resolveSpawnServiceTier(agent, serviceTier)
            const parsedNetworkPolicy = normalizeNetworkPolicyInput(networkPolicy)
            const parsedLabels = parseListInput(labelsInput)
            const parsedSecrets = parseListInput(secretsInput)
            const parsedPreviewPort = parsePreviewPortInput(previewPreferredPort)
            const sessionSettings = resolveSpawnSessionSettings(
                sessionType,
                worktreeName,
                normalizedPreviewUrl.value ?? ''
            )
            const workspaceSource: WorkspaceSource | undefined = executionBackend === 'local' || !trimmedRepositoryUrl
                ? undefined
                : {
                    type: 'repo',
                    repository: {
                        url: trimmedRepositoryUrl,
                        ref: repositoryBranch.trim() ? { branch: repositoryBranch.trim() } : undefined,
                        branchStrategy: {
                            mode: repositoryBranchMode,
                            ...(repositoryBranch.trim() ? { baseBranch: repositoryBranch.trim() } : {}),
                            ...(repositoryBranchMode === 'create' && repositoryBranchPrefix.trim() ? { prefix: repositoryBranchPrefix.trim() } : {}),
                            ...(repositoryBranchMode === 'create' && repositoryBranchName.trim() ? { name: repositoryBranchName.trim() } : {})
                        }
                    }
                }
            const workspace: WorkspaceSpec | undefined = executionBackend === 'local'
                ? undefined
                : { mode: workspaceMode }
            const spawnDirectory = workspaceSource?.type === 'repo'
                ? undefined
                : trimmedDirectory || undefined
            const ttlValue = ttlMinutes.trim() ? Number(ttlMinutes.trim()) : undefined
            const cloudEnvironment: EnvironmentTemplate | undefined = environmentId.trim()
                ? {
                    id: environmentId.trim(),
                    runtime: {
                        kind: runtimeKind,
                        checkpointId: trimmedCheckpointId || undefined
                    }
                }
                : runtimeKind !== 'host-process'
                    ? {
                        runtime: {
                            kind: runtimeKind,
                            checkpointId: trimmedCheckpointId || undefined
                        }
                    }
                    : undefined
            const result = await spawnSession({
                machineId,
                directory: spawnDirectory,
                agent,
                model: resolvedModel,
                thinkEffort: resolvedThinkEffort,
                serviceTier: resolvedServiceTier,
                yolo: yoloMode,
                sessionType: sessionSettings.sessionType,
                worktreeName: sessionSettings.worktreeName,
                previewUrl: sessionSettings.previewUrl,
                executionBackend,
                runtimeKind,
                launchMode,
                environmentId: environmentId.trim() || undefined,
                environment: cloudEnvironment,
                checkpointId: executionBackend === 'local' ? undefined : trimmedCheckpointId,
                repoSyncPolicy: executionBackend === 'local' ? undefined : 'fetch-reset',
                workspaceSource,
                workspace,
                gitIdentity: {
                    ...(gitName.trim() ? { name: gitName.trim() } : {}),
                    ...(gitEmail.trim() ? { email: gitEmail.trim() } : {}),
                    ...(cloudAgentSettingsQuery.data?.settings.githubUsername?.trim()
                        ? { githubUsername: cloudAgentSettingsQuery.data.settings.githubUsername.trim() }
                        : {})
                },
                networkPolicy: parsedNetworkPolicy,
                ttlMinutes: typeof ttlValue === 'number' && Number.isFinite(ttlValue) && ttlValue > 0 ? ttlValue : undefined,
                persistentWorkspace,
                labels: parsedLabels,
                secrets: parsedSecrets,
                preview: {
                    autoDetect: previewAutoDetect,
                    preferredPort: parsedPreviewPort
                }
            })

            if (result.type === 'success' || result.type === 'accepted') {
                haptic.notification('success')
                if (machineId !== AUTO_CLOUD_MACHINE_ID) {
                    setLastUsedMachineId(machineId)
                    if (spawnDirectory) {
                        addRecentPath(machineId, spawnDirectory)
                    }
                }
                savePreferredAgent(agent)
                savePreferredModel(agent, model)
                savePreferredCustomModel(agent, customModelValue)
                savePreferredThinkEffort(agent, thinkEffort)
                savePreferredServiceTier(agent, serviceTier)
                savePreferredYoloMode(yoloMode)
                savePreferredSessionType(sessionType)
                savePreferredExecutionBackend(executionBackend)
                savePreferredRuntimeKind(runtimeKind)
                saveLastSessionConfig({
                    agent,
                    model,
                    customModel: customModelValue,
                    thinkEffort,
                    serviceTier,
                    yoloMode,
                    sessionType,
                    worktreeName: worktreeName.trim(),
                    previewUrl: normalizedPreviewUrl.value ?? '',
                    executionBackend,
                    runtimeKind,
                    launchMode,
                    environmentId: environmentId.trim(),
                    checkpointId: trimmedCheckpointId,
                    repositoryUrl: trimmedRepositoryUrl,
                    repositoryBranch: repositoryBranch.trim(),
                    repositoryBranchMode,
                    repositoryBranchPrefix: repositoryBranchPrefix.trim(),
                    repositoryBranchName: repositoryBranchName.trim(),
                    gitName: gitName.trim(),
                    gitEmail: gitEmail.trim(),
                    workspaceMode,
                    networkPolicy,
                    ttlMinutes: ttlMinutes.trim(),
                    labels: labelsInput.trim(),
                    secrets: secretsInput.trim(),
                    previewAutoDetect,
                    previewPreferredPort: previewPreferredPort.trim()
                })
                props.onSuccess(result)
                return
            }

            haptic.notification('error')
            setError(result.type === 'error'
                ? result.message
                : `Directory creation requires approval: ${result.directory}`)
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : 'Failed to create session')
        }
    }

    const canCreate = Boolean(
        machineId
        && !isFormDisabled
        && (
            (executionBackend === 'local' && directory.trim())
            || (executionBackend !== 'local' && (repositoryUrl.trim() || checkpointId.trim() || environmentId.trim()))
        )
    )

    const handleSubmit = (event: ReactFormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!canCreate) return
        void handleCreate()
    }

    const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Enter') return
        if (!(event.metaKey || event.ctrlKey)) return
        if (event.nativeEvent.isComposing) return

        event.preventDefault()
        if (!canCreate) return
        void handleCreate()
    }

    return (
        <form
            id={props.formId}
            className="flex flex-col divide-y divide-[var(--border-tertiary)]"
            onKeyDown={handleFormKeyDown}
            onSubmit={handleSubmit}
        >
            <MachineSelector
                machines={selectableMachines}
                machineId={machineId}
                showAutoOption={executionBackend !== 'local'}
                isLoading={props.isLoading}
                isDisabled={isFormDisabled}
                onChange={handleMachineChange}
            />
            {runnerSpawnError ? (
                <div className="px-3 py-3">
                    <CursorNotice tone="danger">
                        Runner last spawn error: {runnerSpawnError}
                    </CursorNotice>
                </div>
            ) : null}
            {executionBackend === 'local' ? (
                <DirectorySection
                    directory={directory}
                    suggestions={suggestions}
                    selectedIndex={selectedIndex}
                    isDisabled={isFormDisabled}
                    recentPaths={recentPaths}
                    onDirectoryChange={handleDirectoryChange}
                    onDirectoryFocus={handleDirectoryFocus}
                    onDirectoryBlur={handleDirectoryBlur}
                    onDirectoryKeyDown={handleDirectoryKeyDown}
                    onSuggestionSelect={handleSuggestionSelect}
                    onPathClick={handlePathClick}
                />
            ) : null}
            <CloudSettingsSection
                executionBackend={executionBackend}
                runtimeKind={runtimeKind}
                launchMode={launchMode}
                environmentId={environmentId}
                checkpointId={checkpointId}
                repositoryUrl={repositoryUrl}
                repositoryBranch={repositoryBranch}
                repositoryBranchMode={repositoryBranchMode}
                repositoryBranchPrefix={repositoryBranchPrefix}
                repositoryBranchName={repositoryBranchName}
                gitName={gitName}
                gitEmail={gitEmail}
                workspaceMode={workspaceMode}
                persistentWorkspace={persistentWorkspace}
                networkPolicy={networkPolicy}
                labelsInput={labelsInput}
                secretsInput={secretsInput}
                previewAutoDetect={previewAutoDetect}
                previewPreferredPort={previewPreferredPort}
                ttlMinutes={ttlMinutes}
                cloudInventorySummary={cloudInventorySummary}
                cloudCheckpoints={cloudCheckpoints}
                selectedProviderType={selectedCloudProvider?.type}
                selectedWorkerLifecycle={selectedCloudWorker?.lifecycle}
                runtimeWarning={cloudRuntimeWarning}
                cloudEnvironments={cloudEnvironments}
                cloudCheckpointsLoading={cloudCheckpointsLoading}
                cloudCheckpointsError={cloudCheckpointsError}
                cloudEnvironmentsLoading={cloudEnvironmentsLoading}
                cloudEnvironmentsError={cloudEnvironmentsError}
                cloudWorkersLoading={cloudWorkersLoading}
                hasSelectableWorkers={cloudWorkers.some((w) => w.active && w.selectable === true)}
                selectedEnvironmentSummary={selectedEnvironmentSummary}
                selectedCheckpoint={selectedCheckpoint}
                isDisabled={isFormDisabled}
                onExecutionBackendChange={setExecutionBackend}
                onRuntimeKindChange={setRuntimeKind}
                onLaunchModeChange={setLaunchMode}
                onEnvironmentIdChange={setEnvironmentId}
                onCheckpointIdChange={setCheckpointId}
                onRepositoryUrlChange={setRepositoryUrl}
                onRepositoryBranchChange={setRepositoryBranch}
                onRepositoryBranchModeChange={setRepositoryBranchMode}
                onRepositoryBranchPrefixChange={setRepositoryBranchPrefix}
                onRepositoryBranchNameChange={setRepositoryBranchName}
                onGitNameChange={setGitName}
                onGitEmailChange={setGitEmail}
                onWorkspaceModeChange={setWorkspaceMode}
                onPersistentWorkspaceChange={setPersistentWorkspace}
                onNetworkPolicyChange={setNetworkPolicy}
                onLabelsInputChange={setLabelsInput}
                onSecretsInputChange={setSecretsInput}
                onPreviewAutoDetectChange={setPreviewAutoDetect}
                onPreviewPreferredPortChange={setPreviewPreferredPort}
                onTtlMinutesChange={setTtlMinutes}
            />
            <div className="flex flex-col gap-1.5 px-3 py-3">
                <CursorFieldLabel>Preview URL (optional)</CursorFieldLabel>
                <CursorTextField
                    type="text"
                    placeholder="http://localhost:3000"
                    value={previewUrlInput}
                    onChange={(event) => setPreviewUrlInput(event.target.value)}
                    disabled={isFormDisabled}
                />
                {previewUrlHistory.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {previewUrlHistory.slice(0, 8).map((url) => (
                            <CursorBadgeButton
                                key={url}
                                onClick={() => setPreviewUrlInput(url)}
                                disabled={isFormDisabled}
                                className="max-w-[240px]"
                                title={url}
                            >
                                {url}
                            </CursorBadgeButton>
                        ))}
                    </div>
                ) : null}
            </div>
            <SessionTypeSelector
                sessionType={sessionType}
                worktreeName={worktreeName}
                worktreeInputRef={worktreeInputRef}
                isDisabled={isFormDisabled}
                onSessionTypeChange={setSessionType}
                onWorktreeNameChange={setWorktreeName}
            />
            <AgentSelector
                agent={agent}
                isDisabled={isFormDisabled}
                onAgentChange={setAgent}
            />
            <ModelSelector
                agent={agent}
                model={model}
                customModel={customModel}
                isDisabled={isFormDisabled}
                onModelChange={setModel}
                onCustomModelChange={setCustomModel}
            />
            <ThinkEffortSelector
                agent={agent}
                thinkEffort={thinkEffort}
                isDisabled={isFormDisabled}
                onThinkEffortChange={setThinkEffort}
            />
            <ServiceTierSelector
                agent={agent}
                serviceTier={serviceTier}
                isDisabled={isFormDisabled}
                onServiceTierChange={setServiceTier}
            />
            <YoloToggle
                yoloMode={yoloMode}
                isDisabled={isFormDisabled}
                onToggle={setYoloMode}
            />

            {(error ?? spawnError) ? (
                <div className="px-3 py-3">
                    <CursorNotice tone="danger">{error ?? spawnError}</CursorNotice>
                </div>
            ) : null}

            <ActionButtons
                isPending={isPending}
                canCreate={canCreate}
                isDisabled={isFormDisabled}
                onCancel={props.onCancel}
            />
        </form>
    )
}
