import { getPermissionModeLabel, getPermissionModeTone, isPermissionModeAllowedForFlavor } from '@hapi/protocol'
import type { PermissionModeTone } from '@hapi/protocol'
import type { ClaudeRateLimitSnapshot } from '@hapi/protocol/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentState, ModelMode, PermissionMode } from '@/types/api'
import type { ConversationStatus } from '@/realtime/types'
import { getContextBudgetTokens } from '@/chat/modelConfig'
import { useTranslation } from '@/lib/use-translation'
import { UsagePanel } from './UsagePanel'

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
    rateLimitSnapshot?: ClaudeRateLimitSnapshot
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

    const [usageOpen, setUsageOpen] = useState(false)
    const usageRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (!usageOpen) return
        const handler = (event: MouseEvent) => {
            if (!usageRef.current) return
            if (!usageRef.current.contains(event.target as Node)) {
                setUsageOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [usageOpen])

    const showUsageButton = props.agentFlavor === 'claude'
        && (typeof props.contextSize === 'number' || Boolean(props.rateLimitSnapshot))

    // When session is inactive, let the standalone 'Session is inactive' banner
    // own that communication — don't duplicate it inside the composer.
    if (!props.active) {
        return null
    }

    // Only render when there's real state to surface. Idle = null (cursor-parity).
    const hasPermissionRequests = Boolean(
        props.agentState?.requests && Object.keys(props.agentState.requests).length > 0
    )
    const hasVoiceActivity = Boolean(props.voiceStatus) && props.voiceStatus !== 'disconnected'
    const hasContextWarning = Boolean(contextWarning)
        && typeof props.contextSize === 'number'
        && Boolean(maxContextSize)
        && (props.contextSize / (maxContextSize || 1)) >= 0.5
    const hasMultipleAgents = runningAgents.length > 1
    // Idle = null. The permission-mode / plan-mode badges are not "content";
    // they're quiet preferences. Don't keep a status bar resident just to show them.
    const hasContent = Boolean(props.thinking)
        || hasPermissionRequests
        || hasVoiceActivity
        || hasContextWarning
        || hasMultipleAgents
        || showUsageButton

    if (!hasContent) {
        return null
    }

    return (
        <div
            className="composer-status-bar composer-statusbar flex items-start justify-between gap-3 overflow-x-auto"
            style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
            }}
        >
            <div className="composer-status-main flex min-w-0 flex-col gap-1">
                <div className="composer-status-row flex items-center gap-1.5">
                    <span
                        className={`composer-status-dot h-2 w-2 rounded-full ${connectionStatus.dotColor} ${connectionStatus.isPulsing ? 'animate-pulse' : ''}`}
                    />
                    <span className={`composer-status-text text-xs ${connectionStatus.color}`}>
                        {connectionStatus.text}
                    </span>
                    {codexModeLabel ? (
                        <span className={`composer-status-mode text-[length:var(--font-size-xs)] ${isCodexPlanMode ? 'text-[var(--accent)]' : 'text-[var(--cursor-text-secondary)]'}`}>
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
                                    className="composer-status-chip truncate rounded-full bg-[var(--cursor-bg-quiet)] px-2 py-0.5 text-[length:var(--font-size-xs)] text-[var(--cursor-text-secondary)]"
                                    style={{ maxWidth: '220px' }}
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
                {hasContextWarning && contextWarning ? (
                    <span className={`composer-status-context text-[10px] ${contextWarning.color}`}>
                        {contextWarning.text}
                    </span>
                ) : null}
                {displayPermissionMode ? (
                    <span className={`composer-status-permission text-xs ${permissionModeColor}`}>
                        {permissionModeLabel}
                    </span>
                ) : null}
                {showUsageButton ? (
                    <div ref={usageRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setUsageOpen((prev) => !prev)}
                            aria-label="Show usage"
                            className="composer-status-usage flex h-5 w-5 items-center justify-center rounded text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-soft)] hover:text-[var(--cursor-text-primary)]"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="20" x2="18" y2="10" />
                                <line x1="12" y1="20" x2="12" y2="4" />
                                <line x1="6" y1="20" x2="6" y2="14" />
                            </svg>
                        </button>
                        {usageOpen ? (
                            <div className="absolute right-0 bottom-full z-50 mb-2">
                                <UsagePanel
                                    contextSize={props.contextSize}
                                    contextWindowTokens={maxContextSize ?? undefined}
                                    rateLimitSnapshot={props.rateLimitSnapshot}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
