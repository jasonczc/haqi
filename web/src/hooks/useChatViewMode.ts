import { useEffect, useState } from 'react'

export type ChatViewMode = 'normal' | 'brief' | 'cli'

const CHAT_VIEW_MODE_STORAGE_KEY = 'hapi-chat-view-mode-v1'

function normalizeChatViewMode(value: unknown): ChatViewMode {
    if (value === 'brief') return 'brief'
    if (value === 'cli') return 'cli'
    return 'normal'
}

function readChatViewMode(): ChatViewMode {
    if (typeof window === 'undefined') {
        return 'normal'
    }
    try {
        const stored = window.localStorage.getItem(CHAT_VIEW_MODE_STORAGE_KEY)
        return normalizeChatViewMode(stored)
    } catch {
        return 'normal'
    }
}

function persistChatViewMode(mode: ChatViewMode): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(CHAT_VIEW_MODE_STORAGE_KEY, mode)
    } catch {
    }
}

export function useChatViewMode(): {
    viewMode: ChatViewMode
    setViewMode: (mode: ChatViewMode) => void
} {
    const [viewMode, setViewModeState] = useState<ChatViewMode>(readChatViewMode)

    useEffect(() => {
        persistChatViewMode(viewMode)
    }, [viewMode])

    return {
        viewMode,
        setViewMode: (mode: ChatViewMode) => {
            setViewModeState(normalizeChatViewMode(mode))
        }
    }
}
