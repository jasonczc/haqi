import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ThreadPrimitive, useAssistantState } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { restoreScrollTopByDelta, shouldTriggerLoadOlder } from '@/components/AssistantChat/historyScroll'
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
            className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--app-button)] text-[var(--app-button-text)] px-3 py-1.5 rounded-full text-sm font-medium shadow-lg animate-bounce-in z-10"
        >
            {props.count > 0 ? t('misc.newMessage', { n: props.count }) : t('misc.jumpToLatest')} &#8595;
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-10' },
        { align: 'start', width: 'w-3/4', height: 'h-12' },
        { align: 'end', width: 'w-1/2', height: 'h-9' },
        { align: 'start', width: 'w-5/6', height: 'h-14' }
    ]

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="space-y-3 animate-pulse">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`${row.height} ${row.width} rounded-xl bg-[var(--app-subtle-bg)]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}

function HistoryLoadingIndicator() {
    const { t } = useTranslation()

    return (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[var(--app-button)] px-2.5 py-1 text-xs text-[var(--app-button-text)] shadow-md">
                <Spinner size="sm" label={null} className="text-current" />
                {t('misc.loadingHistory')}
            </div>
        </div>
    )
}

function ThreadMessagesList() {
    const messages = useAssistantState(({ thread }) => thread.messages)

    if (messages.length === 0) {
        return null
    }

    return (
        <>
            {messages.map((message, index) => (
                <ThreadPrimitive.MessageByIndex
                    key={message.id}
                    index={index}
                    components={THREAD_MESSAGE_COMPONENTS}
                />
            ))}
        </>
    )
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
    rawMessagesCount: number
    normalizedMessagesCount: number
    messagesVersion: number
    forceScrollToken: number
    density: SessionListDensity
}) {
    const { t } = useTranslation()
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const loadLockRef = useRef(false)
    const loadMoreArmedRef = useRef(true)
    const previousScrollTopRef = useRef(0)
    const lastLoadTriggerAtRef = useRef(0)
    const historyLoadingStartedAtRef = useRef(0)
    const historyLoadingHideTimerRef = useRef<number | null>(null)
    const restorePositionRafRef = useRef<number | null>(null)
    const pendingScrollRef = useRef<{
        scrollTop: number
        scrollHeight: number
    } | null>(null)
    const prevLoadingMoreRef = useRef(false)
    const loadStartedRef = useRef(false)
    const isLoadingMoreRef = useRef(props.isLoadingMoreMessages)
    const hasMoreMessagesRef = useRef(props.hasMoreMessages)
    const isLoadingMessagesRef = useRef(props.isLoadingMessages)
    const onLoadMoreRef = useRef(props.onLoadMore)
    const handleLoadMoreRef = useRef<() => void>(() => {})
    const atBottomRef = useRef(true)
    const onAtBottomChangeRef = useRef(props.onAtBottomChange)
    const onFlushPendingRef = useRef(props.onFlushPending)
    const forceScrollTokenRef = useRef(props.forceScrollToken)

    // Smart scroll state: autoScroll enabled when user is near bottom
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
    const [showHistoryLoadingHint, setShowHistoryLoadingHint] = useState(false)
    const autoScrollEnabledRef = useRef(autoScrollEnabled)

    const startHistoryLoadingHint = useCallback(() => {
        historyLoadingStartedAtRef.current = Date.now()
        setShowHistoryLoadingHint(true)
    }, [])

    // Keep refs in sync with state
    useEffect(() => {
        autoScrollEnabledRef.current = autoScrollEnabled
    }, [autoScrollEnabled])
    useEffect(() => {
        onAtBottomChangeRef.current = props.onAtBottomChange
    }, [props.onAtBottomChange])
    useEffect(() => {
        onFlushPendingRef.current = props.onFlushPending
    }, [props.onFlushPending])
    useEffect(() => {
        hasMoreMessagesRef.current = props.hasMoreMessages
    }, [props.hasMoreMessages])
    useEffect(() => {
        isLoadingMessagesRef.current = props.isLoadingMessages
    }, [props.isLoadingMessages])
    useEffect(() => {
        onLoadMoreRef.current = props.onLoadMore
    }, [props.onLoadMore])
    useEffect(() => {
        return () => {
            if (historyLoadingHideTimerRef.current !== null) {
                window.clearTimeout(historyLoadingHideTimerRef.current)
                historyLoadingHideTimerRef.current = null
            }
            if (restorePositionRafRef.current !== null) {
                window.cancelAnimationFrame(restorePositionRafRef.current)
                restorePositionRafRef.current = null
            }
        }
    }, [])

    // Track scroll position to toggle autoScroll (stable listener using refs)
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const THRESHOLD_PX = 120
        const LOAD_OLDER_THRESHOLD_PX = 96
        const LOAD_OLDER_REARM_PX = 180
        const LOAD_OLDER_COOLDOWN_MS = 300

        const handleScroll = () => {
            const currentScrollTop = viewport.scrollTop
            const previousScrollTop = previousScrollTopRef.current

            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
            const isNearBottom = distanceFromBottom < THRESHOLD_PX

            if (isNearBottom) {
                if (!autoScrollEnabledRef.current) setAutoScrollEnabled(true)
            } else if (autoScrollEnabledRef.current) {
                setAutoScrollEnabled(false)
            }

            if (isNearBottom !== atBottomRef.current) {
                atBottomRef.current = isNearBottom
                onAtBottomChangeRef.current(isNearBottom)
                if (isNearBottom) {
                    onFlushPendingRef.current()
                }
            }

            if (currentScrollTop >= LOAD_OLDER_REARM_PX) {
                loadMoreArmedRef.current = true
            }

            const shouldTrigger = shouldTriggerLoadOlder({
                previousScrollTop,
                currentScrollTop,
                thresholdPx: LOAD_OLDER_THRESHOLD_PX,
                isArmed: loadMoreArmedRef.current,
                isLoadingMessages: isLoadingMessagesRef.current,
                isLoadingMoreMessages: isLoadingMoreRef.current,
                hasMoreMessages: hasMoreMessagesRef.current,
                lastTriggeredAtMs: lastLoadTriggerAtRef.current,
                nowMs: Date.now(),
                cooldownMs: LOAD_OLDER_COOLDOWN_MS
            })

            if (shouldTrigger) {
                loadMoreArmedRef.current = false
                lastLoadTriggerAtRef.current = Date.now()
                startHistoryLoadingHint()
                handleLoadMoreRef.current()
            }

            previousScrollTopRef.current = currentScrollTop
        }

        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, [startHistoryLoadingHint]) // Stable logic + loading hint callback

    // Scroll to bottom handler for the indicator button
    const scrollToBottom = useCallback(() => {
        const viewport = viewportRef.current
        if (viewport) {
            viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
        }
        setAutoScrollEnabled(true)
        if (!atBottomRef.current) {
            atBottomRef.current = true
            onAtBottomChangeRef.current(true)
        }
        onFlushPendingRef.current()
    }, [])

    // Reset state when session changes
    useEffect(() => {
        setAutoScrollEnabled(true)
        atBottomRef.current = true
        loadMoreArmedRef.current = true
        previousScrollTopRef.current = 0
        historyLoadingStartedAtRef.current = 0
        setShowHistoryLoadingHint(false)
        if (historyLoadingHideTimerRef.current !== null) {
            window.clearTimeout(historyLoadingHideTimerRef.current)
            historyLoadingHideTimerRef.current = null
        }
        if (restorePositionRafRef.current !== null) {
            window.cancelAnimationFrame(restorePositionRafRef.current)
            restorePositionRafRef.current = null
        }
        pendingScrollRef.current = null
        loadLockRef.current = false
        onAtBottomChangeRef.current(true)
        forceScrollTokenRef.current = props.forceScrollToken
    }, [props.sessionId])

    useEffect(() => {
        if (forceScrollTokenRef.current === props.forceScrollToken) {
            return
        }
        forceScrollTokenRef.current = props.forceScrollToken
        scrollToBottom()
    }, [props.forceScrollToken, scrollToBottom])

    const handleLoadMore = useCallback(() => {
        if (isLoadingMessagesRef.current || !hasMoreMessagesRef.current || isLoadingMoreRef.current || loadLockRef.current) {
            return
        }
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }
        pendingScrollRef.current = {
            scrollTop: viewport.scrollTop,
            scrollHeight: viewport.scrollHeight
        }
        loadLockRef.current = true
        loadStartedRef.current = false
        startHistoryLoadingHint()
        let loadPromise: Promise<unknown>
        try {
            loadPromise = onLoadMoreRef.current()
        } catch (error) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            throw error
        }
        void loadPromise.catch((error) => {
            pendingScrollRef.current = null
            loadLockRef.current = false
            console.error('Failed to load older messages:', error)
        }).finally(() => {
            if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                pendingScrollRef.current = null
                loadLockRef.current = false
            }
        })
    }, [startHistoryLoadingHint])

    useEffect(() => {
        handleLoadMoreRef.current = handleLoadMore
    }, [handleLoadMore])

    const restorePendingScrollPosition = useCallback((finalize: boolean) => {
        const pending = pendingScrollRef.current
        const viewport = viewportRef.current
        if (!pending || !viewport) {
            return true
        }

        viewport.scrollTop = restoreScrollTopByDelta({
            previousScrollTop: pending.scrollTop,
            previousScrollHeight: pending.scrollHeight,
            nextScrollHeight: viewport.scrollHeight
        })
        previousScrollTopRef.current = viewport.scrollTop

        if (finalize) {
            pendingScrollRef.current = null
            loadLockRef.current = false
        }
        return true
    }, [])

    useLayoutEffect(() => {
        if (restorePositionRafRef.current !== null) {
            window.cancelAnimationFrame(restorePositionRafRef.current)
            restorePositionRafRef.current = null
        }

        const hasPending = pendingScrollRef.current !== null
        if (!hasPending) {
            return
        }

        restorePendingScrollPosition(false)

        // Re-apply for late layout changes, then finalize.
        restorePositionRafRef.current = window.requestAnimationFrame(() => {
            restorePendingScrollPosition(false)
            restorePositionRafRef.current = window.requestAnimationFrame(() => {
                restorePositionRafRef.current = null
                restorePendingScrollPosition(true)
            })
        })
    }, [props.messagesVersion, restorePendingScrollPosition])

    useEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (props.isLoadingMoreMessages) {
            startHistoryLoadingHint()
        }
        if (props.isLoadingMoreMessages) {
            loadStartedRef.current = true
        }
        prevLoadingMoreRef.current = props.isLoadingMoreMessages
    }, [props.isLoadingMoreMessages, startHistoryLoadingHint])

    useEffect(() => {
        if (props.isLoadingMoreMessages) {
            return
        }
        if (!showHistoryLoadingHint) {
            return
        }
        const MIN_VISIBLE_MS = 350
        const elapsed = Date.now() - historyLoadingStartedAtRef.current
        const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
        if (historyLoadingHideTimerRef.current !== null) {
            window.clearTimeout(historyLoadingHideTimerRef.current)
        }
        historyLoadingHideTimerRef.current = window.setTimeout(() => {
            setShowHistoryLoadingHint(false)
            historyLoadingHideTimerRef.current = null
        }, delay)
    }, [props.isLoadingMoreMessages, showHistoryLoadingHint])

    const showSkeleton = props.isLoadingMessages && props.rawMessagesCount === 0 && props.pendingCount === 0
    const isCompact = props.density === 'compact'

    return (
        <HappyChatProvider value={{
            api: props.api,
            sessionId: props.sessionId,
            metadata: props.metadata,
            disabled: props.disabled,
            density: props.density,
            onRefresh: props.onRefresh,
            onRetryMessage: props.onRetryMessage
        }}>
            <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col relative">
                {showHistoryLoadingHint || props.isLoadingMoreMessages ? (
                    <HistoryLoadingIndicator />
                ) : null}
                <ThreadPrimitive.Viewport asChild autoScroll={autoScrollEnabled}>
                    <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                        <div className={`mx-auto w-full max-w-content min-w-0 ${isCompact ? 'p-2' : 'p-3'}`}>
                            {showSkeleton ? (
                                <MessageSkeleton />
                            ) : (
                                <>
                                    {props.messagesWarning ? (
                                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs">
                                            {props.messagesWarning}
                                        </div>
                                    ) : null}

                                    {props.hasMoreMessages && !props.isLoadingMessages && props.isLoadingMoreMessages ? (
                                        <div className="mb-2 py-1">
                                            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--app-divider)] px-2.5 py-1 text-xs text-[var(--app-hint)]">
                                                <Spinner size="sm" label={null} className="text-current" />
                                                {t('misc.loadingHistory')}
                                            </div>
                                        </div>
                                    ) : null}

                                    {import.meta.env.DEV && props.normalizedMessagesCount === 0 && props.rawMessagesCount > 0 ? (
                                        <div className="mb-2 rounded-md bg-amber-500/10 p-2 text-xs">
                                            Message normalization returned 0 items for {props.rawMessagesCount} messages (see `web/src/chat/normalize.ts`).
                                        </div>
                                    ) : null}
                                </>
                            )}
                            <div className={`flex flex-col ${isCompact ? 'gap-2' : 'gap-3'}`}>
                                <ThreadMessagesList />
                            </div>
                        </div>
                    </div>
                </ThreadPrimitive.Viewport>
                <NewMessagesIndicator
                    count={props.pendingCount}
                    show={props.pendingCount > 0 || !autoScrollEnabled}
                    onClick={scrollToBottom}
                />
            </ThreadPrimitive.Root>
        </HappyChatProvider>
    )
}
