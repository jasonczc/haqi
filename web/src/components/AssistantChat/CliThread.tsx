import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatBlock } from '@/chat/types'
import type { ApiClient } from '@/api/client'
import type { AgentState, PermissionMode, SessionMetadataSummary } from '@/types/api'
import type { SessionListDensity } from '@/hooks/useSessionListDensity'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { restoreScrollTopByDelta, shouldTriggerLoadOlder } from '@/components/AssistantChat/historyScroll'
import { CliBlockRenderer } from '@/components/AssistantChat/cli/CliBlockRenderer'
import { Spinner } from '@/components/Spinner'

type CliThreadProps = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    agentState?: AgentState | null
    permissionMode?: PermissionMode
    disabled: boolean
    density: SessionListDensity
    blocks: ChatBlock[]
    isLoadingMessages: boolean
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => void
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onAtBottomChange?: (atBottom: boolean) => void
}

const SCROLL_BOTTOM_THRESHOLD = 120
const LOAD_MORE_THRESHOLD = 80
const LOAD_MORE_COOLDOWN_MS = 300
const RE_ARM_THRESHOLD = 180

export const CliThread = memo(function CliThread(props: CliThreadProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevScrollTopRef = useRef(0)
    const prevScrollHeightRef = useRef(0)
    const lastLoadMoreAtRef = useRef(0)
    const [isArmed, setIsArmed] = useState(true)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const prevBlockCountRef = useRef(props.blocks.length)

    // Auto-scroll to bottom when new blocks arrive and user is at bottom
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (!el) return

        if (props.blocks.length > prevBlockCountRef.current && isAtBottom) {
            el.scrollTop = el.scrollHeight
        }
        prevBlockCountRef.current = props.blocks.length
    }, [props.blocks.length, isAtBottom])

    // Restore scroll position after loading older messages
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const currentHeight = el.scrollHeight

        if (props.isLoadingMoreMessages === false && prevScrollHeightRef.current > 0) {
            const restored = restoreScrollTopByDelta({
                previousScrollTop: prevScrollTopRef.current,
                previousScrollHeight: prevScrollHeightRef.current,
                nextScrollHeight: currentHeight,
            })
            if (restored > 0) {
                el.scrollTop = restored
            }
        }
        prevScrollHeightRef.current = currentHeight
    }, [props.blocks, props.isLoadingMoreMessages])

    const handleScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return

        const currentScrollTop = el.scrollTop
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD
        setIsAtBottom(atBottom)
        props.onAtBottomChange?.(atBottom)

        // Re-arm load-more trigger after scrolling away from top
        if (!isArmed && currentScrollTop > RE_ARM_THRESHOLD) {
            setIsArmed(true)
        }

        if (shouldTriggerLoadOlder({
            previousScrollTop: prevScrollTopRef.current,
            currentScrollTop,
            thresholdPx: LOAD_MORE_THRESHOLD,
            isArmed,
            isLoadingMessages: props.isLoadingMessages,
            isLoadingMoreMessages: props.isLoadingMoreMessages,
            hasMoreMessages: props.hasMoreMessages,
            lastTriggeredAtMs: lastLoadMoreAtRef.current,
            nowMs: Date.now(),
            cooldownMs: LOAD_MORE_COOLDOWN_MS,
        })) {
            prevScrollTopRef.current = currentScrollTop
            prevScrollHeightRef.current = el.scrollHeight
            lastLoadMoreAtRef.current = Date.now()
            setIsArmed(false)
            props.onLoadMore()
        }

        prevScrollTopRef.current = currentScrollTop
    }, [isArmed, props.isLoadingMessages, props.isLoadingMoreMessages, props.hasMoreMessages, props.onLoadMore, props.onAtBottomChange])

    // Initial scroll to bottom
    useEffect(() => {
        const el = scrollRef.current
        if (el && !props.isLoadingMessages) {
            el.scrollTop = el.scrollHeight
        }
    }, [props.sessionId, props.isLoadingMessages])

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
            onRetryMessage: props.onRetryMessage,
        }}>
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="cli-thread flex-1 overflow-y-auto app-scrollbar px-4 py-3"
            >
                <div className="mx-auto max-w-content space-y-0.5">
                    {/* Load more control */}
                    {(props.hasMoreMessages || props.isLoadingMoreMessages) && (
                        <div className="flex justify-center py-2">
                            {props.isLoadingMoreMessages ? (
                                <div className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs border border-transparent bg-[var(--app-button)] text-[var(--app-button-text)] shadow-sm">
                                    <Spinner size="sm" label={null} className="text-current" />
                                    Loading…
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={props.onLoadMore}
                                    className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] text-[var(--app-fg)] shadow-sm transition-colors hover:bg-[var(--app-subtle-bg)]"
                                >
                                    Load older
                                </button>
                            )}
                        </div>
                    )}

                    {/* Loading state */}
                    {props.isLoadingMessages && props.blocks.length === 0 && (
                        <div className="flex justify-center py-8">
                            <Spinner size="md" />
                        </div>
                    )}

                    {/* Warning */}
                    {props.messagesWarning && (
                        <div className="text-xs text-[var(--app-badge-warning-text)] italic py-1">
                            — {props.messagesWarning}
                        </div>
                    )}

                    {/* Blocks */}
                    {props.blocks.map(block => (
                        <CliBlockRenderer key={block.id} block={block} />
                    ))}
                </div>
            </div>
        </HappyChatProvider>
    )
})
