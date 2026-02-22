import { useCallback, useEffect, useState } from 'react'

const ARCHIVE_CONFIRMATION_SKIP_KEY = 'hapi:skipArchiveConfirm'

function normalizeSkipArchiveConfirm(value: string | null): boolean {
    return value === '1' || value === 'true'
}

function safeReadSkipArchiveConfirm(): boolean {
    if (typeof window === 'undefined') {
        return false
    }
    try {
        return normalizeSkipArchiveConfirm(window.localStorage.getItem(ARCHIVE_CONFIRMATION_SKIP_KEY))
    } catch {
        return false
    }
}

function safeWriteSkipArchiveConfirm(value: boolean): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        if (value) {
            window.localStorage.setItem(ARCHIVE_CONFIRMATION_SKIP_KEY, '1')
            return
        }
        window.localStorage.removeItem(ARCHIVE_CONFIRMATION_SKIP_KEY)
    } catch {
        // Ignore storage errors
    }
}

export function useArchiveConfirmation(): {
    skipArchiveConfirmation: boolean
    setSkipArchiveConfirmation: (value: boolean) => void
} {
    const [skipArchiveConfirmation, setSkipArchiveConfirmationState] = useState<boolean>(safeReadSkipArchiveConfirm)

    const setSkipArchiveConfirmation = useCallback((value: boolean) => {
        setSkipArchiveConfirmationState(value)
        safeWriteSkipArchiveConfirm(value)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== ARCHIVE_CONFIRMATION_SKIP_KEY) return
            setSkipArchiveConfirmationState(normalizeSkipArchiveConfirm(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        skipArchiveConfirmation,
        setSkipArchiveConfirmation
    }
}
