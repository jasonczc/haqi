import { getPermissionModeOptionsForFlavor, MODEL_MODE_LABELS, MODEL_MODES } from '@hapi/protocol'
import { ComposerPrimitive, useAssistantApi, useAssistantState } from '@assistant-ui/react'
import type { Attachment } from '@assistant-ui/react'
import {
    type ChangeEvent as ReactChangeEvent,
    type ClipboardEvent as ReactClipboardEvent,
    type FormEvent as ReactFormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type SyntheticEvent as ReactSyntheticEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react'
import type {
    AgentState,
    AttachmentMetadata,
    CodexQueueEntry,
    CodexQueueSummary,
    ModelMode,
    PermissionMode
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { ConversationStatus } from '@/realtime/types'
import type { CodexQueueInlinePanelMode } from '@/hooks/useCodexQueueInlinePanel'
import { useActiveWord } from '@/hooks/useActiveWord'
import { useActiveSuggestions } from '@/hooks/useActiveSuggestions'
import { applySuggestion } from '@/utils/applySuggestion'
import { usePlatform } from '@/hooks/usePlatform'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { isCodexFamilyFlavor } from '@/lib/agentFlavorUtils'
import { markSkillUsed } from '@/lib/recent-skills'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { StatusBar } from '@/components/AssistantChat/StatusBar'
import { ComposerButtons } from '@/components/AssistantChat/ComposerButtons'
import { AttachmentItem } from '@/components/AssistantChat/AttachmentItem'
import { useTranslation } from '@/lib/use-translation'

export interface TextInputState {
    text: string
    selection: { start: number; end: number }
}

export type CodexSendMode = 'direct' | 'queue'

type QueueEnqueuePayload = {
    text: string
    attachments?: AttachmentMetadata[]
}

const defaultSuggestionHandler = async (): Promise<Suggestion[]> => []
const COMPOSER_DRAFT_STORAGE_PREFIX = 'hapi:sessionComposerDraft:'

function getComposerDraftStorageKey(sessionId: string): string {
    return `${COMPOSER_DRAFT_STORAGE_PREFIX}${sessionId}`
}

function readComposerDraft(sessionId: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return localStorage.getItem(getComposerDraftStorageKey(sessionId))
    } catch {
        return null
    }
}

function writeComposerDraft(sessionId: string, text: string): void {
    if (typeof window === 'undefined') return
    try {
        const key = getComposerDraftStorageKey(sessionId)
        if (text.length === 0) {
            localStorage.removeItem(key)
            return
        }
        localStorage.setItem(key, text)
    } catch {
    }
}

type AttachmentMetadataEnvelope = {
    __attachmentMetadata?: AttachmentMetadata
}

function parseAttachmentMetadataFromAttachment(attachment: Attachment): AttachmentMetadata | null {
    const fromCompleteContent = (() => {
        if (attachment.status.type !== 'complete') return null
        const parts = attachment.content ?? []
        for (const part of parts) {
            if (part.type !== 'text') continue
            const textPart = (part as { text?: unknown }).text
            if (typeof textPart !== 'string') continue
            try {
                const parsed = JSON.parse(textPart) as AttachmentMetadataEnvelope
                const metadata = parsed.__attachmentMetadata
                if (!metadata || typeof metadata !== 'object') continue
                if (typeof metadata.path !== 'string' || metadata.path.length === 0) continue
                return metadata
            } catch {
                continue
            }
        }
        return null
    })()

    if (fromCompleteContent) {
        return fromCompleteContent
    }

    if (attachment.status.type !== 'requires-action') {
        return null
    }

    const path = (attachment as { path?: unknown }).path
    if (typeof path !== 'string' || path.length === 0) {
        return null
    }

    return {
        id: attachment.id,
        filename: attachment.name,
        mimeType: attachment.contentType ?? 'application/octet-stream',
        size: attachment.file?.size ?? 0,
        path,
        previewUrl: (attachment as { previewUrl?: unknown }).previewUrl as string | undefined
    }
}

export function HappyComposer(props: {
    sessionId: string
    disabled?: boolean
    permissionMode?: PermissionMode
    modelMode?: ModelMode
    active?: boolean
    allowSendWhenInactive?: boolean
    thinking?: boolean
    agentState?: AgentState | null
    contextSize?: number
    controlledByUser?: boolean
    agentFlavor?: string | null
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelModeChange?: (mode: ModelMode) => void
    onSwitchToRemote?: () => void
    onTerminal?: () => void
    onCodexStatus?: () => void
    codexSendMode?: CodexSendMode
    onCodexSendModeChange?: (mode: CodexSendMode) => void
    codexQueuePendingCount?: number
    codexQueueSummary?: CodexQueueSummary | null
    codexQueueEntries?: CodexQueueEntry[]
    codexQueueInlinePanelMode?: CodexQueueInlinePanelMode
    onCodexQueueOpen?: () => void
    onCodexQueueUpdated?: () => void
    onCodexQueueEnqueue?: (payload: QueueEnqueuePayload) => Promise<void>
    autocompletePrefixes?: string[]
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    // Voice assistant props
    voiceStatus?: ConversationStatus
    voiceMicMuted?: boolean
    onVoiceToggle?: () => void
    onVoiceMicToggle?: () => void
}) {
    const { t } = useTranslation()
    const {
        sessionId,
        disabled = false,
        permissionMode: rawPermissionMode,
        modelMode: rawModelMode,
        active = true,
        allowSendWhenInactive = false,
        thinking = false,
        agentState,
        contextSize,
        controlledByUser = false,
        agentFlavor,
        onPermissionModeChange,
        onModelModeChange,
        onSwitchToRemote,
        onTerminal,
        onCodexStatus,
        codexSendMode = 'direct',
        onCodexSendModeChange,
        codexQueuePendingCount = 0,
        codexQueueSummary = null,
        codexQueueEntries = [],
        codexQueueInlinePanelMode = 'compact',
        onCodexQueueOpen,
        onCodexQueueUpdated,
        onCodexQueueEnqueue,
        autocompletePrefixes = ['@', '/', '$'],
        autocompleteSuggestions = defaultSuggestionHandler,
        voiceStatus = 'disconnected',
        voiceMicMuted = false,
        onVoiceToggle,
        onVoiceMicToggle
    } = props

    // Use ?? so missing values fall back to default (destructuring defaults only handle undefined)
    const permissionMode = rawPermissionMode ?? 'default'
    const modelMode = rawModelMode ?? 'default'

    const api = useAssistantApi()
    const composerText = useAssistantState(({ composer }) => composer.text)
    const attachments = useAssistantState(({ composer }) => composer.attachments)
    const threadIsRunning = useAssistantState(({ thread }) => thread.isRunning)
    const threadIsDisabled = useAssistantState(({ thread }) => thread.isDisabled)

    const controlsDisabled = disabled || (!active && !allowSendWhenInactive) || threadIsDisabled
    const isCodexSession = agentFlavor === 'codex'
    const queueSendEnabled = isCodexSession && codexSendMode === 'queue'
    const showInlineQueuePanel = isCodexSession && codexQueueInlinePanelMode !== 'off'
    const inlineQueuePendingCount = Math.max(0, codexQueueSummary?.pendingCount ?? codexQueuePendingCount)
    const inlineQueueInQueue = codexQueueSummary?.inQueue ?? false
    const inlineQueueTaskRunning = codexQueueSummary?.taskRunning ?? false
    const inlineQueueNextPreview = codexQueueSummary?.nextPreview?.trim() ?? ''
    const inlineQueueHeadline = useMemo(() => {
        if (inlineQueueNextPreview.length > 0) {
            return `${t('codexQueue.inline.next')}: ${inlineQueueNextPreview}`
        }
        const firstEntryPreview = codexQueueEntries[0]?.preview?.trim()
        if (firstEntryPreview) {
            return `${t('codexQueue.inline.next')}: ${firstEntryPreview}`
        }
        if (inlineQueuePendingCount > 0) {
            return t('codexQueue.inline.pending', { count: inlineQueuePendingCount })
        }
        return t('codexQueue.inline.empty')
    }, [inlineQueueNextPreview, codexQueueEntries, inlineQueuePendingCount, t])
    const trimmed = composerText.trim()
    const hasText = trimmed.length > 0
    const hasAttachments = attachments.length > 0
    const attachmentsReady = !hasAttachments || attachments.every((attachment) => {
        if (attachment.status.type === 'complete') {
            return true
        }
        if (attachment.status.type !== 'requires-action') {
            return false
        }
        const path = (attachment as { path?: string }).path
        return typeof path === 'string' && path.length > 0
    })
    const canSendBase = (hasText || hasAttachments) && attachmentsReady && !controlsDisabled
    const canSend = canSendBase && (!threadIsRunning || queueSendEnabled)
    const queueAttachments = useMemo(
        () => attachments
            .map(parseAttachmentMetadataFromAttachment)
            .filter((metadata): metadata is AttachmentMetadata => metadata !== null),
        [attachments]
    )

    const [inputState, setInputState] = useState<TextInputState>({
        text: '',
        selection: { start: 0, end: 0 }
    })
    const [showSettings, setShowSettings] = useState(false)
    const [isAborting, setIsAborting] = useState(false)
    const [isSwitching, setIsSwitching] = useState(false)
    const [showContinueHint, setShowContinueHint] = useState(false)

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const prevControlledByUser = useRef(controlledByUser)
    const pendingDraftRestoreRef = useRef<{ sessionId: string; text: string } | null>(null)

    useEffect(() => {
        const restoredDraft = readComposerDraft(sessionId) ?? ''
        pendingDraftRestoreRef.current = { sessionId, text: restoredDraft }

        if (composerText !== restoredDraft) {
            api.composer().setText(restoredDraft)
        }
    }, [api, sessionId])

    useEffect(() => {
        const pendingRestore = pendingDraftRestoreRef.current
        if (pendingRestore && pendingRestore.sessionId === sessionId) {
            if (composerText !== pendingRestore.text) {
                return
            }
            pendingDraftRestoreRef.current = null
        }
        writeComposerDraft(sessionId, composerText)
    }, [sessionId, composerText])

    useEffect(() => {
        setInputState((prev) => {
            if (prev.text === composerText) return prev
            // When syncing from composerText, update selection to end of text
            // This ensures activeWord detection works correctly
            const newPos = composerText.length
            return { text: composerText, selection: { start: newPos, end: newPos } }
        })
    }, [composerText])

    // Track one-time "continue" hint after switching from local to remote.
    useEffect(() => {
        if (prevControlledByUser.current === true && controlledByUser === false) {
            setShowContinueHint(true)
        }
        if (controlledByUser) {
            setShowContinueHint(false)
        }
        prevControlledByUser.current = controlledByUser
    }, [controlledByUser])

    const { haptic: platformHaptic, isTouch } = usePlatform()
    const { isStandalone, isIOS } = usePWAInstall()
    const isIOSPWA = isIOS && isStandalone
    const bottomPaddingClass = isIOSPWA ? 'pb-0' : 'pb-3'
    const activeWord = useActiveWord(inputState.text, inputState.selection, autocompletePrefixes)
    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeWord,
        autocompleteSuggestions,
        { clampSelection: true, wrapAround: true }
    )

    const haptic = useCallback((type: 'light' | 'success' | 'error' = 'light') => {
        if (type === 'light') {
            platformHaptic.impact('light')
        } else if (type === 'success') {
            platformHaptic.notification('success')
        } else {
            platformHaptic.notification('error')
        }
    }, [platformHaptic])

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (!suggestion || !textareaRef.current) return
        if (suggestion.text.startsWith('$')) {
            markSkillUsed(suggestion.text.slice(1))
        }

        // For Codex user prompts with content, expand the content instead of command name
        let textToInsert = suggestion.text
        let addSpace = true
        if (agentFlavor === 'codex' && suggestion.source === 'user' && suggestion.content) {
            textToInsert = suggestion.content
            addSpace = false
        }

        const result = applySuggestion(
            inputState.text,
            inputState.selection,
            textToInsert,
            autocompletePrefixes,
            addSpace
        )

        api.composer().setText(result.text)
        setInputState({
            text: result.text,
            selection: { start: result.cursorPosition, end: result.cursorPosition }
        })

        setTimeout(() => {
            const el = textareaRef.current
            if (!el) return
            el.setSelectionRange(result.cursorPosition, result.cursorPosition)
            try {
                el.focus({ preventScroll: true })
            } catch {
                el.focus()
            }
        }, 0)

        haptic('light')
    }, [api, suggestions, inputState, autocompletePrefixes, haptic, agentFlavor])

    const abortDisabled = controlsDisabled || isAborting || !threadIsRunning
    const switchDisabled = controlsDisabled || isSwitching || !controlledByUser
    const showSwitchButton = Boolean(controlledByUser && onSwitchToRemote)
    const showTerminalButton = Boolean(onTerminal)
    const showStatusButton = Boolean(agentFlavor === 'codex' && onCodexStatus)
    const showQueueButton = Boolean(isCodexSession && onCodexQueueOpen)

    useEffect(() => {
        if (!isAborting) return
        if (threadIsRunning) return
        setIsAborting(false)
    }, [isAborting, threadIsRunning])

    useEffect(() => {
        if (!isSwitching) return
        if (controlledByUser) return
        setIsSwitching(false)
    }, [isSwitching, controlledByUser])

    const handleAbort = useCallback(() => {
        if (abortDisabled) return
        haptic('error')
        setIsAborting(true)
        api.thread().cancelRun()
    }, [abortDisabled, api, haptic])

    const handleSwitch = useCallback(async () => {
        if (switchDisabled || !onSwitchToRemote) return
        haptic('light')
        setIsSwitching(true)
        try {
            await onSwitchToRemote()
        } catch {
            setIsSwitching(false)
        }
    }, [switchDisabled, onSwitchToRemote, haptic])

    const handleCodexStatus = useCallback(() => {
        if (controlsDisabled || threadIsRunning || !onCodexStatus) return
        haptic('light')
        onCodexStatus()
    }, [controlsDisabled, threadIsRunning, onCodexStatus, haptic])

    const handleCodexQueueOpen = useCallback(() => {
        if (controlsDisabled || !onCodexQueueOpen) return
        haptic('light')
        onCodexQueueOpen()
    }, [controlsDisabled, onCodexQueueOpen, haptic])

    const handleCodexSendModeChange = useCallback((nextMode: CodexSendMode) => {
        if (!onCodexSendModeChange || controlsDisabled || codexSendMode === nextMode) {
            return
        }
        onCodexSendModeChange(nextMode)
        haptic('light')
    }, [onCodexSendModeChange, controlsDisabled, codexSendMode, haptic])

    const shouldEnqueueWithoutImmediateChat = queueSendEnabled
        && Boolean(onCodexQueueEnqueue)
        && (trimmed.length > 0 || queueAttachments.length > 0)

    const sendComposerNow = useCallback(async () => {
        if (!canSend) {
            return
        }

        if (shouldEnqueueWithoutImmediateChat && onCodexQueueEnqueue) {
            if (hasAttachments && queueAttachments.length < attachments.length) {
                haptic('error')
                return
            }
            try {
                await onCodexQueueEnqueue({
                    text: trimmed,
                    attachments: queueAttachments.length > 0 ? queueAttachments : undefined
                })
                await api.composer().clearAttachments()
                api.composer().setText('')
                onCodexQueueUpdated?.()
                return
            } catch {
                haptic('error')
                return
            }
        }

        api.composer().send()
        if (queueSendEnabled && threadIsRunning) {
            onCodexQueueUpdated?.()
        }
    }, [
        canSend,
        api,
        queueSendEnabled,
        threadIsRunning,
        onCodexQueueUpdated,
        onCodexQueueEnqueue,
        shouldEnqueueWithoutImmediateChat,
        queueAttachments,
        hasAttachments,
        attachments.length,
        trimmed,
        haptic
    ])

    const permissionModeOptions = useMemo(
        () => getPermissionModeOptionsForFlavor(agentFlavor),
        [agentFlavor]
    )
    const permissionModes = useMemo(
        () => permissionModeOptions.map((option) => option.mode),
        [permissionModeOptions]
    )

    const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        const key = e.key

        // Avoid intercepting IME composition keystrokes (Enter, arrows, etc.)
        if (e.nativeEvent.isComposing) {
            return
        }

        if (suggestions.length > 0) {
            if (key === 'ArrowUp') {
                e.preventDefault()
                moveUp()
                return
            }
            if (key === 'ArrowDown') {
                e.preventDefault()
                moveDown()
                return
            }
            if ((key === 'Enter' || key === 'Tab') && !e.shiftKey) {
                e.preventDefault()
                const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0
                handleSuggestionSelect(indexToSelect)
                return
            }
            if (key === 'Escape') {
                e.preventDefault()
                clearSuggestions()
                return
            }
        }

        if (key === 'Escape' && threadIsRunning) {
            e.preventDefault()
            handleAbort()
            return
        }

        if (key === 'Enter' && !e.shiftKey && queueSendEnabled && canSend) {
            e.preventDefault()
            void sendComposerNow()
            return
        }

        if (key === 'Tab' && e.shiftKey && onPermissionModeChange && permissionModes.length > 0) {
            e.preventDefault()
            const currentIndex = permissionModes.indexOf(permissionMode)
            const nextIndex = (currentIndex + 1) % permissionModes.length
            const nextMode = permissionModes[nextIndex] ?? 'default'
            onPermissionModeChange(nextMode)
            haptic('light')
        }
    }, [
        suggestions,
        selectedIndex,
        moveUp,
        moveDown,
        clearSuggestions,
        handleSuggestionSelect,
        handleAbort,
        queueSendEnabled,
        canSend,
        sendComposerNow,
        onPermissionModeChange,
        permissionMode,
        permissionModes,
        haptic
    ])

    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'm' && (e.metaKey || e.ctrlKey) && onModelModeChange && !isCodexFamilyFlavor(agentFlavor)) {
                e.preventDefault()
                const currentIndex = MODEL_MODES.indexOf(modelMode as typeof MODEL_MODES[number])
                const nextIndex = (currentIndex + 1) % MODEL_MODES.length
                onModelModeChange(MODEL_MODES[nextIndex])
                haptic('light')
            }
        }

        window.addEventListener('keydown', handleGlobalKeyDown)
        return () => window.removeEventListener('keydown', handleGlobalKeyDown)
    }, [modelMode, onModelModeChange, haptic, agentFlavor])

    const handleChange = useCallback((e: ReactChangeEvent<HTMLTextAreaElement>) => {
        const selection = {
            start: e.target.selectionStart,
            end: e.target.selectionEnd
        }
        setInputState({ text: e.target.value, selection })
    }, [])

    const handleSelect = useCallback((e: ReactSyntheticEvent<HTMLTextAreaElement>) => {
        const target = e.target as HTMLTextAreaElement
        setInputState(prev => ({
            ...prev,
            selection: { start: target.selectionStart, end: target.selectionEnd }
        }))
    }, [])

    const handlePaste = useCallback(async (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(e.clipboardData?.files || [])
        const imageFiles = files.filter(file => file.type.startsWith('image/'))

        if (imageFiles.length === 0) return

        e.preventDefault()

        try {
            for (const file of imageFiles) {
                await api.composer().addAttachment(file)
            }
        } catch (error) {
            console.error('Error adding pasted image:', error)
        }
    }, [api])

    const handleSettingsToggle = useCallback(() => {
        haptic('light')
        setShowSettings(prev => !prev)
    }, [haptic])

    const handleSubmit = useCallback((event?: ReactFormEvent<HTMLFormElement>) => {
        if (event && queueSendEnabled && canSend) {
            event.preventDefault()
            void sendComposerNow()
            setShowContinueHint(false)
            return
        }

        if (event && !attachmentsReady) {
            event.preventDefault()
            return
        }
        setShowContinueHint(false)
    }, [attachmentsReady, queueSendEnabled, canSend, sendComposerNow])

    const handlePermissionChange = useCallback((mode: PermissionMode) => {
        if (!onPermissionModeChange || controlsDisabled) return
        onPermissionModeChange(mode)
        setShowSettings(false)
        haptic('light')
    }, [onPermissionModeChange, controlsDisabled, haptic])

    const handleModelChange = useCallback((mode: ModelMode) => {
        if (!onModelModeChange || controlsDisabled) return
        onModelModeChange(mode)
        setShowSettings(false)
        haptic('light')
    }, [onModelModeChange, controlsDisabled, haptic])

    const showPermissionSettings = Boolean(onPermissionModeChange && permissionModeOptions.length > 0)
    const showModelSettings = Boolean(onModelModeChange && !isCodexFamilyFlavor(agentFlavor))
    const showSettingsButton = Boolean(showPermissionSettings || showModelSettings)
    const showAbortButton = true
    const voiceEnabled = Boolean(onVoiceToggle)

    const overlays = useMemo(() => {
        if (showSettings && (showPermissionSettings || showModelSettings)) {
            return (
                <div className="absolute bottom-[100%] mb-2 w-full">
                    <FloatingOverlay maxHeight={320}>
                        {showPermissionSettings ? (
                            <div className="py-2">
                                <div className="px-3 pb-1 text-xs font-semibold text-[var(--app-hint)]">
                                    {t('misc.permissionMode')}
                                </div>
                                {permissionModeOptions.map((option) => (
                                    <button
                                        key={option.mode}
                                        type="button"
                                        disabled={controlsDisabled}
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                            controlsDisabled
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'cursor-pointer hover:bg-[var(--app-secondary-bg)]'
                                        }`}
                                        onClick={() => handlePermissionChange(option.mode)}
                                        onMouseDown={(e) => e.preventDefault()}
                                    >
                                        <div
                                            className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                                permissionMode === option.mode
                                                    ? 'border-[var(--app-link)]'
                                                    : 'border-[var(--app-hint)]'
                                            }`}
                                        >
                                            {permissionMode === option.mode && (
                                                <div className="h-2 w-2 rounded-full bg-[var(--app-link)]" />
                                            )}
                                        </div>
                                        <span className={permissionMode === option.mode ? 'text-[var(--app-link)]' : ''}>
                                            {option.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {showPermissionSettings && showModelSettings ? (
                            <div className="mx-3 h-px bg-[var(--app-divider)]" />
                        ) : null}

                        {showModelSettings ? (
                            <div className="py-2">
                                <div className="px-3 pb-1 text-xs font-semibold text-[var(--app-hint)]">
                                    {t('misc.model')}
                                </div>
                                {MODEL_MODES.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        disabled={controlsDisabled}
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                            controlsDisabled
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'cursor-pointer hover:bg-[var(--app-secondary-bg)]'
                                        }`}
                                        onClick={() => handleModelChange(mode)}
                                        onMouseDown={(e) => e.preventDefault()}
                                    >
                                        <div
                                            className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                                modelMode === mode
                                                    ? 'border-[var(--app-link)]'
                                                    : 'border-[var(--app-hint)]'
                                            }`}
                                        >
                                            {modelMode === mode && (
                                                <div className="h-2 w-2 rounded-full bg-[var(--app-link)]" />
                                            )}
                                        </div>
                                        <span className={modelMode === mode ? 'text-[var(--app-link)]' : ''}>
                                            {MODEL_MODE_LABELS[mode]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </FloatingOverlay>
                </div>
            )
        }

        if (suggestions.length > 0) {
            return (
                <div className="absolute bottom-[100%] mb-2 w-full">
                    <FloatingOverlay>
                        <Autocomplete
                            suggestions={suggestions}
                            selectedIndex={selectedIndex}
                            onSelect={(index) => handleSuggestionSelect(index)}
                        />
                    </FloatingOverlay>
                </div>
            )
        }

        return null
    }, [
        showSettings,
        showPermissionSettings,
        showModelSettings,
        suggestions,
        selectedIndex,
        controlsDisabled,
        permissionMode,
        modelMode,
        permissionModeOptions,
        handlePermissionChange,
        handleModelChange,
        handleSuggestionSelect
    ])

    return (
        <div className={`px-3 ${bottomPaddingClass} pt-2 bg-[var(--app-bg)]`}>
            <div className="mx-auto w-full max-w-content">
                <ComposerPrimitive.Root className="relative" onSubmit={handleSubmit}>
                    {overlays}

                    <StatusBar
                        active={active}
                        thinking={thinking}
                        agentState={agentState}
                        contextSize={contextSize}
                        modelMode={modelMode}
                        permissionMode={permissionMode}
                        agentFlavor={agentFlavor}
                        voiceStatus={voiceStatus}
                    />

                    <div className="overflow-hidden rounded-[20px] bg-[var(--app-secondary-bg)]">
                        {showInlineQueuePanel ? (
                            <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('codexQueue.dialog.title')}
                                    </span>
                                    <span className="inline-flex rounded-full bg-[var(--app-secondary-bg)] px-2 py-0.5 text-xs text-[var(--app-fg)]">
                                        {t('codexQueue.inline.pending', { count: inlineQueuePendingCount })}
                                    </span>
                                    {inlineQueueTaskRunning ? (
                                        <span className="inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">
                                            {t('codexQueue.inline.running')}
                                        </span>
                                    ) : null}
                                    {inlineQueueInQueue ? (
                                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                                            {t('codexQueue.summary.inQueue')}
                                        </span>
                                    ) : null}
                                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">
                                        {inlineQueueHeadline}
                                    </span>
                                    <button
                                        type="button"
                                        className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={handleCodexQueueOpen}
                                        disabled={controlsDisabled || !onCodexQueueOpen}
                                    >
                                        {t('codexQueue.inline.open')}
                                    </button>
                                </div>

                                {codexQueueInlinePanelMode === 'full' ? (
                                    <div className="mt-2 space-y-1">
                                        {codexQueueEntries.length > 0 ? (
                                            <>
                                                {codexQueueEntries.slice(0, 5).map((entry, index) => (
                                                    <div
                                                        key={entry.id}
                                                        className="flex items-center gap-2 rounded-md bg-[var(--app-secondary-bg)] px-2 py-1.5"
                                                    >
                                                        <span className="text-[10px] text-[var(--app-hint)]">
                                                            #{index + 1}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-fg)]">
                                                            {entry.preview || t('codexQueue.dialog.emptyMessage')}
                                                        </span>
                                                        <span className="shrink-0 text-[10px] text-[var(--app-hint)]">
                                                            {new Date(entry.enqueuedAt).toLocaleTimeString([], {
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                ))}
                                                {codexQueueEntries.length > 5 ? (
                                                    <div className="px-1 text-[11px] text-[var(--app-hint)]">
                                                        +{codexQueueEntries.length - 5}
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : inlineQueuePendingCount > 0 ? (
                                            <div className="px-1 text-xs text-[var(--app-hint)]">
                                                {t('codexQueue.inline.pending', { count: inlineQueuePendingCount })}
                                            </div>
                                        ) : (
                                            <div className="px-1 text-xs text-[var(--app-hint)]">
                                                {t('codexQueue.dialog.empty')}
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {attachments.length > 0 ? (
                            <div className="flex flex-wrap gap-2 px-4 pt-3">
                                <ComposerPrimitive.Attachments components={{ Attachment: AttachmentItem }} />
                            </div>
                        ) : null}

                        <div className="flex items-center px-4 py-3">
                            <ComposerPrimitive.Input
                                ref={textareaRef}
                                autoFocus={!controlsDisabled && !isTouch}
                                placeholder={showContinueHint ? t('misc.typeMessage') : t('misc.typeAMessage')}
                                disabled={controlsDisabled}
                                maxRows={5}
                                submitOnEnter={!isTouch}
                                cancelOnEscape={false}
                                onChange={handleChange}
                                onSelect={handleSelect}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                className="flex-1 resize-none bg-transparent text-base leading-snug text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        <ComposerButtons
                            canSend={canSend}
                            controlsDisabled={controlsDisabled}
                            showSettingsButton={showSettingsButton}
                            onSettingsToggle={handleSettingsToggle}
                            showTerminalButton={showTerminalButton}
                            terminalDisabled={controlsDisabled}
                            onTerminal={onTerminal ?? (() => {})}
                            showStatusButton={showStatusButton}
                            statusDisabled={controlsDisabled || threadIsRunning}
                            onStatus={handleCodexStatus}
                            showQueueButton={showQueueButton}
                            queueDisabled={controlsDisabled}
                            queuePendingCount={Math.max(0, codexQueuePendingCount)}
                            onQueue={handleCodexQueueOpen}
                            showSendModeToggle={isCodexSession}
                            sendMode={codexSendMode}
                            sendModeDisabled={controlsDisabled || !onCodexSendModeChange}
                            onSendModeChange={handleCodexSendModeChange}
                            showAbortButton={showAbortButton}
                            abortDisabled={abortDisabled}
                            isAborting={isAborting}
                            onAbort={handleAbort}
                            showSwitchButton={showSwitchButton}
                            switchDisabled={switchDisabled}
                            isSwitching={isSwitching}
                            onSwitch={handleSwitch}
                            voiceEnabled={voiceEnabled}
                            voiceStatus={voiceStatus}
                            voiceMicMuted={voiceMicMuted}
                            onVoiceToggle={onVoiceToggle ?? (() => {})}
                            onVoiceMicToggle={onVoiceMicToggle}
                            onSend={() => { void sendComposerNow() }}
                        />
                    </div>
                </ComposerPrimitive.Root>
            </div>
        </div>
    )
}
