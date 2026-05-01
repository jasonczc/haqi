import { useEffect, useRef } from 'react'
import { ThreadPrimitive, useAssistantState } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { AgentState, PermissionMode, SessionMetadataSummary } from '@/types/api'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { useSessionViewportScroll } from '@/components/AssistantChat/useSessionViewportScroll'
import { Spinner } from '@/components/Spinner'
import type { SessionListDensity } from '@/hooks/useSessionListDensity'
import { useTranslation } from '@/lib/use-translation'

function NewMessagesIndicator(props: { count: number; show: boolean; onClick: () => void }) {
    const { t } = useTranslation()
    if (!props.show) {
        return null
    }

    return (
        <button
            onClick={props.onClick}
            className="new-messages-indicator absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--cursor-button)] px-3.5 py-1.5 text-sm font-medium text-[var(--cursor-button-text)]"
            style={{ bottom: 'calc(var(--chat-composer-clearance, 144px) + 16px)' }}
        >
            {props.count > 0 ? t('misc.newMessage', { n: props.count }) : t('misc.jumpToLatest')}
            <span aria-hidden className="ml-1 inline-block">↓</span>
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-7' },
        { align: 'start', width: 'w-3/4', height: 'h-8' },
        { align: 'end', width: 'w-1/2', height: 'h-6' },
        { align: 'start', width: 'w-5/6', height: 'h-9' }
    ]

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="space-y-3">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`skeleton ${row.height} ${row.width} rounded-[10px]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}

function HistoryLoadMoreControl(props: { loading: boolean; hasMore: boolean; onLoadMore: () => void }) {
    const { t } = useTranslation()

    if (!props.loading && !props.hasMore) {
        return null
    }

    const controlClass = 'mx-auto inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs shadow-sm'

    if (props.loading) {
        return (
            <div className="mb-2 py-1">
                <div
                    role="status"
                    aria-live="polite"
                    className={`${controlClass} border border-transparent bg-[var(--cursor-button)] text-[var(--cursor-button-text)]`}
                >
                    <Spinner size="sm" label={null} className="text-current" />
                    {t('misc.loadingHistory')}
                </div>
            </div>
        )
    }

    return (
        <div className="mb-2 py-1">
            <button
                type="button"
                onClick={props.onLoadMore}
                className={`${controlClass} border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-quiet)] text-[var(--cursor-text-primary)] transition-colors hover:bg-[var(--cursor-bg-hover)]`}
            >
                {t('misc.loadOlder')}
            </button>
        </div>
    )
}

function ThreadMessagesList() {
    const messages = useAssistantState(({ thread }) => thread.messages)
    if (messages.length === 0) {
        return null
    }

    return messages.map((message, index) => (
        <ThreadPrimitive.MessageByIndex
            key={message.id}
            index={index}
            components={THREAD_MESSAGE_COMPONENTS}
        />
    ))
}

const THREAD_MESSAGE_COMPONENTS = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage
} as const

export function HappyThread(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    agentState?: AgentState | null
    permissionMode?: PermissionMode
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    isLoadingMessages: boolean
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => Promise<unknown>
    pendingCount: number
    newestMessageSeq: number | null
    messagesVersion: number
    forceScrollToken: number
    density: SessionListDensity
}) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const {
        isNearBottom,
        showJumpToLatest,
        scrollToBottom,
        loadOlderPreservingViewport
    } = useSessionViewportScroll({
        sessionId: props.sessionId,
        viewMode: 'normal',
        viewportRef,
        isLoading: props.isLoadingMessages,
        hasMore: props.hasMoreMessages,
        isLoadingMore: props.isLoadingMoreMessages,
        pendingCount: props.pendingCount,
        contentVersion: props.messagesVersion,
        latestKey: props.newestMessageSeq !== null ? String(props.newestMessageSeq) : null,
        forceScrollToken: props.forceScrollToken,
        onLoadMore: props.onLoadMore,
        onFlushPending: props.onFlushPending
    })

    useEffect(() => {
        props.onAtBottomChange(isNearBottom)
    }, [isNearBottom, props.onAtBottomChange])

    const showSkeleton = props.isLoadingMessages && props.messagesVersion === 0 && props.pendingCount === 0

    return (
        <HappyChatProvider value={{
            api: props.api,
            sessionId: props.sessionId,
            metadata: props.metadata,
            agentState: props.agentState,
            permissionMode: props.permissionMode,
            disabled: props.disabled,
            density: props.density,
            onRefresh: props.onRefresh,
            onRetryMessage: props.onRetryMessage
        }}>
            <ThreadPrimitive.Root
                className="chat-timeline relative flex min-h-0 min-w-0 w-full flex-1 flex-col"
                style={{ background: 'var(--chrome)' }}
            >
                <ThreadPrimitive.Viewport
                    ref={viewportRef}
                    className="chat-timeline-viewport app-scrollbar min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden"
                >
                    <div
                        className="chat-timeline-inner mx-auto w-full min-w-0"
                        style={{
                            maxWidth: 'var(--chat-content-max)',
                            padding: `var(--chat-timeline-padding-y) var(--chat-timeline-padding-x)`,
                        }}
                    >
                        {showSkeleton ? (
                            <MessageSkeleton />
                        ) : (
                            <>
                                <HistoryLoadMoreControl
                                    loading={props.isLoadingMoreMessages}
                                    hasMore={props.hasMoreMessages}
                                    onLoadMore={loadOlderPreservingViewport}
                                />

                                {props.messagesWarning ? (
                                    <div className="mb-3 rounded-md border border-[var(--warn)]/20 bg-[var(--warn)]/10 p-2 text-xs text-[var(--warn)]">
                                        {props.messagesWarning}
                                    </div>
                                ) : null}
                            </>
                        )}
                        <ThreadMessagesList />
                        {(() => {
                            const agents = props.agentState?.runningAgents ?? []
                            const running = agents.length > 0 || Boolean(props.agentState?.runningAgent)
                            if (!running) return null
                            const label = props.agentState?.runningAgent?.task
                                || props.agentState?.runningAgent?.name
                                || agents[0]?.task
                                || agents[0]?.name
                                || 'Thinking…'
                            return (
                                <div className="generating-indicator" role="status" aria-live="polite">
                                    <svg
                                        className="sparkle-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden
                                    >
                                        <path d="M12 3l1.9 4.8L18.8 10 13.9 12l-1.9 4.8L10 12 5.2 10l4.8-2.2z" />
                                        <path d="M19 15l.8 2 2 .8-2 .8L19 21l-.8-2-2-.8 2-.8z" />
                                    </svg>
                                    <span>{label}</span>
                                </div>
                            )
                        })()}
                        <div className="chat-timeline-spacer" />
                    </div>
                </ThreadPrimitive.Viewport>
                <NewMessagesIndicator
                    count={props.pendingCount}
                    show={showJumpToLatest}
                    onClick={scrollToBottom}
                />
            </ThreadPrimitive.Root>
        </HappyChatProvider>
    )
}
