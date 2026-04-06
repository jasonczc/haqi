import { getPermissionModeLabel, getPermissionModeTone, isPermissionModeAllowedForFlavor } from '@hapi/protocol'
import type { PermissionModeTone } from '@hapi/protocol'
import { useMemo } from 'react'
import type { AgentState, ModelMode, PermissionMode } from '@/types/api'
import type { ConversationStatus } from '@/realtime/types'
import { getContextBudgetTokens } from '@/chat/modelConfig'
import { useTranslation } from '@/lib/use-translation'

// Vibing messages for thinking state
const VIBING_MESSAGES = [
    "Accomplishing", "Actioning", "Actualizing", "Baking", "Booping", "Brewing",
    "Calculating", "Cerebrating", "Channelling", "Churning", "Clauding", "Coalescing",
    "Cogitating", "Computing", "Combobulating", "Concocting", "Conjuring", "Considering",
    "Contemplating", "Cooking", "Crafting", "Creating", "Crunching", "Deciphering",
    "Deliberating", "Determining", "Discombobulating", "Divining", "Doing", "Effecting",
    "Elucidating", "Enchanting", "Envisioning", "Finagling", "Flibbertigibbeting",
    "Forging", "Forming", "Frolicking", "Generating", "Germinating", "Hatching",
    "Herding", "Honking", "Ideating", "Imagining", "Incubating", "Inferring",
    "Manifesting", "Marinating", "Meandering", "Moseying", "Mulling", "Mustering",
    "Musing", "Noodling", "Percolating", "Perusing", "Philosophising", "Pontificating",
    "Pondering", "Processing", "Puttering", "Puzzling", "Reticulating", "Ruminating",
    "Scheming", "Schlepping", "Shimmying", "Simmering", "Smooshing", "Spelunking",
    "Spinning", "Stewing", "Sussing", "Synthesizing", "Thinking", "Tinkering",
    "Transmuting", "Unfurling", "Unravelling", "Vibing", "Wandering", "Whirring",
    "Wibbling", "Wizarding", "Working", "Wrangling"
]

const PERMISSION_TONE_CLASSES: Record<PermissionModeTone, string> = {
    neutral: 'text-[var(--cursor-text-secondary)]',
    info: 'text-[var(--accent)]',
    warning: 'text-[var(--warn)]',
    danger: 'text-[var(--danger)]'
}

function getConnectionStatus(
    active: boolean,
    thinking: boolean,
    agentState: AgentState | null | undefined,
    voiceStatus: ConversationStatus | undefined,
    t: (key: string) => string
): { text: string; color: string; dotColor: string; isPulsing: boolean } {
    const hasPermissions = agentState?.requests && Object.keys(agentState.requests).length > 0
    const runningAgents = agentState?.runningAgents ?? (agentState?.runningAgent ? [agentState.runningAgent] : [])
    const runningAgent = runningAgents[runningAgents.length - 1] ?? null

    // Voice connecting takes priority
    if (voiceStatus === 'connecting') {
        return {
            text: t('voice.connecting'),
            color: 'text-[var(--accent)]',
            dotColor: 'bg-[var(--accent)]',
            isPulsing: true
        }
    }

    if (!active) {
        return {
            text: t('misc.offline'),
            color: 'text-[var(--cursor-text-secondary)]',
            dotColor: 'bg-[var(--cursor-text-secondary)]',
            isPulsing: false
        }
    }

    if (hasPermissions) {
        return {
            text: t('misc.permissionRequired'),
            color: 'text-[var(--warn)]',
            dotColor: 'bg-[var(--warn)]',
            isPulsing: true
        }
    }

    if (thinking) {
        const agentName = typeof runningAgent?.name === 'string' ? runningAgent.name.trim() : ''
        const vibingMessage = runningAgents.length > 1
            ? `Running ${runningAgents.length} agents…`
            : agentName.length > 0
                ? `Running ${agentName}…`
                : VIBING_MESSAGES[Math.floor(Math.random() * VIBING_MESSAGES.length)].toLowerCase() + '…'
        return {
            text: vibingMessage,
            color: 'text-[var(--accent)]',
            dotColor: 'bg-[var(--accent)]',
            isPulsing: true
        }
    }

    return {
        text: t('misc.online'),
        color: 'text-[var(--success)]',
        dotColor: 'bg-[var(--success)]',
        isPulsing: false
    }
}

