import type { AgentType, ServiceTier, SessionType, ThinkEffort } from './types'
import { CODEX_SERVICE_TIER_OPTIONS, MODEL_OPTIONS, getThinkEffortOptions } from './types'
import type { ExecutionBackend, NetworkMode, RuntimeKind, WorkspaceMode } from '@/types/api'

const AGENT_STORAGE_KEY = 'hapi:newSession:agent'
const YOLO_STORAGE_KEY = 'hapi:newSession:yolo'
const SESSION_TYPE_STORAGE_KEY = 'hapi:newSession:sessionType'
const THINK_EFFORT_STORAGE_KEY = 'hapi:newSession:thinkEffortByAgent'
const SERVICE_TIER_STORAGE_KEY = 'hapi:newSession:serviceTierByAgent'
const MODEL_STORAGE_KEY = 'hapi:newSession:modelByAgent'
const CUSTOM_MODEL_STORAGE_KEY = 'hapi:newSession:customModelByAgent'
const EXECUTION_BACKEND_STORAGE_KEY = 'hapi:newSession:executionBackend'
const RUNTIME_KIND_STORAGE_KEY = 'hapi:newSession:runtimeKind'
const LAST_CONFIG_STORAGE_KEY = 'hapi:newSession:lastConfig'

const VALID_AGENTS: AgentType[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode']
const VALID_THINK_EFFORTS: ThinkEffort[] = ['auto', 'low', 'medium', 'high', 'max', 'xhigh']
type AgentPreferenceMap = Partial<Record<AgentType, string>>

export type LastSessionConfig = {
    agent?: AgentType
    model?: string
    customModel?: string
    thinkEffort?: ThinkEffort
    serviceTier?: ServiceTier
    yoloMode?: boolean
    sessionType?: SessionType
    worktreeName?: string
    previewUrl?: string
    runtimeKind?: RuntimeKind
    executionBackend?: ExecutionBackend
    launchMode?: 'interactive' | 'background'
    workspaceMode?: WorkspaceMode
    networkPolicy?: NetworkMode
    repositoryUrl?: string
    repositoryBranch?: string
    repositoryBranchMode?: 'create' | 'reuse' | 'detached'
    repositoryBranchPrefix?: string
    repositoryBranchName?: string
    gitName?: string
    gitEmail?: string
    environmentId?: string
    checkpointId?: string
    ttlMinutes?: string
    workspaceName?: string
    labels?: string
    secrets?: string
    previewAutoDetect?: boolean
    previewPreferredPort?: string
}

function loadAgentPreferenceMap(storageKey: string): AgentPreferenceMap {
    try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) return {}
        const parsed = JSON.parse(stored)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {}
        }

        const result: AgentPreferenceMap = {}
        for (const [key, value] of Object.entries(parsed)) {
            if (VALID_AGENTS.includes(key as AgentType) && typeof value === 'string') {
                result[key as AgentType] = value
            }
        }
        return result
    } catch {
        return {}
    }
}

