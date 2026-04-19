import { useCallback, useEffect, useState } from 'react'

export type SessionListDensity = 'comfortable' | 'compact'

const STORAGE_KEY = 'hapi:sessionListDensity'

function normalizeDensity(value: string | null): SessionListDensity {
    // Default to compact to match claude-clone's dense IDE aesthetic.
    return value === 'comfortable' ? 'comfortable' : 'compact'
}

function loadDensity(): SessionListDensity {
    try {
        return normalizeDensity(localStorage.getItem(STORAGE_KEY))
    } catch {
        return 'compact'
    }
}

export function useSessionListDensity(): {
    density: SessionListDensity
    setDensity: (value: SessionListDensity) => void
    toggleDensity: () => void
} {
    const [density, setDensityState] = useState<SessionListDensity>(loadDensity)

    const setDensity = useCallback((value: SessionListDensity) => {
        setDensityState(value)
        try {
            localStorage.setItem(STORAGE_KEY, value)
        } catch {
            // ignore storage errors
        }
    }, [])

    const toggleDensity = useCallback(() => {
        setDensity(density === 'comfortable' ? 'compact' : 'comfortable')
    }, [density, setDensity])

    useEffect(() => {
        function handleStorage(event: StorageEvent) {
            if (event.key !== STORAGE_KEY) return
            setDensityState(normalizeDensity(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        density,
        setDensity,
        toggleDensity
    }
}
