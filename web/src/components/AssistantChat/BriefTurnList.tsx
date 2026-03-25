import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

import type { ApiClient } from '@/api/client'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { reduceChatBlocks } from '@/chat/reducer'
import { reconcileChatBlocks } from '@/chat/reconcile'
import { asRecord, extractLatestLiveActivity } from '@/components/AssistantChat/liveActivity'
import { BriefCardMarkdownPreview } from '@/components/AssistantChat/BriefCardMarkdownPreview'
import { BriefFullMarkdownContent } from '@/components/AssistantChat/BriefFullMarkdownContent'
import { HappyThread } from '@/components/AssistantChat/HappyThread'
import {
    isBriefTurnLive,
    shouldFetchLatestTurnChangesSummary,
    shouldShowLatestBriefTurnAsFullContent
} from '@/components/AssistantChat/briefTurnPresentation'
import { Spinner } from '@/components/Spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SessionListDensity } from '@/hooks/useSessionListDensity'
import { useBriefModeCardSettings } from '@/hooks/useBriefModeCardSettings'
import { useHappyRuntime } from '@/lib/assistant-runtime'
import type { ConversationTurn, DecryptedMessage, Session } from '@/types/api'

type TurnDetailState = {
    isLoading: boolean
    isLoadingMore: boolean
    error: string | null
    messages: DecryptedMessage[]
    nextBeforeSeq: number | null
    hasMore: boolean
}

type TurnDetailStateMap = Record<string, TurnDetailState>

const DEFAULT_TURN_MESSAGE_LIMIT = 120
const LIVE_PREVIEW_ROTATION_MS = 2600
const LIVE_PREVIEW_FADE_MS = 180
const TURN_DETAILS_REFRESH_INTERVAL_MS = 1200
const BRIEF_PREVIEW_LINE_HEIGHT_REM = 1.4
const MOBILE_BRIEF_BREAKPOINT_QUERY = '(max-width: 767px)'
const MOBILE_BRIEF_TURN_QUERY_KEY = 'briefTurnId'
const TURN_CHANGES_DETAIL_QUERY_KEY = 'turnChangesToolId'
const LIVE_ACTIVITY_FETCH_LIMIT = 40
const TURN_CHANGES_SUMMARY_FETCH_LIMIT = 200

type TurnChangesSummary = {
    toolId: string
    additions: number
    deletions: number
}

function isCodexPlanModeEnabled(session: Session): boolean {
    const flavor = session.metadata?.flavor?.trim().toLowerCase()
    if (flavor !== 'codex') {
        return false
    }
    return session.metadata?.collaborationMode?.trim().toLowerCase() === 'plan'
}

function normalizePreview(value: string | null | undefined): string {
    const text = value?.trim() ?? ''
    return text.length > 0 ? text : '(empty)'
}

function shouldShowPreviewFade(text: string, maxLines: number): boolean {
    const normalizedMaxLines = Math.max(1, maxLines)
    const explicitLineCount = text.split(/\r?\n/g).length
    if (explicitLineCount > normalizedMaxLines) {
        return true
    }
    const estimatedCharsPerLine = 42
    return text.length > normalizedMaxLines * estimatedCharsPerLine
}

function normalizeLivePreviewLine(line: string): string {
    const cleaned = line
        .trim()
        .replace(/^[-*•]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/\bcall_[A-Za-z0-9_-]{4,}\b/g, '')
        .replace(/^[\s:>–—-]+/, '')
        .replace(/\s+/g, ' ')
        .trim()

    return cleaned
}

function extractLivePreviewLines(preview: string): string[] {
    const text = preview.trim()
    if (text.length === 0) {
        return ['Waiting for updates…']
    }

    const normalizedLines = text
        .split(/\r?\n/g)
        .map((line) => normalizeLivePreviewLine(line))
        .filter((line) => line.length > 0)

    if (normalizedLines.length === 0) {
        return ['Waiting for updates…']
    }

    return normalizedLines.slice(-3)
}

function buildDefaultTurnState(): TurnDetailState {
    return {
        isLoading: false,
        isLoadingMore: false,
        error: null,
        messages: [],
        nextBeforeSeq: null,
        hasMore: false
    }
}

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function readMobileBriefTurnId(search: string): string | null {
    const rawValue = new URLSearchParams(search).get(MOBILE_BRIEF_TURN_QUERY_KEY)
    const value = rawValue?.trim() ?? ''
    return value.length > 0 ? value : null
}

