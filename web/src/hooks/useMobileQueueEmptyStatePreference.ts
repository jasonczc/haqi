import { useCallback, useEffect, useState } from 'react'

const MOBILE_QUEUE_EMPTY_STATE_KEY = 'hapi:mobileQueueEmptyState'

export type MobileQueueEmptyStatePreference = 'hide' | 'show'

function normalizeMobileQueueEmptyStatePreference(value: string | null): MobileQueueEmptyStatePreference {
    return value === 'show' ? 'show' : 'hide'
}

export function safeReadMobileQueueEmptyStatePreference(): MobileQueueEmptyStatePreference {
    if (typeof window === 'undefined') {
        return 'hide'
    }
    try {
        return normalizeMobileQueueEmptyStatePreference(window.localStorage.getItem(MOBILE_QUEUE_EMPTY_STATE_KEY))
    } catch {
        return 'hide'
    }
}

function safeWriteMobileQueueEmptyStatePreference(value: MobileQueueEmptyStatePreference): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(MOBILE_QUEUE_EMPTY_STATE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function useMobileQueueEmptyStatePreference(): {
    mobileQueueEmptyStatePreference: MobileQueueEmptyStatePreference
    setMobileQueueEmptyStatePreference: (value: MobileQueueEmptyStatePreference) => void
} {
    const [mobileQueueEmptyStatePreference, setMobileQueueEmptyStatePreferenceState] = useState<MobileQueueEmptyStatePreference>(
        safeReadMobileQueueEmptyStatePreference
    )

    const setMobileQueueEmptyStatePreference = useCallback((value: MobileQueueEmptyStatePreference) => {
        setMobileQueueEmptyStatePreferenceState(value)
        safeWriteMobileQueueEmptyStatePreference(value)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== MOBILE_QUEUE_EMPTY_STATE_KEY) {
                return
            }
            setMobileQueueEmptyStatePreferenceState(normalizeMobileQueueEmptyStatePreference(event.newValue))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        mobileQueueEmptyStatePreference,
        setMobileQueueEmptyStatePreference
    }
}
