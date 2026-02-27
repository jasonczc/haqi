import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent as ReactFormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useActiveSuggestions, type Suggestion } from '@/hooks/useActiveSuggestions'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { queryKeys } from '@/lib/query-keys'
import { normalizePreviewUrlInput } from '@/lib/preview-url'
import {
    CLAUDE_THINK_EFFORT_OPTIONS,
    CODEX_THINK_EFFORT_OPTIONS,
    MODEL_OPTIONS,
    type AgentType,
    type ThinkEffort,
    type SessionType
} from './types'
import { ActionButtons } from './ActionButtons'
import { AgentSelector } from './AgentSelector'
import { DirectorySection } from './DirectorySection'
import { MachineSelector } from './MachineSelector'
import { ModelSelector } from './ModelSelector'
import { ThinkEffortSelector } from './ThinkEffortSelector'
import {
    loadPreferredAgent,
    loadPreferredCustomModel,
    loadPreferredModel,
    loadPreferredSessionType,
    loadPreferredThinkEffort,
    loadPreferredYoloMode,
    savePreferredAgent,
    savePreferredCustomModel,
    savePreferredModel,
    savePreferredSessionType,
    savePreferredThinkEffort,
    savePreferredYoloMode,
} from './preferences'
import { SessionTypeSelector } from './SessionTypeSelector'
import { YoloToggle } from './YoloToggle'

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
    formId?: string
    onSuccess: (sessionId: string) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()
    const initialAgent = loadPreferredAgent()

    const [machineId, setMachineId] = useState<string | null>(props.initialMachineId ?? null)
    const [directory, setDirectory] = useState(props.initialDirectory ?? '')
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)
    const [pathExistence, setPathExistence] = useState<Record<string, boolean>>({})
    const [agent, setAgent] = useState<AgentType>(initialAgent)
    const [model, setModel] = useState(() => loadPreferredModel(initialAgent) ?? (MODEL_OPTIONS[initialAgent][0]?.value ?? 'auto'))
    const [customModel, setCustomModel] = useState(() => loadPreferredCustomModel(initialAgent))
    const [thinkEffort, setThinkEffort] = useState<ThinkEffort>(() => loadPreferredThinkEffort(initialAgent) ?? getDefaultThinkEffort(initialAgent))
    const [yoloMode, setYoloMode] = useState(loadPreferredYoloMode)
    const [sessionType, setSessionType] = useState<SessionType>(loadPreferredSessionType)
    const [worktreeName, setWorktreeName] = useState('')
    const [previewUrlInput, setPreviewUrlInput] = useState('')
    const [error, setError] = useState<string | null>(null)
    const worktreeInputRef = useRef<HTMLInputElement>(null)
    const previousModelAgentRef = useRef<AgentType | null>(initialAgent)
    const previousThinkEffortAgentRef = useRef<AgentType | null>(initialAgent)
    const previousCustomModelAgentRef = useRef<AgentType | null>(initialAgent)
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
        setModel(loadPreferredModel(agent) ?? (MODEL_OPTIONS[agent][0]?.value ?? 'auto'))
        setCustomModel(loadPreferredCustomModel(agent))
        setThinkEffort(loadPreferredThinkEffort(agent) ?? getDefaultThinkEffort(agent))
    }, [agent])

    useEffect(() => {
        savePreferredAgent(agent)
    }, [agent])

    useEffect(() => {
        if (previousModelAgentRef.current !== agent) {
            previousModelAgentRef.current = agent
            return
        }
        savePreferredModel(agent, model)
    }, [agent, model])

    useEffect(() => {
        if (previousThinkEffortAgentRef.current !== agent) {
            previousThinkEffortAgentRef.current = agent
            return
        }
        savePreferredThinkEffort(agent, thinkEffort)
    }, [agent, thinkEffort])

    useEffect(() => {
        if (previousCustomModelAgentRef.current !== agent) {
            previousCustomModelAgentRef.current = agent
            return
        }
        savePreferredCustomModel(agent, customModel)
    }, [agent, customModel])

    useEffect(() => {
        savePreferredYoloMode(yoloMode)
    }, [yoloMode])

    useEffect(() => {
        savePreferredSessionType(sessionType)
    }, [sessionType])

    useEffect(() => {
        if (props.machines.length === 0) return
        if (machineId && props.machines.find((m) => m.id === machineId)) return

        const lastUsed = getLastUsedMachineId()
        const foundLast = lastUsed ? props.machines.find((m) => m.id === lastUsed) : null

        if (foundLast) {
            setMachineId(foundLast.id)
            if (!hasPresetDirectory) {
                const paths = getRecentPaths(foundLast.id)
                if (paths[0]) setDirectory(paths[0])
            }
        } else if (props.machines[0]) {
            setMachineId(props.machines[0].id)
        }
    }, [props.machines, machineId, getLastUsedMachineId, getRecentPaths, hasPresetDirectory])

    const recentPaths = useMemo(
        () => getRecentPaths(machineId),
        [getRecentPaths, machineId]
    )

    const modelOptions = useMemo(() => {
        return MODEL_OPTIONS[agent]
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

    const allPaths = useDirectorySuggestions(machineId, sessions, recentPaths)

    const pathsToCheck = useMemo(
        () => Array.from(new Set(allPaths)).slice(0, 1000),
        [allPaths]
    )

    useEffect(() => {
        let cancelled = false

        if (!machineId || pathsToCheck.length === 0) {
            setPathExistence({})
            return () => { cancelled = true }
        }

        void props.api.checkMachinePathsExists(machineId, pathsToCheck)
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
    }, [machineId, pathsToCheck, props.api])

    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
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
        const paths = getRecentPaths(newMachineId)
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
        if (!machineId || !directory.trim()) return

        setError(null)
        try {
            const normalizedPreviewUrl = normalizePreviewUrlInput(previewUrlInput)
            if (normalizedPreviewUrl.error) {
                setError(normalizedPreviewUrl.error)
                return
            }

            const customModelValue = customModel.trim()
            const isAutoModel = model === 'auto'
                || model === 'auto-gemini-3'
                || model === 'auto-gemini-2.5'
            const isGeminiManualModel = agent === 'gemini' && model === 'manual'
            const resolvedModel = customModelValue
                ? customModelValue
                : (!isAutoModel && !isGeminiManualModel && agent !== 'opencode' ? model : undefined)
            const resolvedThinkEffort = agent === 'codex' && thinkEffort !== 'auto'
                ? thinkEffort
                : agent === 'claude' && thinkEffort !== 'auto' && thinkEffort !== 'xhigh'
                    ? thinkEffort
                : undefined
            const result = await spawnSession({
                machineId,
                directory: directory.trim(),
                agent,
                model: resolvedModel,
                thinkEffort: resolvedThinkEffort,
                yolo: yoloMode,
                sessionType,
                worktreeName: sessionType === 'worktree' ? (worktreeName.trim() || undefined) : undefined,
                previewUrl: normalizedPreviewUrl.value ?? undefined
            })

            if (result.type === 'success') {
                haptic.notification('success')
                setLastUsedMachineId(machineId)
                addRecentPath(machineId, directory.trim())
                props.onSuccess(result.sessionId)
                return
            }

            haptic.notification('error')
            setError(result.message)
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : 'Failed to create session')
        }
    }

    const canCreate = Boolean(machineId && directory.trim() && !isFormDisabled)

    const handleSubmit = (event: ReactFormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!canCreate) return
        void handleCreate()
    }

    return (
        <form
            id={props.formId}
            className="flex flex-col divide-y divide-[var(--app-divider)]"
            onSubmit={handleSubmit}
        >
            <MachineSelector
                machines={props.machines}
                machineId={machineId}
                isLoading={props.isLoading}
                isDisabled={isFormDisabled}
                onChange={handleMachineChange}
            />
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
            <div className="flex flex-col gap-1.5 px-3 py-3">
                <label className="text-xs font-medium text-[var(--app-hint)]">
                    Preview URL (optional)
                </label>
                <input
                    type="text"
                    placeholder="http://localhost:3000"
                    value={previewUrlInput}
                    onChange={(event) => setPreviewUrlInput(event.target.value)}
                    disabled={isFormDisabled}
                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                />
                {previewUrlHistory.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {previewUrlHistory.slice(0, 8).map((url) => (
                            <button
                                key={url}
                                type="button"
                                onClick={() => setPreviewUrlInput(url)}
                                disabled={isFormDisabled}
                                className="max-w-[240px] truncate rounded bg-[var(--app-subtle-bg)] px-2 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:opacity-50"
                                title={url}
                            >
                                {url}
                            </button>
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
            <YoloToggle
                yoloMode={yoloMode}
                isDisabled={isFormDisabled}
                onToggle={setYoloMode}
            />

            {(error ?? spawnError) ? (
                <div className="px-3 py-2 text-sm text-red-600">
                    {error ?? spawnError}
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
