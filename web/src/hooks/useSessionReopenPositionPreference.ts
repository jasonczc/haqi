import { useEffect, useState } from 'react'

export type SessionReopenPositionPreference = 'bottom' | 'restore' | 'bottom-if-unread'

export const SESSION_REOPEN_POSITION_STORAGE_KEY = 'hapi:sessionReopenPosition:v1'

function normalizeSessionReopenPosition(value: unknown): SessionReopenPositionPreference {
    if (value === 'restore') return 'restore'
    if (value === 'bottom-if-unread') return 'bottom-if-unread'
    return 'bottom'
}

export function readSessionReopenPositionPreference(): SessionReopenPositionPreference {
    if (typeof window === 'undefined') {
        return 'bottom'
    }
    try {
        return normalizeSessionReopenPosition(window.localStorage.getItem(SESSION_REOPEN_POSITION_STORAGE_KEY))
    } catch {
        return 'bottom'
    }
}

function persistSessionReopenPositionPreference(value: SessionReopenPositionPreference): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(SESSION_REOPEN_POSITION_STORAGE_KEY, value)
    } catch {
    }
}

export function useSessionReopenPositionPreference(): {
    sessionReopenPosition: SessionReopenPositionPreference
    setSessionReopenPosition: (value: SessionReopenPositionPreference) => void
} {
    const [sessionReopenPosition, setSessionReopenPositionState] = useState<SessionReopenPositionPreference>(
        readSessionReopenPositionPreference
    )

    useEffect(() => {
        persistSessionReopenPositionPreference(sessionReopenPosition)
    }, [sessionReopenPosition])

    return {
        sessionReopenPosition,
        setSessionReopenPosition: (value) => {
            setSessionReopenPositionState(normalizeSessionReopenPosition(value))
        }
    }
}
