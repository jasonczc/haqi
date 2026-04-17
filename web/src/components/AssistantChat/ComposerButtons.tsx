import { ComposerPrimitive } from '@assistant-ui/react'
import type { ConversationStatus } from '@/realtime/types'
import { useTranslation } from '@/lib/use-translation'
import { ComposerIconButton } from '@/components/AssistantChat/ComposerIconButton'

function VoiceAssistantIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* 三条声波线，代表语音助手的输出 */}
            <path d="M12 6v12" />
            <path d="M8 9v6" />
            <path d="M16 9v6" />
            <path d="M4 11v2" />
            <path d="M20 11v2" />
        </svg>
    )
}

function SpeakerIcon(props: { muted?: boolean }) {
    if (props.muted) {
        // Speaker with X (muted)
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
        )
    }

    // Speaker with sound waves
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
    )
}

function SettingsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

function SwitchToRemoteIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
    )
}

function TerminalIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
            <polyline points="7 9 10 12 7 15" />
            <line x1="12" y1="15" x2="17" y2="15" />
        </svg>
    )
}

function StatusIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
        </svg>
    )
}

function QueueIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="16" y2="12" />
            <line x1="4" y1="18" x2="12" y2="18" />
            <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
    )
}

function AttachmentIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
        </svg>
    )
}

function AbortIcon(props: { spinning: boolean }) {
    if (props.spinning) {
        return (
            <svg
                className="animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
            </svg>
        )
    }

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="currentColor"
        >
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4-2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-4Z" />
        </svg>
    )
}

function SendIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
        </svg>
    )
}

function StopIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    )
}

function LoadingIcon() {
    return (
        <svg
            className="animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
        </svg>
    )
}

