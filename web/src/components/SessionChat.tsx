import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type {
    AttachmentMetadata,
    CodexQueueState,
    CodexStatusResponse,
    DecryptedMessage,
    ModelMode,
    PermissionMode,
    Session
} from '@/types/api'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { reduceChatBlocks } from '@/chat/reducer'
import { reconcileChatBlocks } from '@/chat/reconcile'
import { HappyComposer, type CodexSendMode } from '@/components/AssistantChat/HappyComposer'
import { HappyThread } from '@/components/AssistantChat/HappyThread'
import { useHappyRuntime } from '@/lib/assistant-runtime'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'
import { SessionHeader } from '@/components/SessionHeader'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import type { SessionListDensity } from '@/hooks/useSessionListDensity'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'
import { useVoiceOptional } from '@/lib/voice-context'
import { RealtimeVoiceSession, registerSessionStore, registerVoiceHooksStore, voiceHooks } from '@/realtime'

type CodexStatusRow = {
    label: string
    value: string
}

function parseCodexStatusRows(message: string): CodexStatusRow[] {
    return message
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2))
        .map((line) => {
            const separatorIndex = line.indexOf(':')
            if (separatorIndex <= 0) {
                return { label: line, value: '' }
            }
            return {
                label: line.slice(0, separatorIndex).trim(),
                value: line.slice(separatorIndex + 1).trim()
            }
        })
}

function isWideStatusField(label: string): boolean {
    const normalized = label.toLowerCase()
    return normalized.includes('rate limit')
        || normalized.includes('login status')
        || normalized.includes('native status warnings')
}

function parseRateLimitValue(value: string): { usedPercent: number | null; resetAt: string } {
    const match = value.match(/^(\d+(?:\.\d+)?)%\s*,\s*resets at\s*(.+)$/i)
    if (!match) {
        return { usedPercent: null, resetAt: value }
    }
    return {
        usedPercent: Number.parseFloat(match[1]),
        resetAt: match[2] ?? ''
    }
}

function getBooleanValueTone(value: string): 'yes' | 'no' | 'unknown' | null {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'yes') return 'yes'
    if (normalized === 'no') return 'no'
    if (normalized === 'unknown') return 'unknown'
    return null
}

function isQueueStatusField(label: string): boolean {
    const normalized = label.trim().toLowerCase()
    return normalized === 'queue pending'
        || normalized === 'in queue'
        || normalized === 'task running'
        || normalized === 'next queued message'
}

const CODEX_SEND_MODE_STORAGE_PREFIX = 'hapi:codexSendMode:'

function getCodexSendModeStorageKey(sessionId: string): string {
    return `${CODEX_SEND_MODE_STORAGE_PREFIX}${sessionId}`
}

function readCodexSendMode(sessionId: string): CodexSendMode {
    if (typeof window === 'undefined') {
        return 'direct'
    }
    try {
        const value = localStorage.getItem(getCodexSendModeStorageKey(sessionId))
        return value === 'queue' ? 'queue' : 'direct'
    } catch {
        return 'direct'
    }
}

function writeCodexSendMode(sessionId: string, mode: CodexSendMode): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        localStorage.setItem(getCodexSendModeStorageKey(sessionId), mode)
    } catch {
    }
}