function getContextWarning(contextSize: number, maxContextSize: number, t: (key: string, params?: Record<string, string | number>) => string): { text: string; color: string } | null {
    const percentageUsed = (contextSize / maxContextSize) * 100
    const percentageRemaining = Math.max(0, 100 - percentageUsed)

    const percent = Math.round(percentageRemaining)
    if (percentageRemaining <= 5) {
        return { text: t('misc.percentLeft', { percent }), color: 'text-[var(--danger)]' }
    } else if (percentageRemaining <= 10) {
        return { text: t('misc.percentLeft', { percent }), color: 'text-[var(--warn)]' }
    } else {
        return { text: t('misc.percentLeft', { percent }), color: 'text-[var(--cursor-text-secondary)]' }
    }
}

export function StatusBar(props: {
    active: boolean
    thinking: boolean
    agentState: AgentState | null | undefined
    contextSize?: number
    contextWindowTokens?: number
    modelMode?: ModelMode
    permissionMode?: PermissionMode
    agentFlavor?: string | null
    collaborationMode?: string
    voiceStatus?: ConversationStatus
}) {
    const { t } = useTranslation()
    const connectionStatus = useMemo(
        () => getConnectionStatus(props.active, props.thinking, props.agentState, props.voiceStatus, t),
        [props.active, props.thinking, props.agentState, props.voiceStatus, t]
    )

    const maxContextSize = useMemo(
        () => props.contextWindowTokens ?? getContextBudgetTokens(props.modelMode),
        [props.contextWindowTokens, props.modelMode]
    )

    const contextWarning = useMemo(
        () => {
            if (props.contextSize === undefined) return null
            if (!maxContextSize) return null
            return getContextWarning(props.contextSize, maxContextSize, t)
        },
        [props.contextSize, maxContextSize, t]
    )

    const permissionMode = props.permissionMode
    const runningAgents = props.agentState?.runningAgents ?? (props.agentState?.runningAgent ? [props.agentState.runningAgent] : [])
    const displayPermissionMode = permissionMode
        && permissionMode !== 'default'
        && isPermissionModeAllowedForFlavor(permissionMode, props.agentFlavor)
        ? permissionMode
        : null

    const permissionModeLabel = displayPermissionMode ? getPermissionModeLabel(displayPermissionMode) : null
    const permissionModeTone = displayPermissionMode ? getPermissionModeTone(displayPermissionMode) : null
    const permissionModeColor = permissionModeTone ? PERMISSION_TONE_CLASSES[permissionModeTone] : 'text-[var(--cursor-text-secondary)]'
    const normalizedCollaborationMode = typeof props.collaborationMode === 'string'
        ? props.collaborationMode.trim().toLowerCase()
        : ''
    const isCodexPlanMode = props.agentFlavor === 'codex' && normalizedCollaborationMode === 'plan'
    const codexModeLabel = props.agentFlavor === 'codex'
        ? (isCodexPlanMode ? t('codex.mode.plan') : t('codex.mode.normal'))
        : null

    return (
        <div className="composer-status-bar flex items-start justify-between gap-3 px-2 pb-1">
            <div className="composer-status-main flex min-w-0 flex-col gap-1">
                <div className="composer-status-row flex items-center gap-1.5">
                    <span
                        className={`composer-status-dot h-2 w-2 rounded-full ${connectionStatus.dotColor} ${connectionStatus.isPulsing ? 'animate-pulse' : ''}`}
                    />
                    <span className={`composer-status-text text-xs ${connectionStatus.color}`}>
                        {connectionStatus.text}
                    </span>
                    {codexModeLabel ? (
                        <span className={`composer-status-mode text-[10px] ${isCodexPlanMode ? 'text-[var(--accent)]' : 'text-[var(--cursor-text-secondary)]'}`}>
                            {codexModeLabel}
                        </span>
                    ) : null}
                </div>
                {runningAgents.length > 1 ? (
                    <div className="composer-status-chips flex flex-wrap gap-1 pl-3.5">
                        {runningAgents.map((agent, index) => {
                            const label = agent.task ? `${agent.name}: ${agent.task}` : agent.name
                            return (
                                <span
                                    key={`${agent.name}:${agent.startedAt ?? index}`}
                                    className="composer-status-chip max-w-[220px] truncate rounded-full bg-[var(--cursor-bg-quiet)] px-2 py-0.5 text-[10px] text-[var(--cursor-text-secondary)]"
                                    title={label}
                                >
                                    {label}
                                </span>
                            )
                        })}
                    </div>
                ) : null}
            </div>

            <div className="composer-status-meta flex shrink-0 items-center gap-2">
                {contextWarning ? (
                    <span className={`composer-status-context text-[10px] ${contextWarning.color}`}>
                        {contextWarning.text}
                    </span>
                ) : null}
                {displayPermissionMode ? (
                    <span className={`composer-status-permission text-xs ${permissionModeColor}`}>
                        {permissionModeLabel}
                    </span>
                ) : null}
            </div>
        </div>
    )
}