function UnifiedButton(props: {
    canSend: boolean
    voiceStatus: ConversationStatus
    voiceEnabled: boolean
    controlsDisabled: boolean
    onSend: () => void
    onVoiceToggle: () => void
}) {
    const { t } = useTranslation()

    // Determine button state
    const isConnecting = props.voiceStatus === 'connecting'
    const isConnected = props.voiceStatus === 'connected'
    const isVoiceActive = isConnecting || isConnected
    const hasText = props.canSend

    // Determine button behavior
    const handleClick = () => {
        if (isVoiceActive) {
            props.onVoiceToggle() // Stop voice
        } else if (hasText) {
            props.onSend() // Send message
        } else if (props.voiceEnabled) {
            props.onVoiceToggle() // Start voice
        }
    }

    // Determine button style and icon
    let icon: React.ReactNode
    let className: string
    let ariaLabel: string

    if (isConnecting) {
        icon = <LoadingIcon />
        className = 'bg-black text-white'
        ariaLabel = t('voice.connecting')
    } else if (isConnected) {
        icon = <StopIcon />
        className = 'bg-black text-white'
        ariaLabel = t('composer.stop')
    } else if (hasText) {
        icon = <SendIcon />
        className = 'bg-black text-white'
        ariaLabel = t('composer.send')
    } else if (props.voiceEnabled) {
        icon = <VoiceAssistantIcon />
        className = 'bg-black text-white'
        ariaLabel = t('composer.voice')
    } else {
        icon = <SendIcon />
        className = 'bg-[var(--cursor-bg-quaternary)] text-[var(--cursor-text-secondary)]'
        ariaLabel = t('composer.send')
    }

    const isDisabled = props.controlsDisabled || (!hasText && !props.voiceEnabled && !isVoiceActive)

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            aria-label={ariaLabel}
            title={ariaLabel}
            className={`composer-send-btn flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
            {icon}
        </button>
    )
}

export function ComposerButtons(props: {
    canSend: boolean
    controlsDisabled: boolean
    showSettingsButton: boolean
    onSettingsToggle: () => void
    showTerminalButton: boolean
    terminalDisabled: boolean
    onTerminal: () => void
    showStatusButton: boolean
    statusDisabled: boolean
    onStatus: () => void
    showQueueButton: boolean
    queueActive: boolean
    queueDisabled: boolean
    queuePendingCount: number
    onQueue: () => void
    showPlanModeToggle: boolean
    planModeEnabled: boolean
    planModeDisabled: boolean
    onPlanModeToggle: () => void
    showSendModeToggle: boolean
    sendMode: 'direct' | 'queue'
    sendModeDisabled: boolean
    onSendModeChange: (mode: 'direct' | 'queue') => void
    showAbortButton: boolean
    abortDisabled: boolean
    isAborting: boolean
    onAbort: () => void
    showSwitchButton: boolean
    switchDisabled: boolean
    isSwitching: boolean
    onSwitch: () => void
    voiceEnabled: boolean
    voiceStatus: ConversationStatus
    voiceMicMuted?: boolean
    onVoiceToggle: () => void
    onVoiceMicToggle?: () => void
    onSend: () => void
}) {
    const { t } = useTranslation()
    const isVoiceConnected = props.voiceStatus === 'connected'

    return (
        <div
            className="chat-input-footer flex items-center justify-between gap-2"
            style={{ marginTop: '4px' }}
        >
            <div className="footer-left chat-input-tools flex items-center gap-1">
                <ComposerPrimitive.AddAttachment
                    aria-label={t('composer.attach')}
                    title={t('composer.attach')}
                    disabled={props.controlsDisabled}
                    className="composer-icon-btn composer-attachment-btn flex h-8 w-8 items-center justify-center rounded-full text-[var(--cursor-text-secondary)] transition-colors hover:bg-[var(--cursor-bg-card)] hover:text-[var(--cursor-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <AttachmentIcon />
                </ComposerPrimitive.AddAttachment>

                {props.showSettingsButton ? (
                    <ComposerIconButton
                        icon={<SettingsIcon />}
                        onClick={props.onSettingsToggle}
                        disabled={props.controlsDisabled}
                        title={t('composer.settings')}
                        aria-label={t('composer.settings')}
                        className="settings-button composer-settings-btn"
                    />
                ) : null}

                {props.showTerminalButton ? (
                    <ComposerIconButton
                        icon={<TerminalIcon />}
                        tone="success"
                        onClick={props.onTerminal}
                        disabled={props.terminalDisabled}
                        title={t('composer.terminal')}
                        aria-label={t('composer.terminal')}
                        className="composer-terminal-btn"
                    />
                ) : null}

                {props.showStatusButton ? (
                    <ComposerIconButton
                        icon={<StatusIcon />}
                        tone="accent"
                        onClick={props.onStatus}
                        disabled={props.statusDisabled}
                        title={t('composer.status')}
                        aria-label={t('composer.status')}
                        className="composer-status-btn"
                    />
                ) : null}

                {props.showQueueButton ? (
                    <ComposerIconButton
                        icon={<QueueIcon />}
                        tone="accent"
                        active={props.queueActive}
                        onClick={props.onQueue}
                        disabled={props.queueDisabled}
                        title={t('composer.queue')}
                        aria-label={t('composer.queue')}
                        className="composer-queue-btn"
                        badge={props.queuePendingCount > 0 ? (
                            <span className="absolute -right-0.5 -top-0.5 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--font-size-xs)] font-semibold leading-4 text-white" style={{ minWidth: '16px' }}>
                                {props.queuePendingCount > 99 ? '99+' : props.queuePendingCount}
                            </span>
                        ) : null}
                    />
                ) : null}

                {props.showAbortButton ? (
                    <ComposerIconButton
                        icon={<AbortIcon spinning={props.isAborting} />}
                        tone="danger"
                        onClick={props.onAbort}
                        disabled={props.abortDisabled}
                        title={t('composer.abort')}
                        aria-label={t('composer.abort')}
                        className="composer-abort-btn"
                    />
                ) : null}

                {props.showSwitchButton ? (
                    <ComposerIconButton
                        icon={<SwitchToRemoteIcon />}
                        tone="accent"
                        onClick={props.onSwitch}
                        disabled={props.switchDisabled}
                        title={t('composer.switchRemote')}
                        aria-label={t('composer.switchRemote')}
                        className="composer-switch-btn"
                    />
                ) : null}

                {isVoiceConnected && props.onVoiceMicToggle ? (
                    <ComposerIconButton
                        icon={<SpeakerIcon muted={props.voiceMicMuted} />}
                        active={props.voiceMicMuted}
                        onClick={props.onVoiceMicToggle}
                        title={props.voiceMicMuted ? t('voice.unmute') : t('voice.mute')}
                        aria-label={props.voiceMicMuted ? t('voice.unmute') : t('voice.mute')}
                        className="composer-voice-btn"
                    />
                ) : null}
            </div>

            <div
                className="footer-right chat-input-actions flex items-center gap-1.5"
                title={props.sendMode === 'queue' ? t('queue.mode.queueHint') : t('queue.mode.directHint')}
            >
                {props.showPlanModeToggle ? (
                    <button
                        type="button"
                        onClick={props.onPlanModeToggle}
                        disabled={props.planModeDisabled}
                        data-active={props.planModeEnabled ? '' : undefined}
                        className="mode-chip composer-chip hover:bg-[var(--cursor-bg-hover)]"
                        style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--text-secondary)',
                            background: 'transparent',
                            border: 'none',
                            padding: '2px 6px',
                            borderRadius: '4px',
                        }}
                        title={props.planModeEnabled ? t('queue.mode.planEnabledHint') : t('queue.mode.planDisabledHint')}
                        aria-label={props.planModeEnabled ? t('queue.mode.planEnabledHint') : t('queue.mode.planDisabledHint')}
                        aria-pressed={props.planModeEnabled}
                    >
                        {t('queue.mode.plan')}
                    </button>
                ) : null}

                {props.showSendModeToggle ? (
                    <button
                        type="button"
                        onClick={() => props.onSendModeChange(props.sendMode === 'queue' ? 'direct' : 'queue')}
                        disabled={props.sendModeDisabled}
                        data-active={props.sendMode === 'queue' ? '' : undefined}
                        className="mode-chip composer-chip hover:bg-[var(--cursor-bg-hover)]"
                        style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--text-secondary)',
                            background: 'transparent',
                            border: 'none',
                            padding: '2px 6px',
                            borderRadius: '4px',
                        }}
                        title={props.sendMode === 'queue' ? t('queue.mode.queueHint') : t('queue.mode.directHint')}
                        aria-label={props.sendMode === 'queue' ? t('queue.mode.queueHint') : t('queue.mode.directHint')}
                    >
                        {props.sendMode === 'queue' ? t('queue.mode.queue') : t('queue.mode.direct')}
                    </button>
                ) : null}

                <UnifiedButton
                    canSend={props.canSend}
                    voiceStatus={props.voiceStatus}
                    voiceEnabled={props.voiceEnabled}
                    controlsDisabled={props.controlsDisabled}
                    onSend={props.onSend}
                    onVoiceToggle={props.onVoiceToggle}
                />
            </div>
        </div>
    )
}