function writeMobileBriefTurnId(turnId: string | null, mode: 'push' | 'replace'): void {
    if (typeof window === 'undefined') {
        return
    }

    const url = new URL(window.location.href)
    if (turnId) {
        url.searchParams.set(MOBILE_BRIEF_TURN_QUERY_KEY, turnId)
    } else {
        url.searchParams.delete(MOBILE_BRIEF_TURN_QUERY_KEY)
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    if (mode === 'replace') {
        window.history.replaceState(window.history.state, '', nextUrl)
        return
    }

    window.history.pushState(window.history.state, '', nextUrl)
}

function readTurnChangesDetailToolId(search: string): string | null {
    const rawValue = new URLSearchParams(search).get(TURN_CHANGES_DETAIL_QUERY_KEY)
    const value = rawValue?.trim() ?? ''
    return value.length > 0 ? value : null
}

function writeTurnChangesDetailToolId(toolId: string | null, mode: 'push' | 'replace'): void {
    if (typeof window === 'undefined') {
        return
    }

    const url = new URL(window.location.href)
    if (toolId) {
        url.searchParams.set(TURN_CHANGES_DETAIL_QUERY_KEY, toolId)
    } else {
        url.searchParams.delete(TURN_CHANGES_DETAIL_QUERY_KEY)
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    if (mode === 'replace') {
        window.history.replaceState(window.history.state, '', nextUrl)
        return
    }

    window.history.pushState(window.history.state, '', nextUrl)
}

function toNonNegativeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.round(value))
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.round(parsed))
        }
    }

    return 0
}

function extractTurnChangesSummary(messages: DecryptedMessage[]): TurnChangesSummary | null {
    let matchedToolId: string | null = null
    let totalAdditions = 0
    let totalDeletions = 0

    for (const message of messages) {
        const normalized = normalizeDecryptedMessage(message)
        if (!normalized || normalized.role !== 'agent') {
            continue
        }

        for (const content of normalized.content) {
            if (content.type !== 'tool-call') {
                continue
            }
            const normalizedToolName = content.name.trim().toLowerCase().replace(/[_-]/g, '')
            if (!normalizedToolName.endsWith('codexturnchanges')) {
                continue
            }

            matchedToolId = content.id
            const input = asRecord(content.input)
            const files = Array.isArray(input?.files) ? input.files : []
            let additions = 0
            let deletions = 0

            for (const file of files) {
                const fileRecord = asRecord(file)
                if (!fileRecord) {
                    continue
                }
                additions += toNonNegativeNumber(fileRecord.additions)
                deletions += toNonNegativeNumber(fileRecord.deletions)
            }

            if (additions === 0 && deletions === 0) {
                const diffStats = asRecord(input?.diff_stats)
                additions = toNonNegativeNumber(diffStats?.additions)
                deletions = toNonNegativeNumber(diffStats?.deletions)
            }

            totalAdditions += additions
            totalDeletions += deletions
        }
    }

    if (!matchedToolId) {
        return null
    }

    return {
        toolId: matchedToolId,
        additions: totalAdditions,
        deletions: totalDeletions
    }
}

async function fetchTurnChangesSummaryByPaging(
    api: ApiClient,
    sessionId: string,
    turnId: string
): Promise<TurnChangesSummary | null> {
    let beforeSeq: number | null = null
    let pageCount = 0

    while (pageCount < 8) {
        const response = await api.getConversationTurnMessages(sessionId, turnId, {
            limit: TURN_CHANGES_SUMMARY_FETCH_LIMIT,
            beforeSeq
        })
        const summary = extractTurnChangesSummary(response.messages)
        if (summary) {
            return summary
        }

        if (!response.page.hasMore || response.page.nextBeforeSeq === null) {
            return null
        }

        beforeSeq = response.page.nextBeforeSeq
        pageCount += 1
    }

    return null
}

function dedupeAndSortMessages(messages: DecryptedMessage[]): DecryptedMessage[] {
    const dedupedById = new Map<string, DecryptedMessage>()
    for (const message of messages) {
        dedupedById.set(message.id, message)
    }

    return Array.from(dedupedById.values()).sort((left, right) => {
        const leftSeq = typeof left.seq === 'number' ? left.seq : Number.MAX_SAFE_INTEGER
        const rightSeq = typeof right.seq === 'number' ? right.seq : Number.MAX_SAFE_INTEGER
        return leftSeq - rightSeq
    })
}

function AnimatedCounter(props: {
    value: number
}) {
    const [displayValue, setDisplayValue] = useState(props.value)
    const [previousValue, setPreviousValue] = useState(props.value)
    const [stage, setStage] = useState<'idle' | 'prep' | 'run'>('idle')

    useEffect(() => {
        if (props.value === displayValue) {
            return
        }

        setPreviousValue(displayValue)
        setDisplayValue(props.value)
        setStage('prep')
        const rafId = window.requestAnimationFrame(() => {
            setStage('run')
        })
        const timeoutId = window.setTimeout(() => {
            setStage('idle')
        }, 220)

        return () => {
            window.cancelAnimationFrame(rafId)
            window.clearTimeout(timeoutId)
        }
    }, [displayValue, props.value])

    const previousClass = stage === 'prep' ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
    const currentClass = stage === 'prep' ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
    const widthText = String(previousValue).length > String(displayValue).length
        ? String(previousValue)
        : String(displayValue)

    return (
        <span className="relative inline-flex h-[1.1em] min-w-[2ch] items-center justify-center overflow-hidden align-middle tabular-nums">
            <span className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${previousClass}`}>
                {previousValue}
            </span>
            <span className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${currentClass}`}>
                {displayValue}
            </span>
            <span className="invisible">{widthText}</span>
        </span>
    )
}