export function SessionChat(props: {
    api: ApiClient
    session: Session
    messages: DecryptedMessage[]
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    isSending: boolean
    pendingCount: number
    messagesVersion: number
    onBack: () => void
    onRefresh: () => void
    onLoadMore: () => Promise<unknown>
    onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onRetryMessage?: (localId: string) => void
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    onToggleSidebar?: () => void
    sidebarVisible?: boolean
    density?: SessionListDensity
}) {
    const { t } = useTranslation()
    const { haptic } = usePlatform()
    const navigate = useNavigate()
    const sessionInactive = !props.session.active
    const normalizedCacheRef = useRef<Map<string, { source: DecryptedMessage; normalized: NormalizedMessage | null }>>(new Map())
    const blocksByIdRef = useRef<Map<string, ChatBlock>>(new Map())
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const [isCodexStatusDialogOpen, setIsCodexStatusDialogOpen] = useState(false)
    const [isCodexStatusLoading, setIsCodexStatusLoading] = useState(false)
    const [codexStatusMessage, setCodexStatusMessage] = useState('')
    const [codexStatusError, setCodexStatusError] = useState<string | null>(null)
    const [codexQueueStatus, setCodexQueueStatus] = useState<CodexStatusResponse['queue'] | null>(null)
    const [codexQueueState, setCodexQueueState] = useState<CodexQueueState | null>(null)
    const [isCodexQueueDialogOpen, setIsCodexQueueDialogOpen] = useState(false)
    const [isCodexQueueLoading, setIsCodexQueueLoading] = useState(false)
    const [isCodexQueueMutating, setIsCodexQueueMutating] = useState(false)
    const [codexQueueError, setCodexQueueError] = useState<string | null>(null)
    const [codexSendMode, setCodexSendMode] = useState<CodexSendMode>(() => readCodexSendMode(props.session.id))
    const codexStatusRows = useMemo(() => parseCodexStatusRows(codexStatusMessage), [codexStatusMessage])
    const codexStatusDetailRows = useMemo(
        () => codexQueueStatus
            ? codexStatusRows.filter((row) => !isQueueStatusField(row.label))
            : codexStatusRows,
        [codexQueueStatus, codexStatusRows]
    )
    const codexQueueEntries = codexQueueState?.entries ?? []
    const codexQueuePendingCount = codexQueueState?.pendingCount
        ?? codexQueueStatus?.pendingCount
        ?? 0
    const agentFlavor = props.session.metadata?.flavor ?? null
    const { abortSession, switchSession, setPermissionMode, setModelMode } = useSessionActions(
        props.api,
        props.session.id,
        agentFlavor
    )

    // Voice assistant integration
    const voice = useVoiceOptional()

    // Register session store for voice client tools
    useEffect(() => {
        registerSessionStore({
            getSession: () => props.session as { agentState?: { requests?: Record<string, unknown> } } | null,
            sendMessage: (_sessionId: string, message: string) => props.onSend(message),
            approvePermission: async (_sessionId: string, requestId: string) => {
                await props.api.approvePermission(props.session.id, requestId)
                props.onRefresh()
            },
            denyPermission: async (_sessionId: string, requestId: string) => {
                await props.api.denyPermission(props.session.id, requestId)
                props.onRefresh()
            }
        })
    }, [props.session, props.api, props.onSend, props.onRefresh])

    useEffect(() => {
        registerVoiceHooksStore(
            (sessionId) => (sessionId === props.session.id ? props.session : null),
            (sessionId) => (sessionId === props.session.id ? props.messages : [])
        )
    }, [props.session, props.messages])

    // Track and report new messages to voice assistant
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevMessagesRef = useRef<DecryptedMessage[]>([])

    useEffect(() => {
        const prevIds = new Set(prevMessagesRef.current.map(m => m.id))
        const newMessages = props.messages.filter(m => !prevIds.has(m.id))

        if (newMessages.length > 0) {
            voiceHooks.onMessages(props.session.id, newMessages)
        }

        prevMessagesRef.current = props.messages
    }, [props.messages, props.session.id])

    // Report ready event when thinking stops
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevThinkingRef = useRef(props.session.thinking)

    useEffect(() => {
        // Detect transition: thinking → not thinking
        if (prevThinkingRef.current && !props.session.thinking) {
            voiceHooks.onReady(props.session.id)
        }

        prevThinkingRef.current = props.session.thinking
    }, [props.session.thinking, props.session.id])

    // Report permission requests to voice assistant
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevRequestIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        const requests = props.session.agentState?.requests ?? {}
        const currentIds = new Set(Object.keys(requests))

        for (const [requestId, request] of Object.entries(requests)) {
            if (!prevRequestIdsRef.current.has(requestId)) {
                voiceHooks.onPermissionRequested(
                    props.session.id,
                    requestId,
                    (request as { tool?: string }).tool ?? 'unknown',
                    (request as { arguments?: unknown }).arguments
                )
            }
        }

        prevRequestIdsRef.current = currentIds
    }, [props.session.agentState?.requests, props.session.id])

    const handleVoiceToggle = useCallback(async () => {
        if (!voice) return
        if (voice.status === 'connected' || voice.status === 'connecting') {
            await voice.stopVoice()
        } else {
            await voice.startVoice(props.session.id)
        }
    }, [voice, props.session.id])

    const handleVoiceMicToggle = useCallback(() => {
        if (!voice) return
        voice.toggleMic()
    }, [voice])

    // Track session id to clear caches when it changes
    const prevSessionIdRef = useRef<string | null>(null)

    useEffect(() => {
        normalizedCacheRef.current.clear()
        blocksByIdRef.current.clear()
    }, [props.session.id])

    useEffect(() => {
        setIsCodexStatusDialogOpen(false)
        setIsCodexStatusLoading(false)
        setCodexStatusMessage('')
        setCodexStatusError(null)
        setCodexQueueStatus(null)
        setCodexQueueState(null)
        setIsCodexQueueDialogOpen(false)
        setIsCodexQueueLoading(false)
        setIsCodexQueueMutating(false)
        setCodexQueueError(null)
        setCodexSendMode(readCodexSendMode(props.session.id))
    }, [props.session.id])

    const normalizedMessages: NormalizedMessage[] = useMemo(() => {
        // Clear caches immediately when session changes (before useEffect runs)
        if (prevSessionIdRef.current !== null && prevSessionIdRef.current !== props.session.id) {
            normalizedCacheRef.current.clear()
            blocksByIdRef.current.clear()
        }
        prevSessionIdRef.current = props.session.id

        const cache = normalizedCacheRef.current
        const normalized: NormalizedMessage[] = []
        const seen = new Set<string>()
        for (const message of props.messages) {
            seen.add(message.id)
            const cached = cache.get(message.id)
            if (cached && cached.source === message) {
                if (cached.normalized) normalized.push(cached.normalized)
                continue
            }
            const next = normalizeDecryptedMessage(message)
            cache.set(message.id, { source: message, normalized: next })
            if (next) normalized.push(next)
        }
        for (const id of cache.keys()) {
            if (!seen.has(id)) {
                cache.delete(id)
            }
        }
        return normalized
    }, [props.messages])

    const reduced = useMemo(
        () => reduceChatBlocks(normalizedMessages, props.session.agentState),
        [normalizedMessages, props.session.agentState]
    )
    const reconciled = useMemo(
        () => reconcileChatBlocks(reduced.blocks, blocksByIdRef.current),
        [reduced.blocks]
    )

    useEffect(() => {
        blocksByIdRef.current = reconciled.byId
    }, [reconciled.byId])

    // Permission mode change handler
    const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
        try {
            await setPermissionMode(mode)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set permission mode:', e)
        }
    }, [setPermissionMode, props.onRefresh, haptic])

    // Model mode change handler
    const handleModelModeChange = useCallback(async (mode: ModelMode) => {
        try {
            await setModelMode(mode)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set model mode:', e)
        }
    }, [setModelMode, props.onRefresh, haptic])

    // Abort handler
    const handleAbort = useCallback(async () => {
        await abortSession()
        props.onRefresh()
    }, [abortSession, props.onRefresh])

    // Switch to remote handler
    const handleSwitchToRemote = useCallback(async () => {
        await switchSession()
        props.onRefresh()
    }, [switchSession, props.onRefresh])

    const handleViewFiles = useCallback(() => {
        navigate({
            to: '/sessions/$sessionId/files',
            params: { sessionId: props.session.id }
        })
    }, [navigate, props.session.id])

    const handleViewTerminal = useCallback(() => {
        navigate({
            to: '/sessions/$sessionId/terminal',
            params: { sessionId: props.session.id }
        })
    }, [navigate, props.session.id])

    const handleSend = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
        props.onSend(text, attachments)
        setForceScrollToken((token) => token + 1)
    }, [props.onSend])

    const applyCodexQueueSummary = useCallback((queue: CodexStatusResponse['queue'] | CodexQueueState | null | undefined) => {
        if (!queue) {
            setCodexQueueStatus(null)
            return
        }
        setCodexQueueStatus({
            pendingCount: queue.pendingCount,
            inQueue: queue.inQueue,
            taskRunning: queue.taskRunning,
            nextPreview: queue.nextPreview
        })
    }, [])

    const refreshCodexQueue = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
        if (agentFlavor !== 'codex') {
            return
        }

        if (!options?.silent) {
            setIsCodexQueueLoading(true)
        }

        try {
            const result = await props.api.getCodexQueue(props.session.id)
            if (result.success) {
                setCodexQueueState(result.queue ?? null)
                applyCodexQueueSummary(result.queue)
                setCodexQueueError(null)
            } else {
                const message = result.error ?? t('codexQueue.dialog.fetchError')
                setCodexQueueError(message)
                setCodexQueueState(result.queue ?? null)
                applyCodexQueueSummary(result.queue)
                if (!options?.silent) {
                    haptic.notification('error')
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : t('codexQueue.dialog.fetchError')
            setCodexQueueError(message)
            if (!options?.silent) {
                haptic.notification('error')
            }
        } finally {
            if (!options?.silent) {
                setIsCodexQueueLoading(false)
            }
        }
    }, [agentFlavor, props.api, props.session.id, t, haptic, applyCodexQueueSummary])

    const handleCodexQueueModeChange = useCallback((mode: CodexSendMode) => {
        setCodexSendMode(mode)
        writeCodexSendMode(props.session.id, mode)
    }, [props.session.id])

    const handleCodexQueueRefreshAfterSend = useCallback(() => {
        if (agentFlavor !== 'codex') {
            return
        }
        setTimeout(() => {
            void refreshCodexQueue({ silent: true })
        }, 150)
    }, [agentFlavor, refreshCodexQueue])

    const handleCodexQueueOpen = useCallback(() => {
        if (agentFlavor !== 'codex') {
            return
        }
        setIsCodexQueueDialogOpen(true)
        setCodexQueueError(null)
        void refreshCodexQueue()
    }, [agentFlavor, refreshCodexQueue])

    const handleCodexQueueEnqueue = useCallback(async (payload: {
        text: string
        attachments?: AttachmentMetadata[]
    }) => {
        if (agentFlavor !== 'codex') {
            return
        }

        const result = await props.api.enqueueCodexMessage(props.session.id, payload)
        if (!result.success) {
            const message = result.error ?? t('codexQueue.dialog.actionError')
            setCodexQueueError(message)
            if (result.queue) {
                setCodexQueueState(result.queue)
                applyCodexQueueSummary(result.queue)
            }
            haptic.notification('error')
            throw new Error(message)
        }

        setCodexQueueError(null)
        setCodexQueueState(result.queue ?? null)
        applyCodexQueueSummary(result.queue ?? null)
    }, [agentFlavor, props.api, props.session.id, t, haptic, applyCodexQueueSummary])

    const runCodexQueueAction = useCallback(async (
        action: () => Promise<{ success: boolean; error?: string; queue?: CodexQueueState | null }>
    ) => {
        if (agentFlavor !== 'codex') {
            return
        }
        setIsCodexQueueMutating(true)
        setCodexQueueError(null)
        try {
            const result = await action()
            if (result.success) {
                setCodexQueueState(result.queue ?? null)
                applyCodexQueueSummary(result.queue ?? null)
                return
            }
            const message = result.error ?? t('codexQueue.dialog.actionError')
            setCodexQueueError(message)
            if (result.queue) {
                setCodexQueueState(result.queue)
                applyCodexQueueSummary(result.queue)
            }
            haptic.notification('error')
        } catch (error) {
            const message = error instanceof Error ? error.message : t('codexQueue.dialog.actionError')
            setCodexQueueError(message)
            haptic.notification('error')
        } finally {
            setIsCodexQueueMutating(false)
        }
    }, [agentFlavor, applyCodexQueueSummary, haptic, t])

    const handleCodexQueueClear = useCallback(() => {
        void runCodexQueueAction(async () => {
            const result = await props.api.clearCodexQueue(props.session.id)
            return {
                success: result.success,
                error: result.error,
                queue: result.queue ?? null
            }
        })
    }, [props.api, props.session.id, runCodexQueueAction])

    const handleCodexQueueRemove = useCallback((id: string) => {
        void runCodexQueueAction(async () => {
            const result = await props.api.removeCodexQueueItem(props.session.id, id)
            return {
                success: result.success,
                error: result.error,
                queue: result.queue ?? null
            }
        })
    }, [props.api, props.session.id, runCodexQueueAction])

    const handleCodexQueueMove = useCallback((id: string, toIndex: number) => {
        void runCodexQueueAction(async () => {
            const result = await props.api.moveCodexQueueItem(props.session.id, id, toIndex)
            return {
                success: result.success,
                error: result.error,
                queue: result.queue ?? null
            }
        })
    }, [props.api, props.session.id, runCodexQueueAction])

    const handleCodexStatus = useCallback(() => {
        if (agentFlavor !== 'codex') {
            return
        }

        setIsCodexStatusDialogOpen(true)
        setIsCodexStatusLoading(true)
        setCodexStatusError(null)

        void (async () => {
            try {
                const result = await props.api.getCodexStatus(props.session.id)
                if (result.success) {
                    setCodexStatusMessage(result.message ?? '')
                    applyCodexQueueSummary(result.queue ?? null)
                    return
                }

                const errorMessage = result.error ?? t('codexStatus.dialog.fetchError')
                setCodexStatusMessage('')
                setCodexStatusError(errorMessage)
                applyCodexQueueSummary(result.queue ?? null)
                haptic.notification('error')
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : t('codexStatus.dialog.fetchError')
                setCodexStatusMessage('')
                setCodexStatusError(errorMessage)
                applyCodexQueueSummary(null)
                haptic.notification('error')
            } finally {
                setIsCodexStatusLoading(false)
            }
        })()
    }, [agentFlavor, props.api, props.session.id, t, haptic, applyCodexQueueSummary])

    useEffect(() => {
        if (agentFlavor !== 'codex') {
            return
        }
        void refreshCodexQueue({ silent: true })
    }, [agentFlavor, props.session.id, props.session.thinking, refreshCodexQueue])

    useEffect(() => {
        if (agentFlavor !== 'codex' || !isCodexQueueDialogOpen) {
            return
        }
        const timer = window.setInterval(() => {
            void refreshCodexQueue({ silent: true })
        }, 2_000)
        return () => window.clearInterval(timer)
    }, [agentFlavor, isCodexQueueDialogOpen, refreshCodexQueue])

    const attachmentAdapter = useMemo(() => {
        if (!props.session.active) {
            return undefined
        }
        return createAttachmentAdapter(props.api, props.session.id)
    }, [props.api, props.session.id, props.session.active])

    const runtime = useHappyRuntime({
        session: props.session,
        blocks: reconciled.blocks,
        isSending: props.isSending,
        onSendMessage: handleSend,
        onAbort: handleAbort,
        attachmentAdapter,
        allowSendWhenInactive: true
    })

    return (
        <div className="flex h-full flex-col">
            <SessionHeader
                session={props.session}
                onBack={props.onBack}
                onToggleSidebar={props.onToggleSidebar}
                sidebarVisible={props.sidebarVisible}
                onViewFiles={props.session.metadata?.path ? handleViewFiles : undefined}
                api={props.api}
                onSessionDeleted={props.onBack}
            />

            {sessionInactive ? (
                <div className="px-3 pt-3">
                    <div className="mx-auto w-full max-w-content rounded-md bg-[var(--app-subtle-bg)] p-3 text-sm text-[var(--app-hint)]">
                        Session is inactive. Sending will resume it automatically.
                    </div>
                </div>
            ) : null}

            <AssistantRuntimeProvider runtime={runtime}>
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <HappyThread
                        key={props.session.id}
                        api={props.api}
                        sessionId={props.session.id}
                        metadata={props.session.metadata}
                        permissionMode={props.session.permissionMode}
                        disabled={sessionInactive}
                        onRefresh={props.onRefresh}
                        onRetryMessage={props.onRetryMessage}
                        onFlushPending={props.onFlushPending}
                        onAtBottomChange={props.onAtBottomChange}
                        isLoadingMessages={props.isLoadingMessages}
                        messagesWarning={props.messagesWarning}
                        hasMoreMessages={props.hasMoreMessages}
                        isLoadingMoreMessages={props.isLoadingMoreMessages}
                        onLoadMore={props.onLoadMore}
                        pendingCount={props.pendingCount}
                        rawMessagesCount={props.messages.length}
                        normalizedMessagesCount={normalizedMessages.length}
                        messagesVersion={props.messagesVersion}
                        forceScrollToken={forceScrollToken}
                        density={props.density ?? 'comfortable'}
                    />

                    <HappyComposer
                        sessionId={props.session.id}
                        disabled={props.isSending}
                        permissionMode={props.session.permissionMode}
                        modelMode={props.session.modelMode}
                        agentFlavor={agentFlavor}
                        active={props.session.active}
                        allowSendWhenInactive
                        thinking={props.session.thinking}
                        agentState={props.session.agentState}
                        contextSize={reduced.latestUsage?.contextSize}
                        controlledByUser={props.session.agentState?.controlledByUser === true}
                        onPermissionModeChange={handlePermissionModeChange}
                        onModelModeChange={handleModelModeChange}
                        onSwitchToRemote={handleSwitchToRemote}
                        onTerminal={props.session.active ? handleViewTerminal : undefined}
                        onCodexStatus={agentFlavor === 'codex' ? handleCodexStatus : undefined}
                        codexSendMode={codexSendMode}
                        onCodexSendModeChange={agentFlavor === 'codex' ? handleCodexQueueModeChange : undefined}
                        codexQueuePendingCount={codexQueuePendingCount}
                        onCodexQueueOpen={agentFlavor === 'codex' ? handleCodexQueueOpen : undefined}
                        onCodexQueueUpdated={agentFlavor === 'codex' ? handleCodexQueueRefreshAfterSend : undefined}
                        onCodexQueueEnqueue={agentFlavor === 'codex' ? handleCodexQueueEnqueue : undefined}
                        autocompleteSuggestions={props.autocompleteSuggestions}
                        voiceStatus={voice?.status}
                        voiceMicMuted={voice?.micMuted}
                        onVoiceToggle={voice ? handleVoiceToggle : undefined}
                        onVoiceMicToggle={voice ? handleVoiceMicToggle : undefined}
                    />
                </div>
            </AssistantRuntimeProvider>

            <Dialog open={isCodexStatusDialogOpen} onOpenChange={setIsCodexStatusDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('codexStatus.dialog.title')}</DialogTitle>
                        <DialogDescription>{t('codexStatus.dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-3 max-h-[75vh] overflow-auto">
                        {isCodexStatusLoading ? (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                                {t('codexStatus.dialog.loading')}
                            </div>
                        ) : codexStatusError ? (
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                                {codexStatusError}
                            </div>
                        ) : codexStatusDetailRows.length > 0 || codexQueueStatus ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {codexQueueStatus ? (
                                    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 sm:col-span-2">
                                        <div className="text-[11px] uppercase tracking-wide text-[var(--app-hint)]">
                                            Queue
                                        </div>
                                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <div className="rounded-md bg-[var(--app-subtle-bg)] p-2">
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                                    Pending
                                                </div>
                                                <div className="mt-1 text-lg font-semibold text-[var(--app-fg)]">
                                                    {codexQueueStatus.pendingCount}
                                                </div>
                                            </div>
                                            <div className="rounded-md bg-[var(--app-subtle-bg)] p-2">
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                                    In queue
                                                </div>
                                                <div className="mt-1">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                            codexQueueStatus.inQueue
                                                                ? 'bg-emerald-500/10 text-emerald-600'
                                                                : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'
                                                        }`}
                                                    >
                                                        {codexQueueStatus.inQueue ? 'yes' : 'no'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="rounded-md bg-[var(--app-subtle-bg)] p-2">
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                                    Task running
                                                </div>
                                                <div className="mt-1">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                            codexQueueStatus.taskRunning
                                                                ? 'bg-blue-500/10 text-blue-600'
                                                                : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'
                                                        }`}
                                                    >
                                                        {codexQueueStatus.taskRunning ? 'yes' : 'no'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {codexQueueStatus.nextPreview ? (
                                            <div className="mt-2 rounded-md bg-[var(--app-subtle-bg)] p-2">
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                                    Next queued message
                                                </div>
                                                <div className="mt-1 break-all text-sm font-mono text-[var(--app-fg)]">
                                                    {codexQueueStatus.nextPreview}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                                {codexStatusDetailRows.map((row) => {
                                    const rowKey = `${row.label}:${row.value}`
                                    const isWide = isWideStatusField(row.label)
                                    const booleanTone = getBooleanValueTone(row.value)
                                    const isRateLimit = row.label.toLowerCase().includes('rate limit')
                                    const rateLimit = isRateLimit ? parseRateLimitValue(row.value) : null
                                    const usedPercent = rateLimit?.usedPercent ?? null
                                    const progressToneClass = usedPercent === null
                                        ? 'bg-[var(--app-border)]'
                                        : usedPercent >= 85
                                            ? 'bg-red-500'
                                            : usedPercent >= 60
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                    const booleanToneClass = booleanTone === 'yes'
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : booleanTone === 'no'
                                            ? 'bg-red-500/10 text-red-600'
                                            : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'

                                    return (
                                        <div
                                            key={rowKey}
                                            className={`rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 ${isWide ? 'sm:col-span-2' : ''}`}
                                        >
                                            <div className="text-[11px] uppercase tracking-wide text-[var(--app-hint)]">
                                                {row.label}
                                            </div>
                                            {isRateLimit && rateLimit ? (
                                                <div className="mt-2 space-y-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-semibold">
                                                            {usedPercent === null ? t('codexStatus.dialog.empty') : `${usedPercent}%`}
                                                        </span>
                                                        <span className="text-xs text-[var(--app-hint)] break-all">
                                                            {rateLimit.resetAt}
                                                        </span>
                                                    </div>
                                                    {usedPercent !== null ? (
                                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-subtle-bg)]">
                                                            <div
                                                                className={`h-full rounded-full ${progressToneClass}`}
                                                                style={{ width: `${Math.max(0, Math.min(100, usedPercent))}%` }}
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : booleanTone ? (
                                                <div className="mt-2">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${booleanToneClass}`}>
                                                        {row.value}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="mt-2 break-all text-sm font-mono text-[var(--app-fg)]">
                                                    {row.value || t('codexStatus.dialog.empty')}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                                {codexStatusMessage || t('codexStatus.dialog.empty')}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isCodexQueueDialogOpen} onOpenChange={setIsCodexQueueDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('codexQueue.dialog.title')}</DialogTitle>
                        <DialogDescription>{t('codexQueue.dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-[var(--app-hint)]">
                                {t('codexQueue.dialog.modeLabel')}: {codexSendMode === 'queue'
                                    ? t('codexQueue.mode.queue')
                                    : t('codexQueue.mode.direct')}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => void refreshCodexQueue()}
                                    disabled={isCodexQueueLoading || isCodexQueueMutating}
                                >
                                    {t('codexQueue.dialog.refresh')}
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={handleCodexQueueClear}
                                    disabled={isCodexQueueMutating || codexQueueEntries.length === 0}
                                >
                                    {t('codexQueue.dialog.clear')}
                                </button>
                            </div>
                        </div>

                        {isCodexQueueLoading ? (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                                {t('codexQueue.dialog.loading')}
                            </div>
                        ) : null}

                        {codexQueueError ? (
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                                {codexQueueError}
                            </div>
                        ) : null}

                        {codexQueueStatus ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                    <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('codexQueue.summary.pending')}
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-[var(--app-fg)]">
                                        {codexQueueStatus.pendingCount}
                                    </div>
                                </div>
                                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                    <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('codexQueue.summary.inQueue')}
                                    </div>
                                    <div className="mt-1 text-sm text-[var(--app-fg)]">
                                        {codexQueueStatus.inQueue ? 'yes' : 'no'}
                                    </div>
                                </div>
                                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                    <div className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('codexQueue.summary.taskRunning')}
                                    </div>
                                    <div className="mt-1 text-sm text-[var(--app-fg)]">
                                        {codexQueueStatus.taskRunning ? 'yes' : 'no'}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {codexQueueEntries.length > 0 ? (
                            <div className="max-h-[55vh] space-y-2 overflow-auto pr-1">
                                {codexQueueEntries.map((entry, index) => (
                                    <div
                                        key={entry.id}
                                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[11px] uppercase tracking-wide text-[var(--app-hint)]">
                                                    #{index + 1}
                                                    {entry.isolate ? ` · ${t('codexQueue.entry.isolate')}` : ''}
                                                </div>
                                                <div className="mt-1 break-all text-sm font-mono text-[var(--app-fg)]">
                                                    {entry.preview || t('codexQueue.dialog.emptyMessage')}
                                                </div>
                                                <div className="mt-1 text-[10px] text-[var(--app-hint)]">
                                                    {new Date(entry.enqueuedAt).toLocaleTimeString()}
                                                </div>
                                            </div>
                                            <div className="ml-2 flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    aria-label={t('codexQueue.entry.moveUp')}
                                                    title={t('codexQueue.entry.moveUp')}
                                                    className="rounded border border-[var(--app-border)] px-1.5 py-1 text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={() => handleCodexQueueMove(entry.id, index - 1)}
                                                    disabled={isCodexQueueMutating || index <= 0}
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={t('codexQueue.entry.moveDown')}
                                                    title={t('codexQueue.entry.moveDown')}
                                                    className="rounded border border-[var(--app-border)] px-1.5 py-1 text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={() => handleCodexQueueMove(entry.id, index + 1)}
                                                    disabled={isCodexQueueMutating || index >= codexQueueEntries.length - 1}
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={t('codexQueue.entry.remove')}
                                                    title={t('codexQueue.entry.remove')}
                                                    className="rounded border border-red-500/40 px-1.5 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={() => handleCodexQueueRemove(entry.id)}
                                                    disabled={isCodexQueueMutating}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                                {t('codexQueue.dialog.empty')}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Voice session component - renders nothing but initializes ElevenLabs */}
            {voice && (
                <RealtimeVoiceSession
                    api={props.api}
                    micMuted={voice.micMuted}
                    onStatusChange={voice.setStatus}
                />
            )}
        </div>
    )
}
