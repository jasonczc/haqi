import { useCallback, useEffect, useState } from 'react'

const PROJECT_QUICK_CREATE_KEY = 'hapi:projectQuickCreate'

function normalizeProjectQuickCreate(value: string | null): boolean {
    return value === '1' || value === 'true'
}

function safeReadProjectQuickCreate(): boolean {
    if (typeof window === 'undefined') {
        return false
    }
    try {
        return normalizeProjectQuickCreate(window.localStorage.getItem(PROJECT_QUICK_CREATE_KEY))
    } catch {
        return false
    }
}

function safeWriteProjectQuickCreate(value: boolean): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        if (value) {
            window.localStorage.setItem(PROJECT_QUICK_CREATE_KEY, '1')
            return
        }
        window.localStorage.removeItem(PROJECT_QUICK_CREATE_KEY)
    } catch {
        // ignore storage errors
    }
}

export function useProjectQuickCreate(): {
    projectQuickCreateEnabled: boolean
    setProjectQuickCreateEnabled: (value: boolean) => void
} {
    const [projectQuickCreateEnabled, setProjectQuickCreateEnabledState] = useState<boolean>(safeReadProjectQuickCreate)

    const setProjectQuickCreateEnabled = useCallback((value: boolean) => {
        setProjectQuickCreateEnabledState(value)
        safeWriteProjectQuickCreate(value)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== PROJECT_QUICK_CREATE_KEY) return
            setProjectQuickCreateEnabledState(normalizeProjectQuickCreate(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        projectQuickCreateEnabled,
        setProjectQuickCreateEnabled
    }
}
