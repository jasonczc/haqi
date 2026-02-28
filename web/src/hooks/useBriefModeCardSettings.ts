import { useCallback, useEffect, useState } from 'react'

const BRIEF_CARD_ADAPTIVE_HEIGHT_KEY = 'hapi:briefCardAdaptiveHeight'
const BRIEF_CARD_MAX_LINES_KEY = 'hapi:briefCardMaxLines'

export const BRIEF_CARD_MIN_LINES_LIMIT = 2
export const BRIEF_CARD_MAX_LINES_LIMIT = 50
export const BRIEF_CARD_DEFAULT_MAX_LINES = 8
export const BRIEF_CARD_DEFAULT_ADAPTIVE_HEIGHT = true

export function clampBriefCardMaxLines(value: number): number {
    const integerValue = Number.isFinite(value) ? Math.trunc(value) : BRIEF_CARD_DEFAULT_MAX_LINES
    return Math.min(BRIEF_CARD_MAX_LINES_LIMIT, Math.max(BRIEF_CARD_MIN_LINES_LIMIT, integerValue))
}

function normalizeAdaptiveHeight(value: string | null): boolean {
    if (value === null) {
        return BRIEF_CARD_DEFAULT_ADAPTIVE_HEIGHT
    }
    return value !== 'false'
}

function normalizeMaxLines(value: string | null): number {
    if (!value) {
        return BRIEF_CARD_DEFAULT_MAX_LINES
    }
    const parsed = Number.parseInt(value, 10)
    return clampBriefCardMaxLines(parsed)
}

function safeReadBriefCardSettings(): {
    adaptiveHeight: boolean
    maxLines: number
} {
    if (typeof window === 'undefined') {
        return {
            adaptiveHeight: BRIEF_CARD_DEFAULT_ADAPTIVE_HEIGHT,
            maxLines: BRIEF_CARD_DEFAULT_MAX_LINES
        }
    }

    try {
        return {
            adaptiveHeight: normalizeAdaptiveHeight(window.localStorage.getItem(BRIEF_CARD_ADAPTIVE_HEIGHT_KEY)),
            maxLines: normalizeMaxLines(window.localStorage.getItem(BRIEF_CARD_MAX_LINES_KEY))
        }
    } catch {
        return {
            adaptiveHeight: BRIEF_CARD_DEFAULT_ADAPTIVE_HEIGHT,
            maxLines: BRIEF_CARD_DEFAULT_MAX_LINES
        }
    }
}

function safeWriteAdaptiveHeight(value: boolean): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(BRIEF_CARD_ADAPTIVE_HEIGHT_KEY, value ? 'true' : 'false')
    } catch {
        // Ignore storage errors
    }
}

function safeWriteMaxLines(value: number): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(BRIEF_CARD_MAX_LINES_KEY, String(clampBriefCardMaxLines(value)))
    } catch {
        // Ignore storage errors
    }
}

export function useBriefModeCardSettings(): {
    briefCardAdaptiveHeight: boolean
    briefCardMaxLines: number
    setBriefCardAdaptiveHeight: (value: boolean) => void
    setBriefCardMaxLines: (value: number) => void
} {
    const [settings, setSettings] = useState(safeReadBriefCardSettings)

    const setBriefCardAdaptiveHeight = useCallback((value: boolean) => {
        setSettings((previous) => ({ ...previous, adaptiveHeight: value }))
        safeWriteAdaptiveHeight(value)
    }, [])

    const setBriefCardMaxLines = useCallback((value: number) => {
        const normalized = clampBriefCardMaxLines(value)
        setSettings((previous) => ({ ...previous, maxLines: normalized }))
        safeWriteMaxLines(normalized)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== BRIEF_CARD_ADAPTIVE_HEIGHT_KEY && event.key !== BRIEF_CARD_MAX_LINES_KEY) {
                return
            }
            setSettings((previous) => ({
                adaptiveHeight: event.key === BRIEF_CARD_ADAPTIVE_HEIGHT_KEY
                    ? normalizeAdaptiveHeight(event.newValue)
                    : previous.adaptiveHeight,
                maxLines: event.key === BRIEF_CARD_MAX_LINES_KEY
                    ? normalizeMaxLines(event.newValue)
                    : previous.maxLines
            }))
        }

        window.addEventListener('storage', handleStorage)
        return () => window.removeEventListener('storage', handleStorage)
    }, [])

    return {
        briefCardAdaptiveHeight: settings.adaptiveHeight,
        briefCardMaxLines: settings.maxLines,
        setBriefCardAdaptiveHeight,
        setBriefCardMaxLines
    }
}