function saveAgentPreferenceValue(storageKey: string, agent: AgentType, value: string): void {
    try {
        const current = loadAgentPreferenceMap(storageKey)
        if (value.trim().length === 0) {
            delete current[agent]
        } else {
            current[agent] = value
        }
        localStorage.setItem(storageKey, JSON.stringify(current))
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredAgent(): AgentType {
    try {
        const stored = localStorage.getItem(AGENT_STORAGE_KEY)
        if (stored && VALID_AGENTS.includes(stored as AgentType)) {
            return stored as AgentType
        }
    } catch {
        // Ignore storage errors
    }
    return 'claude'
}

export function savePreferredAgent(agent: AgentType): void {
    try {
        localStorage.setItem(AGENT_STORAGE_KEY, agent)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredYoloMode(): boolean {
    try {
        return localStorage.getItem(YOLO_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

export function savePreferredYoloMode(enabled: boolean): void {
    try {
        localStorage.setItem(YOLO_STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredSessionType(): SessionType {
    try {
        const stored = localStorage.getItem(SESSION_TYPE_STORAGE_KEY)
        if (stored === 'simple' || stored === 'worktree') {
            return stored
        }
    } catch {
        // Ignore storage errors
    }
    return 'simple'
}

export function savePreferredSessionType(value: SessionType): void {
    try {
        localStorage.setItem(SESSION_TYPE_STORAGE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredExecutionBackend(): ExecutionBackend {
    try {
        const stored = localStorage.getItem(EXECUTION_BACKEND_STORAGE_KEY)
        if (stored === 'local' || stored === 'cloud-self-hosted' || stored === 'cloud-managed') {
            return stored
        }
    } catch {
        // Ignore storage errors
    }
    return 'local'
}

export function savePreferredExecutionBackend(value: ExecutionBackend): void {
    try {
        localStorage.setItem(EXECUTION_BACKEND_STORAGE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredRuntimeKind(): RuntimeKind {
    try {
        const stored = localStorage.getItem(RUNTIME_KIND_STORAGE_KEY)
        if (stored === 'host-process' || stored === 'docker-session' || stored === 'daemon-session') {
            return stored
        }
    } catch {
        // Ignore storage errors
    }
    return 'host-process'
}

export function savePreferredRuntimeKind(value: RuntimeKind): void {
    try {
        localStorage.setItem(RUNTIME_KIND_STORAGE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredThinkEffort(agent: AgentType): ThinkEffort | null {
    const availableOptions = getThinkEffortOptions(agent)
    if (availableOptions.length === 0) {
        return null
    }

    const storedValue = loadAgentPreferenceMap(THINK_EFFORT_STORAGE_KEY)[agent]
    if (!storedValue) {
        return null
    }

    if (availableOptions.some((option) => option.value === storedValue)) {
        return storedValue as ThinkEffort
    }

    return null
}

export function savePreferredThinkEffort(agent: AgentType, value: ThinkEffort): void {
    const availableOptions = getThinkEffortOptions(agent)
    if (!availableOptions.some((option) => option.value === value)) {
        return
    }

    saveAgentPreferenceValue(THINK_EFFORT_STORAGE_KEY, agent, value)
}

export function loadPreferredServiceTier(agent: AgentType): ServiceTier | null {
    if (agent !== 'codex') {
        return null
    }

    const storedValue = loadAgentPreferenceMap(SERVICE_TIER_STORAGE_KEY)[agent]
    if (!storedValue) {
        return null
    }

    if (CODEX_SERVICE_TIER_OPTIONS.some((option) => option.value === storedValue)) {
        return storedValue as ServiceTier
    }

    return null
}

export function savePreferredServiceTier(agent: AgentType, value: ServiceTier): void {
    if (agent !== 'codex') {
        return
    }
    if (!CODEX_SERVICE_TIER_OPTIONS.some((option) => option.value === value)) {
        return
    }
    saveAgentPreferenceValue(SERVICE_TIER_STORAGE_KEY, agent, value)
}

export function loadPreferredModel(agent: AgentType): string | null {
    const availableOptions = MODEL_OPTIONS[agent]
    if (availableOptions.length === 0) {
        return null
    }

    const storedValue = loadAgentPreferenceMap(MODEL_STORAGE_KEY)[agent]
    if (!storedValue) {
        return null
    }

    if (availableOptions.some((option) => option.value === storedValue)) {
        return storedValue
    }

    return null
}

export function savePreferredModel(agent: AgentType, value: string): void {
    const availableOptions = MODEL_OPTIONS[agent]
    if (!availableOptions.some((option) => option.value === value)) {
        return
    }

    saveAgentPreferenceValue(MODEL_STORAGE_KEY, agent, value)
}

export function loadPreferredCustomModel(agent: AgentType): string {
    const storedValue = loadAgentPreferenceMap(CUSTOM_MODEL_STORAGE_KEY)[agent]
    if (!storedValue) {
        return ''
    }
    return storedValue
}

export function savePreferredCustomModel(agent: AgentType, value: string): void {
    saveAgentPreferenceValue(CUSTOM_MODEL_STORAGE_KEY, agent, value)
}

export function loadLastSessionConfig(): LastSessionConfig | null {
    try {
        const stored = localStorage.getItem(LAST_CONFIG_STORAGE_KEY)
        if (!stored) return null
        const parsed = JSON.parse(stored)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null
        }

        const config: LastSessionConfig = {}

        if (typeof parsed.agent === 'string' && VALID_AGENTS.includes(parsed.agent as AgentType)) {
            config.agent = parsed.agent as AgentType
        }
        if (typeof parsed.model === 'string') {
            config.model = parsed.model
        }
        if (typeof parsed.customModel === 'string') {
            config.customModel = parsed.customModel
        }
        if (typeof parsed.thinkEffort === 'string' && VALID_THINK_EFFORTS.includes(parsed.thinkEffort as ThinkEffort)) {
            config.thinkEffort = parsed.thinkEffort as ThinkEffort
        }
        if (typeof parsed.serviceTier === 'string' && CODEX_SERVICE_TIER_OPTIONS.some((option) => option.value === parsed.serviceTier)) {
            config.serviceTier = parsed.serviceTier as ServiceTier
        }
        if (typeof parsed.yoloMode === 'boolean') {
            config.yoloMode = parsed.yoloMode
        }
        if (parsed.sessionType === 'simple' || parsed.sessionType === 'worktree') {
            config.sessionType = parsed.sessionType
        }
        if (typeof parsed.worktreeName === 'string') {
            config.worktreeName = parsed.worktreeName
        }
        if (typeof parsed.previewUrl === 'string') {
            config.previewUrl = parsed.previewUrl
        }
        if (parsed.executionBackend === 'local' || parsed.executionBackend === 'cloud-self-hosted' || parsed.executionBackend === 'cloud-managed') {
            config.executionBackend = parsed.executionBackend
        }
        if (parsed.runtimeKind === 'host-process' || parsed.runtimeKind === 'docker-session' || parsed.runtimeKind === 'daemon-session') {
            config.runtimeKind = parsed.runtimeKind
        }
        if (parsed.workspaceMode === 'ephemeral' || parsed.workspaceMode === 'persistent' || parsed.workspaceMode === 'snapshot-derived') {
            config.workspaceMode = parsed.workspaceMode
        }
        if (parsed.networkPolicy === 'default' || parsed.networkPolicy === 'restricted' || parsed.networkPolicy === 'off') {
            config.networkPolicy = parsed.networkPolicy
        }
        if (typeof parsed.repositoryUrl === 'string') {
            config.repositoryUrl = parsed.repositoryUrl
        }
        if (typeof parsed.repositoryBranch === 'string') {
            config.repositoryBranch = parsed.repositoryBranch
        }
        if (parsed.repositoryBranchMode === 'create' || parsed.repositoryBranchMode === 'reuse' || parsed.repositoryBranchMode === 'detached') {
            config.repositoryBranchMode = parsed.repositoryBranchMode
        }
        if (typeof parsed.repositoryBranchPrefix === 'string') {
            config.repositoryBranchPrefix = parsed.repositoryBranchPrefix
        }
        if (typeof parsed.repositoryBranchName === 'string') {
            config.repositoryBranchName = parsed.repositoryBranchName
        }
        if (typeof parsed.environmentId === 'string') {
            config.environmentId = parsed.environmentId
        }
        if (typeof parsed.ttlMinutes === 'string') {
            config.ttlMinutes = parsed.ttlMinutes
        }
        if (typeof parsed.workspaceName === 'string') {
            config.workspaceName = parsed.workspaceName
        }
        if (typeof parsed.labels === 'string') {
            config.labels = parsed.labels
        }
        if (typeof parsed.secrets === 'string') {
            config.secrets = parsed.secrets
        }
        if (typeof parsed.previewAutoDetect === 'boolean') {
            config.previewAutoDetect = parsed.previewAutoDetect
        }
        if (typeof parsed.previewPreferredPort === 'string') {
            config.previewPreferredPort = parsed.previewPreferredPort
        }

        return Object.keys(config).length > 0 ? config : null
    } catch {
        return null
    }
}

export function saveLastSessionConfig(config: LastSessionConfig): void {
    try {
        localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify(config))
    } catch {
        // Ignore storage errors
    }
}
