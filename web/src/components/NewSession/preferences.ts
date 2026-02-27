import type { AgentType, SessionType, ThinkEffort } from './types'
import { MODEL_OPTIONS, getThinkEffortOptions } from './types'

const AGENT_STORAGE_KEY = 'hapi:newSession:agent'
const YOLO_STORAGE_KEY = 'hapi:newSession:yolo'
const SESSION_TYPE_STORAGE_KEY = 'hapi:newSession:sessionType'
const THINK_EFFORT_STORAGE_KEY = 'hapi:newSession:thinkEffortByAgent'
const MODEL_STORAGE_KEY = 'hapi:newSession:modelByAgent'
const CUSTOM_MODEL_STORAGE_KEY = 'hapi:newSession:customModelByAgent'

const VALID_AGENTS: AgentType[] = ['claude', 'codex', 'gemini', 'opencode']
type AgentPreferenceMap = Partial<Record<AgentType, string>>

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
