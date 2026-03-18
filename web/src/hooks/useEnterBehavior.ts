import { useCallback, useEffect, useState } from 'react'

/**
 * Enter key behavior in the composer:
 * - 'send': Enter sends message, Shift+Enter inserts newline (default)
 * - 'newline': Enter inserts newline, Shift+Enter sends message
 */
export type EnterBehavior = 'send' | 'newline'

const STORAGE_KEY = 'hapi:enterBehavior'

function normalize(value: string | null): EnterBehavior {
    if (value === 'newline') return 'newline'
    return 'send'
}

function safeRead(): EnterBehavior {
    if (typeof window === 'undefined') return 'send'
    try {
        return normalize(window.localStorage.getItem(STORAGE_KEY))
    } catch {
        return 'send'
    }
}

function safeWrite(value: EnterBehavior): void {
    if (typeof window === 'undefined') return
    try {
        if (value === 'send') {
            window.localStorage.removeItem(STORAGE_KEY)
        } else {
            window.localStorage.setItem(STORAGE_KEY, value)
        }
    } catch {
        // Ignore storage errors
    }
}

export function useEnterBehavior(): {
    enterBehavior: EnterBehavior
    setEnterBehavior: (value: EnterBehavior) => void
} {
    const [enterBehavior, setEnterBehaviorState] = useState<EnterBehavior>(safeRead)

    const setEnterBehavior = useCallback((value: EnterBehavior) => {
        setEnterBehaviorState(value)
        safeWrite(value)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY) return
            setEnterBehaviorState(normalize(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return { enterBehavior, setEnterBehavior }
}