function LivePreviewCarousel(props: {
    preview: string
    liveActivity: string
}) {
    const lines = useMemo(() => extractLivePreviewLines(props.preview), [props.preview])
    const [activeLineIndex, setActiveLineIndex] = useState(0)
    const [isVisible, setIsVisible] = useState(true)
    const fadeTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        setActiveLineIndex(0)
        setIsVisible(true)
    }, [props.preview])

    useEffect(() => {
        if (lines.length <= 1) {
            return
        }

        const intervalId = window.setInterval(() => {
            setIsVisible(false)
            if (fadeTimeoutRef.current !== null) {
                window.clearTimeout(fadeTimeoutRef.current)
            }
            fadeTimeoutRef.current = window.setTimeout(() => {
                setActiveLineIndex((previous) => (previous + 1) % lines.length)
                setIsVisible(true)
            }, LIVE_PREVIEW_FADE_MS)
        }, LIVE_PREVIEW_ROTATION_MS)

        return () => {
            window.clearInterval(intervalId)
            if (fadeTimeoutRef.current !== null) {
                window.clearTimeout(fadeTimeoutRef.current)
                fadeTimeoutRef.current = null
            }
        }
    }, [lines])

    const activeLine = lines[activeLineIndex] ?? 'Waiting for updates…'

    return (
        <div className="min-h-[3.6rem] py-0.5">
            <div className={`whitespace-pre-wrap break-words text-sm leading-5 text-[var(--app-hint)] transition-all duration-200 ease-out ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}>
                {activeLine}
            </div>
            <div className="truncate text-xs leading-5 text-[var(--app-hint)]">
                {props.liveActivity}
            </div>
        </div>
    )
}

function TurnDetailThread(props: {
    api: ApiClient
    session: Session
    messages: DecryptedMessage[]
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => Promise<void>
    density: SessionListDensity
}) {
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const initialBottomAppliedRef = useRef(false)

    const normalizedMessages: NormalizedMessage[] = useMemo(() => {
        const normalized: NormalizedMessage[] = []
        for (const message of props.messages) {
            const next = normalizeDecryptedMessage(message)
            if (next) normalized.push(next)
        }
        return normalized
    }, [props.messages])

    const reduced = useMemo(
        () => reduceChatBlocks(normalizedMessages, props.session.agentState, props.session.metadata?.flavor ?? null),
        [normalizedMessages, props.session.agentState, props.session.metadata?.flavor]
    )

    const reconciled = useMemo(
        () => reconcileChatBlocks(reduced.blocks, new Map<string, ChatBlock>()),
        [reduced.blocks]
    )

    const runtimeSession = useMemo(() => ({
        ...props.session,
        thinking: false
    }), [props.session])

    const runtime = useHappyRuntime({
        session: runtimeSession,
        blocks: reconciled.blocks,
        isSending: true,
        onSendMessage: () => {},
        onAbort: async () => {},
        allowSendWhenInactive: true
    })

    useEffect(() => {
        if (props.messages.length === 0) {
            initialBottomAppliedRef.current = false
            return
        }
        if (initialBottomAppliedRef.current) {
            return
        }

        initialBottomAppliedRef.current = true
        setForceScrollToken((prev) => prev + 1)
    }, [props.messages.length])

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <div className="flex h-full min-h-0 flex-col">
                <HappyThread
                    api={props.api}
                    sessionId={props.session.id}
                    metadata={props.session.metadata}
                    permissionMode={props.session.permissionMode}
                    disabled
                    onRefresh={() => {}}
                    onFlushPending={() => {}}
                    onAtBottomChange={() => {}}
                    isLoadingMessages={props.isLoadingMessages}
                    messagesWarning={null}
                    hasMoreMessages={props.hasMoreMessages}
                    isLoadingMoreMessages={props.isLoadingMoreMessages}
                    onLoadMore={props.onLoadMore}
                    pendingCount={0}
                    rawMessagesCount={props.messages.length}
                    normalizedMessagesCount={normalizedMessages.length}
                    messagesVersion={normalizedMessages.length}
                    forceScrollToken={forceScrollToken}
                    density={props.density}
                />
            </div>
        </AssistantRuntimeProvider>
    )
}

export function BriefTurnList(props: {
    api: ApiClient
    session: Session
    turns: ConversationTurn[]
    warning: string | null
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    thinking: boolean
    density: SessionListDensity
    onLoadMoreTurns: () => Promise<void>
}) {
    const {
        briefCardAdaptiveHeight,
        briefCardMaxLines
    } = useBriefModeCardSettings()
    const listRef = useRef<VirtuosoHandle | null>(null)
    const autoScrollToBottomDoneRef = useRef(false)
    const isAtBottomRef = useRef(true)
    const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
    const [turnDetailStateById, setTurnDetailStateById] = useState<TurnDetailStateMap>({})
    const [liveActivityByTurnId, setLiveActivityByTurnId] = useState<Record<string, string>>({})
    const [turnChangesSummaryByTurnId, setTurnChangesSummaryByTurnId] = useState<Record<string, TurnChangesSummary | null>>({})
    const turnChangesSummaryInFlightRef = useRef(new Set<string>())
    const turnChangesSummaryFetchedUpdatedAtRef = useRef<Record<string, number>>({})
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia(MOBILE_BRIEF_BREAKPOINT_QUERY).matches
    ))

    const activeTurn = useMemo(
        () => props.turns.find((turn) => turn.id === activeTurnId) ?? null,
        [activeTurnId, props.turns]
    )

    const activeDetail = useMemo(
        () => (activeTurnId ? (turnDetailStateById[activeTurnId] ?? buildDefaultTurnState()) : null),
        [activeTurnId, turnDetailStateById]
    )
    const codexPlanModeEnabled = useMemo(
        () => isCodexPlanModeEnabled(props.session),
        [props.session]
    )
    const generatingBadgeText = codexPlanModeEnabled ? 'Generating (Plan mode)' : 'Generating'

    const fetchTurnMessages = useCallback(async (
        turnId: string,
        beforeSeq: number | null,
        prepend: boolean,
        options?: { mergeRecent?: boolean; silent?: boolean }
    ) => {
        const mergeRecent = options?.mergeRecent === true
        const silent = options?.silent === true

        if (!silent) {
            setTurnDetailStateById((prev) => ({
                ...prev,
                [turnId]: {
                    ...(prev[turnId] ?? buildDefaultTurnState()),
                    isLoading: !prepend,
                    isLoadingMore: prepend,
                    error: null
                }
            }))
        }

        try {
            const response = await props.api.getConversationTurnMessages(props.session.id, turnId, {
                limit: DEFAULT_TURN_MESSAGE_LIMIT,
                beforeSeq
            })

            setTurnDetailStateById((prev) => {
                const previous = prev[turnId] ?? buildDefaultTurnState()
                const mergedMessages = prepend
                    ? [...response.messages, ...previous.messages]
                    : mergeRecent
                        ? [...previous.messages, ...response.messages]
                        : response.messages
                const deduped = dedupeAndSortMessages(mergedMessages)

                const keepPagingState = mergeRecent && previous.messages.length > 0

                return {
                    ...prev,
                    [turnId]: {
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        messages: deduped,
                        nextBeforeSeq: keepPagingState ? previous.nextBeforeSeq : response.page.nextBeforeSeq,
                        hasMore: keepPagingState ? previous.hasMore : response.page.hasMore
                    }
                }
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load turn details'
            setTurnDetailStateById((prev) => ({
                ...prev,
                [turnId]: {
                    ...(prev[turnId] ?? buildDefaultTurnState()),
                    isLoading: false,
                    isLoadingMore: false,
                    error: message
                }
            }))
        }
    }, [props.api, props.session.id])

    const openTurnDetails = useCallback((turnId: string) => {
        setActiveTurnId(turnId)

        if (typeof window !== 'undefined' && readTurnChangesDetailToolId(window.location.search)) {
            writeTurnChangesDetailToolId(null, 'replace')
        }

        if (isMobileViewport && typeof window !== 'undefined') {
            const currentTurnId = readMobileBriefTurnId(window.location.search)
            if (currentTurnId !== turnId) {
                writeMobileBriefTurnId(turnId, 'push')
            }
        }
    }, [isMobileViewport])

    const openTurnChangesDetails = useCallback((turnId: string, toolId: string) => {
        setActiveTurnId(turnId)
        if (typeof window === 'undefined') {
            return
        }

        if (isMobileViewport) {
            const currentTurnId = readMobileBriefTurnId(window.location.search)
            const currentToolId = readTurnChangesDetailToolId(window.location.search)
            if (currentTurnId === turnId && currentToolId === toolId) {
                return
            }

            const url = new URL(window.location.href)
            url.searchParams.set(MOBILE_BRIEF_TURN_QUERY_KEY, turnId)
            url.searchParams.set(TURN_CHANGES_DETAIL_QUERY_KEY, toolId)
            const nextUrl = `${url.pathname}${url.search}${url.hash}`
            window.history.pushState(window.history.state, '', nextUrl)
            return
        }

        const currentToolId = readTurnChangesDetailToolId(window.location.search)
        if (currentToolId !== toolId) {
            writeTurnChangesDetailToolId(toolId, 'replace')
        }
    }, [isMobileViewport])

    const closeTurnDetails = useCallback(() => {
        if (isMobileViewport && typeof window !== 'undefined') {
            const currentTurnId = readMobileBriefTurnId(window.location.search)
            if (currentTurnId) {
                window.history.back()
                return
            }
        }

        if (typeof window !== 'undefined' && readTurnChangesDetailToolId(window.location.search)) {
            writeTurnChangesDetailToolId(null, 'replace')
        }

        setActiveTurnId(null)
    }, [isMobileViewport])

    const activeTurnIdForStreaming = useMemo(() => {
        if (props.turns.length === 0) {
            return null
        }
        const openTurn = [...props.turns].reverse().find((turn) => turn.status === 'open')
        return openTurn?.id ?? props.turns[props.turns.length - 1]?.id ?? null
    }, [props.turns])

    const collapsedPreviewStyle = useMemo<CSSProperties>(() => {
        const previewHeight = `${Math.max(1, briefCardMaxLines) * BRIEF_PREVIEW_LINE_HEIGHT_REM}rem`
        if (briefCardAdaptiveHeight) {
            return {
                maxHeight: previewHeight
            }
        }
        return {
            height: previewHeight
        }
    }, [briefCardAdaptiveHeight, briefCardMaxLines])

    const loadMoreActiveTurnDetails = useCallback(async () => {
        if (!activeTurn || !activeDetail) {
            return
        }
        if (!activeDetail.hasMore || activeDetail.nextBeforeSeq === null || activeDetail.isLoadingMore) {
            return
        }
        await fetchTurnMessages(activeTurn.id, activeDetail.nextBeforeSeq, true)
    }, [activeDetail, activeTurn, fetchTurnMessages])

    const fetchLiveActivity = useCallback(async (turnId: string) => {
        const response = await props.api.getConversationTurnMessages(props.session.id, turnId, {
            limit: LIVE_ACTIVITY_FETCH_LIMIT,
            beforeSeq: null
        })
        const latestActivity = extractLatestLiveActivity(response.messages)
        setLiveActivityByTurnId((previous) => {
            if (previous[turnId] === latestActivity) {
                return previous
            }
            return {
                ...previous,
                [turnId]: latestActivity
            }
        })
    }, [props.api, props.session.id])

    useEffect(() => {
        if (!activeTurnId || !activeTurn) {
            return
        }

        const isLiveTurn = activeTurn.status === 'open' || (props.thinking && activeTurnIdForStreaming === activeTurn.id)
        if (!isLiveTurn) {
            return
        }

        let stopped = false
        let inFlight = false

        const refreshLatest = async () => {
            if (stopped || inFlight) {
                return
            }
            inFlight = true
            try {
                await fetchTurnMessages(activeTurn.id, null, false, { mergeRecent: true, silent: true })
            } finally {
                inFlight = false
            }
        }

        void refreshLatest()
        const intervalId = window.setInterval(() => {
            void refreshLatest()
        }, TURN_DETAILS_REFRESH_INTERVAL_MS)

        return () => {
            stopped = true
            window.clearInterval(intervalId)
        }
    }, [
        activeTurn,
        activeTurnId,
        activeTurnIdForStreaming,
        fetchTurnMessages,
        props.thinking
    ])

    useEffect(() => {
        if (!activeTurnId) {
            return
        }

        const existing = turnDetailStateById[activeTurnId]
        if (!existing || (existing.messages.length === 0 && !existing.isLoading && !existing.isLoadingMore)) {
            void fetchTurnMessages(activeTurnId, null, false)
        }
    }, [activeTurnId, fetchTurnMessages, turnDetailStateById])

    useEffect(() => {
        if (activeTurnId !== null || typeof window === 'undefined') {
            return
        }
        if (readTurnChangesDetailToolId(window.location.search)) {
            writeTurnChangesDetailToolId(null, 'replace')
        }
    }, [activeTurnId])

    useEffect(() => {
        const latestTurn = props.turns[props.turns.length - 1]
        const latestTurnId = latestTurn?.id ?? null
        const latestTurnUpdatedAt = latestTurn?.updatedAt ?? null

        if (!shouldFetchLatestTurnChangesSummary({
            latestTurnId,
            latestTurnUpdatedAt,
            fetchedUpdatedAtByTurnId: turnChangesSummaryFetchedUpdatedAtRef.current,
            inFlightTurnIds: turnChangesSummaryInFlightRef.current
        })) {
            return
        }

        const turnId = latestTurnId as string

        let cancelled = false
        turnChangesSummaryInFlightRef.current.add(turnId)

        void fetchTurnChangesSummaryByPaging(props.api, props.session.id, turnId).then((summary) => {
            if (cancelled) {
                return
            }
            setTurnChangesSummaryByTurnId((previous) => ({
                ...previous,
                [turnId]: summary
            }))
        }).catch(() => {
            if (cancelled) {
                return
            }
            setTurnChangesSummaryByTurnId((previous) => ({
                ...previous,
                [turnId]: null
            }))
        }).finally(() => {
            if (latestTurnUpdatedAt !== null) {
                turnChangesSummaryFetchedUpdatedAtRef.current[turnId] = latestTurnUpdatedAt
            }
            turnChangesSummaryInFlightRef.current.delete(turnId)
        })

        return () => {
            cancelled = true
        }
    }, [props.api, props.session.id, props.turns])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const mediaQuery = window.matchMedia(MOBILE_BRIEF_BREAKPOINT_QUERY)
        const handleChange = () => {
            setIsMobileViewport(mediaQuery.matches)
        }

        handleChange()
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange)
            return () => {
                mediaQuery.removeEventListener('change', handleChange)
            }
        }

        mediaQuery.addListener(handleChange)
        return () => {
            mediaQuery.removeListener(handleChange)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        if (!isMobileViewport) {
            if (readMobileBriefTurnId(window.location.search)) {
                writeMobileBriefTurnId(null, 'replace')
            }
            return
        }

        const syncFromHistory = () => {
            setActiveTurnId(readMobileBriefTurnId(window.location.search))
        }

        syncFromHistory()
        window.addEventListener('popstate', syncFromHistory)
        return () => {
            window.removeEventListener('popstate', syncFromHistory)
        }
    }, [isMobileViewport])

    useEffect(() => {
        autoScrollToBottomDoneRef.current = false
        setLiveActivityByTurnId({})
    }, [props.session.id])

    useEffect(() => {
        if (!props.thinking || !activeTurnIdForStreaming) {
            return
        }

        let stopped = false
        let inFlight = false

        const refreshActivity = async () => {
            if (stopped || inFlight) {
                return
            }
            inFlight = true
            try {
                await fetchLiveActivity(activeTurnIdForStreaming)
            } catch {
            } finally {
                inFlight = false
            }
        }

        void refreshActivity()
        const intervalId = window.setInterval(() => {
            void refreshActivity()
        }, TURN_DETAILS_REFRESH_INTERVAL_MS)

        return () => {
            stopped = true
            window.clearInterval(intervalId)
        }
    }, [activeTurnIdForStreaming, fetchLiveActivity, props.thinking])

    const latestTurnUpdateToken = useMemo(() => {
        if (props.turns.length === 0) {
            return 'empty'
        }
        const latestTurn = props.turns[props.turns.length - 1]
        return [
            props.turns.length,
            latestTurn.id,
            latestTurn.messageCount,
            latestTurn.status,
            latestTurn.updatedAt
        ].join(':')
    }, [props.turns])

    const latestTurnId = props.turns[props.turns.length - 1]?.id ?? null

    const renderTurnRow = useCallback((turn: ConversationTurn) => {
        const userPreview = turn.userPreview?.trim() ?? ''
        const assistantPreviewRaw = turn.assistantPreview?.trim() ?? ''
        const assistantPreview = normalizePreview(turn.assistantPreview)
        const isLiveTurn = isBriefTurnLive({
            status: turn.status,
            thinking: props.thinking,
            isActiveStreamingTurn: activeTurnIdForStreaming === turn.id
        })
        const liveActivity = liveActivityByTurnId[turn.id] ?? 'Waiting for Codex activity…'
        const shouldShowFullLastBlock = shouldShowLatestBriefTurnAsFullContent({
            isLatestTurn: latestTurnId === turn.id,
            isLiveTurn
        })
        const turnChangesSummary = turnChangesSummaryByTurnId[turn.id]
        const previewFade = shouldShowFullLastBlock
            ? false
            : shouldShowPreviewFade(assistantPreview, briefCardMaxLines)
        const messageMeta = (
            <span className="inline-flex items-center gap-1">
                <AnimatedCounter value={turn.messageCount} />
                <span>message{turn.messageCount === 1 ? '' : 's'}</span>
            </span>
        )

        return (
            <div className="space-y-1.5">
                {userPreview.length > 0 ? (
                    <div className="flex justify-end">
                        <div className="max-w-[96%] rounded-sm rounded-br-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/60 px-3 py-2 text-sm text-[var(--app-fg)]">
                            <BriefCardMarkdownPreview content={userPreview} />
                        </div>
                    </div>
                ) : null}

                <div className="flex justify-start">
                    {isLiveTurn ? (
                        <div className="relative w-full max-w-[96%] rounded-sm rounded-bl-md border border-blue-500/40 bg-[var(--app-bg)] px-3 py-2">
                            <button
                                type="button"
                                className="block w-full text-left"
                                onClick={() => openTurnDetails(turn.id)}
                                aria-label="Open assistant details"
                            >
                                <div className="flex min-h-[5rem] flex-col gap-1.5 py-1">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-sm border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                                            {generatingBadgeText}
                                        </span>
                                        <span className="ml-auto text-[11px] text-[var(--app-hint)]">{messageMeta}</span>
                                    </div>
                                    <LivePreviewCarousel
                                        preview={assistantPreviewRaw}
                                        liveActivity={liveActivity}
                                    />
                                    <div className="text-[11px] text-[var(--app-hint)]">
                                        <span className="underline decoration-dotted">Click to open details</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    ) : shouldShowFullLastBlock ? (
                        <div className="w-full max-w-[96%] px-1 py-1">
                            <BriefFullMarkdownContent content={assistantPreview} />
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--app-hint)]">
                                <span>{messageMeta}</span>
                                <span>·</span>
                                <button
                                    type="button"
                                    className="underline decoration-dotted hover:text-[var(--app-fg)]"
                                    onClick={() => openTurnDetails(turn.id)}
                                >
                                    Open details
                                </button>
                                {turnChangesSummary ? (
                                    <>
                                        <span>·</span>
                                        <button
                                            type="button"
                                            className="underline decoration-dotted hover:text-[var(--app-fg)]"
                                            onClick={() => openTurnChangesDetails(turn.id, turnChangesSummary.toolId)}
                                        >
                                            Turn changes (+{turnChangesSummary.additions} -{turnChangesSummary.deletions})
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="relative w-full max-w-[96%] rounded-sm rounded-bl-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                            <button
                                type="button"
                                className="block w-full text-left"
                                onClick={() => openTurnDetails(turn.id)}
                                aria-label="Open assistant details"
                            >
                                <BriefCardMarkdownPreview
                                    content={assistantPreview}
                                    style={collapsedPreviewStyle}
                                    className="text-[var(--app-fg)]"
                                />
                                {previewFade ? (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-8 h-6 bg-gradient-to-t from-[var(--app-bg)] to-transparent" />
                                ) : null}
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--app-hint)]">
                                    <span>{messageMeta}</span>
                                    <span>·</span>
                                    <span className="underline decoration-dotted">Click to open details</span>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )
    }, [
        activeTurnIdForStreaming,
        briefCardMaxLines,
        collapsedPreviewStyle,
        latestTurnId,
        liveActivityByTurnId,
        openTurnDetails,
        openTurnChangesDetails,
        props.thinking,
        turnChangesSummaryByTurnId,
        generatingBadgeText
    ])

    useEffect(() => {
        if (props.turns.length === 0) {
            autoScrollToBottomDoneRef.current = false
            return
        }
        if (props.isLoading) {
            return
        }
        if (autoScrollToBottomDoneRef.current && !isAtBottomRef.current) {
            return
        }

        autoScrollToBottomDoneRef.current = true
        const scrollToBottom = () => {
            listRef.current?.scrollToIndex({
                index: 'LAST',
                align: 'end',
                behavior: 'auto'
            })
        }

        scrollToBottom()
        const rafId = window.requestAnimationFrame(scrollToBottom)
        const timeoutId = window.setTimeout(scrollToBottom, 120)

        return () => {
            window.cancelAnimationFrame(rafId)
            window.clearTimeout(timeoutId)
        }
    }, [latestTurnUpdateToken, props.isLoading, props.turns.length])

    return (
        <>
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="mx-auto flex h-full w-full max-w-content min-h-0 flex-col gap-3 px-3 py-3">
                    {props.warning ? (
                        <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                            {props.warning}
                        </div>
                    ) : null}

                    <div className="min-h-0 flex-1 pr-1">
                        {props.isLoading && props.turns.length === 0 ? (
                            <div className="text-xs text-[var(--app-hint)]">Loading conversation…</div>
                        ) : null}

                        {props.turns.length === 0 && !props.isLoading ? (
                            <div className="text-xs text-[var(--app-hint)]">No turns yet.</div>
                        ) : null}

                        {props.turns.length > 0 ? (
                            <Virtuoso
                                ref={listRef}
                                style={{ height: '100%' }}
                                data={props.turns}
                                overscan={320}
                                atBottomStateChange={(isAtBottom) => {
                                    isAtBottomRef.current = isAtBottom
                                }}
                                startReached={() => {
                                    if (!props.hasMore || props.isLoadingMore) {
                                        return
                                    }
                                    void props.onLoadMoreTurns()
                                }}
                                components={{
                                    Header: () => (
                                        props.hasMore || props.isLoadingMore ? (
                                            <div className="pb-2">
                                                <button
                                                    type="button"
                                                    className="w-full rounded-sm border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-1.5 text-xs text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] disabled:opacity-60"
                                                    onClick={() => {
                                                        if (props.isLoadingMore) {
                                                            return
                                                        }
                                                        void props.onLoadMoreTurns()
                                                    }}
                                                    disabled={props.isLoadingMore}
                                                >
                                                    {props.isLoadingMore ? 'Loading older turns…' : 'Load older turns'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="h-1" />
                                        )
                                    )
                                }}
                                itemContent={(index, turn) => (
                                    <div key={turn.id ?? index} className="pb-3">
                                        {renderTurnRow(turn)}
                                    </div>
                                )}
                            />
                        ) : null}
                    </div>
                </div>

            </div>

            {isMobileViewport ? (
                activeTurnId ? (
                    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--app-bg)]">
                        <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={closeTurnDetails}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--app-border)] text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                    aria-label="Back"
                                >
                                    <BackIcon />
                                </button>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[var(--app-fg)]">
                                        {activeTurn ? `Turn #${activeTurn.turnIndex} details` : 'Turn details'}
                                    </div>
                                    {activeTurn ? (
                                        <div className="text-xs text-[var(--app-hint)]">
                                            {activeTurn.messageCount} message{activeTurn.messageCount === 1 ? '' : 's'}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
                            {activeTurn && activeDetail?.error ? (
                                <div className="h-full overflow-y-auto p-4 text-sm text-rose-500">
                                    {activeDetail.error}
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            className="rounded border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                                            onClick={() => {
                                                void fetchTurnMessages(activeTurn.id, null, false)
                                            }}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {activeTurn && activeDetail && !activeDetail.error ? (
                                <div className="flex h-full min-h-0 flex-col">
                                    <TurnDetailThread
                                        key={activeTurn.id}
                                        api={props.api}
                                        session={props.session}
                                        messages={activeDetail.messages}
                                        hasMoreMessages={activeDetail.hasMore}
                                        isLoadingMessages={activeDetail.isLoading}
                                        isLoadingMoreMessages={activeDetail.isLoadingMore}
                                        onLoadMore={loadMoreActiveTurnDetails}
                                        density={props.density}
                                    />
                                </div>
                            ) : activeTurn && activeDetail?.error ? null : (
                                <div className="flex h-full items-center justify-center text-sm text-[var(--app-hint)]">
                                    {activeTurn && activeDetail?.isLoading ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Spinner size="sm" label={null} className="text-current" />
                                            Loading turn details…
                                        </span>
                                    ) : (
                                        'No detail messages'
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null
            ) : (
                <Dialog open={Boolean(activeTurnId)} onOpenChange={(open) => {
                    if (!open) {
                        setActiveTurnId(null)
                    }
                }}>
                    <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
                        <div className="border-b border-[var(--app-border)] px-4 py-3">
                            <DialogHeader>
                                <DialogTitle>
                                    {activeTurn ? `Turn #${activeTurn.turnIndex} details` : 'Turn details'}
                                </DialogTitle>
                            </DialogHeader>
                            {activeTurn ? (
                                <div className="mt-1 text-xs text-[var(--app-hint)]">
                                    {activeTurn.messageCount} message{activeTurn.messageCount === 1 ? '' : 's'}
                                </div>
                            ) : null}
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden">
                            {activeTurn && activeDetail?.error ? (
                                <div className="h-full overflow-y-auto p-4 text-sm text-rose-500">
                                    {activeDetail.error}
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            className="rounded border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                                            onClick={() => {
                                                void fetchTurnMessages(activeTurn.id, null, false)
                                            }}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {activeTurn && activeDetail && !activeDetail.error ? (
                                <div className="flex h-full min-h-0 flex-col">
                                    <TurnDetailThread
                                        key={activeTurn.id}
                                        api={props.api}
                                        session={props.session}
                                        messages={activeDetail.messages}
                                        hasMoreMessages={activeDetail.hasMore}
                                        isLoadingMessages={activeDetail.isLoading}
                                        isLoadingMoreMessages={activeDetail.isLoadingMore}
                                        onLoadMore={loadMoreActiveTurnDetails}
                                        density={props.density}
                                    />
                                </div>
                            ) : activeTurn && activeDetail?.error ? null : (
                                <div className="flex h-[65vh] items-center justify-center text-sm text-[var(--app-hint)]">
                                    {activeTurn && activeDetail?.isLoading ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Spinner size="sm" label={null} className="text-current" />
                                            Loading turn details…
                                        </span>
                                    ) : (
                                        'No detail messages'
                                    )}
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    )
}
