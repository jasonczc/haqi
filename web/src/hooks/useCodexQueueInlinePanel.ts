import { useCallback, useEffect, useState } from 'react'

const CODEX_QUEUE_INLINE_PANEL_KEY = 'hapi:codexQueueInlinePanel'

export type CodexQueueInlinePanelMode = 'off' | 'compact' | 'full'

function normalizeCodexQueueInlinePanelMode(value: string | null): CodexQueueInlinePanelMode {
    if (value === 'off' || value === 'compact' || value === 'full') {
        return value
    }
    return 'compact'
}

function safeReadCodexQueueInlinePanelMode(): CodexQueueInlinePanelMode {
    if (typeof window === 'undefined') {
        return 'compact'
    }
    try {
        return normalizeCodexQueueInlinePanelMode(window.localStorage.getItem(CODEX_QUEUE_INLINE_PANEL_KEY))
    } catch {
        return 'compact'
    }
}

function safeWriteCodexQueueInlinePanelMode(value: CodexQueueInlinePanelMode): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(CODEX_QUEUE_INLINE_PANEL_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function useCodexQueueInlinePanel(): {
    codexQueueInlinePanelMode: CodexQueueInlinePanelMode
    setCodexQueueInlinePanelMode: (mode: CodexQueueInlinePanelMode) => void
} {
    const [codexQueueInlinePanelMode, setCodexQueueInlinePanelModeState] = useState<CodexQueueInlinePanelMode>(
        safeReadCodexQueueInlinePanelMode
    )

    const setCodexQueueInlinePanelMode = useCallback((mode: CodexQueueInlinePanelMode) => {
        setCodexQueueInlinePanelModeState(mode)
        safeWriteCodexQueueInlinePanelMode(mode)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== CODEX_QUEUE_INLINE_PANEL_KEY) {
                return
            }
            setCodexQueueInlinePanelModeState(normalizeCodexQueueInlinePanelMode(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        codexQueueInlinePanelMode,
        setCodexQueueInlinePanelMode
    }
}
