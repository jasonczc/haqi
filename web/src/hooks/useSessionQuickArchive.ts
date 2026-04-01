import { useCallback, useEffect, useState } from 'react'

const SESSION_QUICK_ARCHIVE_KEY = 'hapi:sessionQuickArchive'

function normalizeSessionQuickArchive(value: string | null): boolean {
    if (value === '0' || value === 'false') {
        return false
    }
    return true
}

function safeReadSessionQuickArchive(): boolean {
    if (typeof window === 'undefined') {
        return true
    }
    try {
        return normalizeSessionQuickArchive(window.localStorage.getItem(SESSION_QUICK_ARCHIVE_KEY))
    } catch {
        return true
    }
}

function safeWriteSessionQuickArchive(value: boolean): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        if (value) {
            window.localStorage.removeItem(SESSION_QUICK_ARCHIVE_KEY)
            return
        }
        window.localStorage.setItem(SESSION_QUICK_ARCHIVE_KEY, '0')
    } catch {
        // ignore storage errors
    }
}

export function useSessionQuickArchive(): {
    sessionQuickArchiveEnabled: boolean
    setSessionQuickArchiveEnabled: (value: boolean) => void
} {
    const [sessionQuickArchiveEnabled, setSessionQuickArchiveEnabledState] = useState<boolean>(safeReadSessionQuickArchive)

    const setSessionQuickArchiveEnabled = useCallback((value: boolean) => {
        setSessionQuickArchiveEnabledState(value)
        safeWriteSessionQuickArchive(value)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== SESSION_QUICK_ARCHIVE_KEY) return
            setSessionQuickArchiveEnabledState(normalizeSessionQuickArchive(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        sessionQuickArchiveEnabled,
        setSessionQuickArchiveEnabled
    }
}
