import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'hapi:sessionsSidebarHiddenDesktop'

export function normalizeDesktopSidebarHidden(value: string | null): boolean {
    return value === '1' || value === 'true'
}

function loadDesktopSidebarHidden(): boolean {
    try {
        return normalizeDesktopSidebarHidden(localStorage.getItem(STORAGE_KEY))
    } catch {
        return false
    }
}

export function useSessionSidebarVisibility(): {
    desktopSidebarHidden: boolean
    setDesktopSidebarHidden: (value: boolean) => void
    toggleDesktopSidebar: () => void
} {
    const [desktopSidebarHidden, setDesktopSidebarHiddenState] = useState(loadDesktopSidebarHidden)

    const setDesktopSidebarHidden = useCallback((value: boolean) => {
        setDesktopSidebarHiddenState(value)
        try {
            localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
        } catch {
            // ignore storage errors
        }
    }, [])

    const toggleDesktopSidebar = useCallback(() => {
        setDesktopSidebarHidden(!desktopSidebarHidden)
    }, [desktopSidebarHidden, setDesktopSidebarHidden])

    useEffect(() => {
        function handleStorage(event: StorageEvent) {
            if (event.key !== STORAGE_KEY) return
            setDesktopSidebarHiddenState(normalizeDesktopSidebarHidden(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        desktopSidebarHidden,
        setDesktopSidebarHidden,
        toggleDesktopSidebar
    }
}
