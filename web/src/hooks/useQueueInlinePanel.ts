import { useCallback, useEffect, useState } from 'react'

const QUEUE_INLINE_PANEL_KEY = 'hapi:queueInlinePanel'
const LEGACY_CODEX_QUEUE_INLINE_PANEL_KEY = 'hapi:codexQueueInlinePanel'

export type QueueInlinePanelMode = 'off' | 'compact' | 'full'
export type CodexQueueInlinePanelMode = QueueInlinePanelMode

function normalizeQueueInlinePanelMode(value: string | null): QueueInlinePanelMode {
    if (value === 'off' || value === 'compact' || value === 'full') {
        return value
    }
    return 'compact'
}

function safeReadQueueInlinePanelMode(): QueueInlinePanelMode {
    if (typeof window === 'undefined') {
        return 'compact'
    }
    try {
        const nextValue = window.localStorage.getItem(QUEUE_INLINE_PANEL_KEY)
        if (nextValue !== null) {
            return normalizeQueueInlinePanelMode(nextValue)
        }

        const legacyValue = window.localStorage.getItem(LEGACY_CODEX_QUEUE_INLINE_PANEL_KEY)
        return normalizeQueueInlinePanelMode(legacyValue)
    } catch {
        return 'compact'
    }
}

function safeWriteQueueInlinePanelMode(value: QueueInlinePanelMode): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(QUEUE_INLINE_PANEL_KEY, value)
        window.localStorage.removeItem(LEGACY_CODEX_QUEUE_INLINE_PANEL_KEY)
    } catch {
        // Ignore storage errors
    }
}

export function useQueueInlinePanel(): {
    queueInlinePanelMode: QueueInlinePanelMode
    setQueueInlinePanelMode: (mode: QueueInlinePanelMode) => void
} {
    const [queueInlinePanelMode, setQueueInlinePanelModeState] = useState<QueueInlinePanelMode>(
        safeReadQueueInlinePanelMode
    )

    const setQueueInlinePanelMode = useCallback((mode: QueueInlinePanelMode) => {
        setQueueInlinePanelModeState(mode)
        safeWriteQueueInlinePanelMode(mode)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== QUEUE_INLINE_PANEL_KEY && event.key !== LEGACY_CODEX_QUEUE_INLINE_PANEL_KEY) {
                return
            }
            setQueueInlinePanelModeState(normalizeQueueInlinePanelMode(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        queueInlinePanelMode,
        setQueueInlinePanelMode
    }
}

export function useCodexQueueInlinePanel(): {
    codexQueueInlinePanelMode: CodexQueueInlinePanelMode
    setCodexQueueInlinePanelMode: (mode: CodexQueueInlinePanelMode) => void
} {
    const { queueInlinePanelMode, setQueueInlinePanelMode } = useQueueInlinePanel()
    return {
        codexQueueInlinePanelMode: queueInlinePanelMode,
        setCodexQueueInlinePanelMode: setQueueInlinePanelMode
    }
}
