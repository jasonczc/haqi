import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isObject } from '@hapi/protocol'
import type { SyncEvent } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { clearMessageWindow, ingestIncomingMessages } from '@/lib/message-window-store'

type SSESubscription = {
    all?: boolean
    sessionId?: string
    machineId?: string
    groupId?: string
}

type VisibilityState = 'visible' | 'hidden'

type ToastEvent = Extract<SyncEvent, { type: 'toast' }>

function getVisibilityState(): VisibilityState {
    if (typeof document === 'undefined') {
        return 'hidden'
    }
    return document.visibilityState === 'visible' ? 'visible' : 'hidden'
}

function buildEventsUrl(
    baseUrl: string,
    token: string,
    subscription: SSESubscription,
    visibility: VisibilityState
): string {
    const params = new URLSearchParams()
    params.set('token', token)
    params.set('visibility', visibility)
    if (subscription.all) {
        params.set('all', 'true')
    }
    if (subscription.sessionId) {
        params.set('sessionId', subscription.sessionId)
    }
    if (subscription.machineId) {
        params.set('machineId', subscription.machineId)
    }
    if (subscription.groupId) {
        params.set('groupId', subscription.groupId)
    }

    const path = `/api/events?${params.toString()}`
    try {
        return new URL(path, baseUrl).toString()
    } catch {
        return path
    }
}

export function useSSE(options: {
    enabled: boolean
    token: string
    baseUrl: string
    subscription?: SSESubscription
    onEvent: (event: SyncEvent) => void
    onConnect?: () => void
    onDisconnect?: (reason: string) => void
    onError?: (error: unknown) => void
    onToast?: (event: ToastEvent) => void
}): { subscriptionId: string | null } {
    const queryClient = useQueryClient()
    const onEventRef = useRef(options.onEvent)
    const onConnectRef = useRef(options.onConnect)
    const onDisconnectRef = useRef(options.onDisconnect)
    const onErrorRef = useRef(options.onError)
    const onToastRef = useRef(options.onToast)
    const eventSourceRef = useRef<EventSource | null>(null)
    const [subscriptionId, setSubscriptionId] = useState<string | null>(null)

    useEffect(() => {
        onEventRef.current = options.onEvent
    }, [options.onEvent])

    useEffect(() => {
        onErrorRef.current = options.onError
    }, [options.onError])

    useEffect(() => {
        onConnectRef.current = options.onConnect
    }, [options.onConnect])

    useEffect(() => {
        onDisconnectRef.current = options.onDisconnect
    }, [options.onDisconnect])

    useEffect(() => {
        onToastRef.current = options.onToast
    }, [options.onToast])

    const subscription = options.subscription ?? {}

    const subscriptionKey = useMemo(() => {
        return `${subscription.all ? '1' : '0'}|${subscription.sessionId ?? ''}|${subscription.machineId ?? ''}|${subscription.groupId ?? ''}`
    }, [subscription.all, subscription.sessionId, subscription.machineId, subscription.groupId])

    useEffect(() => {
        if (!options.enabled) {
            eventSourceRef.current?.close()
            eventSourceRef.current = null
            setSubscriptionId(null)
            return
        }

        setSubscriptionId(null)
        const url = buildEventsUrl(options.baseUrl, options.token, {
            ...subscription,
            sessionId: subscription.sessionId ?? undefined
        }, getVisibilityState())
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        const handleSyncEvent = (event: SyncEvent) => {
            if (event.type === 'connection-changed') {
                const data = event.data
                if (data && typeof data === 'object' && 'subscriptionId' in data) {
                    const nextId = (data as { subscriptionId?: unknown }).subscriptionId
                    if (typeof nextId === 'string' && nextId.length > 0) {
                        setSubscriptionId(nextId)
                    }
                }
            }

            if (event.type === 'toast') {
                onToastRef.current?.(event)
                return
            }

            if (event.type === 'message-received') {
                ingestIncomingMessages(event.sessionId, [event.message])
                void queryClient.invalidateQueries({ queryKey: queryKeys.turns(event.sessionId) })
            }

            if (event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
                if ('sessionId' in event) {
                    if (event.type === 'session-removed') {
                        void queryClient.removeQueries({ queryKey: queryKeys.session(event.sessionId) })
                        void queryClient.removeQueries({ queryKey: queryKeys.turns(event.sessionId) })
                        clearMessageWindow(event.sessionId)
                    } else {
                        void queryClient.invalidateQueries({ queryKey: queryKeys.session(event.sessionId) })
                    }
                }
            }

            if (event.type === 'machine-updated') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.machines })
            }

            if (event.type === 'group-added' || event.type === 'group-updated' || event.type === 'group-removed') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.groups })
                void queryClient.invalidateQueries({ queryKey: queryKeys.group(event.groupId) })
                if (event.type === 'group-removed') {
                    void queryClient.removeQueries({ queryKey: queryKeys.groupMessages(event.groupId) })
                    void queryClient.removeQueries({ queryKey: queryKeys.groupTurns(event.groupId) })
                }
            }

            if (event.type === 'group-message-received') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.groupMessages(event.groupId) })
                void queryClient.invalidateQueries({ queryKey: queryKeys.groupTurns(event.groupId) })
            }

            if (event.type === 'group-task-updated') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.groupTasks(event.groupId) })
            }

            if (event.type === 'group-note-updated') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.groupNote(event.groupId) })
            }

            onEventRef.current(event)
        }

        const handleMessage = (message: MessageEvent<string>) => {
            if (typeof message.data !== 'string') {
                return
            }

            let parsed: unknown
            try {
                parsed = JSON.parse(message.data)
            } catch {
                return
            }

            if (!isObject(parsed)) {
                return
            }
            if (typeof parsed.type !== 'string') {
                return
            }

            handleSyncEvent(parsed as SyncEvent)
        }

        eventSource.onmessage = handleMessage
        eventSource.onopen = () => {
            onConnectRef.current?.()
        }
        eventSource.onerror = (error) => {
            onErrorRef.current?.(error)
            const reason = eventSource.readyState === EventSource.CLOSED ? 'closed' : 'error'
            onDisconnectRef.current?.(reason)
        }

        return () => {
            eventSource.close()
            if (eventSourceRef.current === eventSource) {
                eventSourceRef.current = null
            }
            setSubscriptionId(null)
        }
    }, [options.baseUrl, options.enabled, options.token, subscriptionKey, queryClient])

    return { subscriptionId }
}
