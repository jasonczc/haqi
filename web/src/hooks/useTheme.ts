import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getTelegramWebApp } from './useTelegram'

type ColorScheme = 'light' | 'dark'
export type ThemePreference = 'system' | 'light' | 'dark'

<<<<<<< HEAD
const THEME_PREFERENCE_STORAGE_KEY = 'hapi-theme'

export function normalizeThemePreference(value: string | null): ThemePreference {
    if (value === 'light' || value === 'dark' || value === 'system') {
        return value
=======
export type AppearancePreference = 'system' | 'dark' | 'light'

const APPEARANCE_KEY = 'hapi-appearance'

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeGetItem(key: string): string | null {
    if (!isBrowser()) return null
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSetItem(key: string, value: string): void {
    if (!isBrowser()) return
    try {
        localStorage.setItem(key, value)
    } catch {
        // Ignore storage errors
    }
}

function safeRemoveItem(key: string): void {
    if (!isBrowser()) return
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function parseAppearance(raw: string | null): AppearancePreference {
    if (raw === 'dark' || raw === 'light') return raw
    return 'system'
}

function getStoredAppearance(): AppearancePreference {
    return parseAppearance(safeGetItem(APPEARANCE_KEY))
}

export function getAppearanceOptions(): ReadonlyArray<{ value: AppearancePreference; labelKey: string }> {
    return [
        { value: 'system', labelKey: 'settings.display.appearance.system' },
        { value: 'dark', labelKey: 'settings.display.appearance.dark' },
        { value: 'light', labelKey: 'settings.display.appearance.light' },
    ]
}

function getColorScheme(): ColorScheme {
    const pref = getStoredAppearance()
    if (pref === 'dark' || pref === 'light') return pref

    // 'system': use Telegram → system preference → light
    const tg = getTelegramWebApp()
    if (tg?.colorScheme) {
        return tg.colorScheme === 'dark' ? 'dark' : 'light'
>>>>>>> a0c35bc (feat(web): add appearance setting (follow system / dark / light) (#253))
    }
    return 'system'
}

function getStoredThemePreference(): ThemePreference {
    if (typeof window === 'undefined') return 'system'
    return normalizeThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY))
}

function saveThemePreference(preference: ThemePreference): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference)
}

function getSystemColorScheme(): ColorScheme {
    if (typeof window !== 'undefined') {
        const tg = getTelegramWebApp()
        if (tg?.colorScheme) {
            return tg.colorScheme === 'dark' ? 'dark' : 'light'
        }

        if (window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
    }

    return 'light'
}

function resolveColorScheme(preference: ThemePreference): ColorScheme {
    if (preference === 'light' || preference === 'dark') {
        return preference
    }
    return getSystemColorScheme()
}

function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function applyTheme(scheme: ColorScheme): void {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', scheme)
}

function applyPlatform(): void {
    if (typeof document === 'undefined') return
    if (isIOS()) {
        document.documentElement.classList.add('ios')
    }
}

// External store for theme state
let currentPreference: ThemePreference = getStoredThemePreference()
let currentScheme: ColorScheme = resolveColorScheme(currentPreference)
const listeners = new Set<() => void>()

// Apply theme immediately at module load (before React renders)
applyTheme(currentScheme)

function subscribe(callback: () => void): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
}

function getColorSchemeSnapshot(): ColorScheme {
    return currentScheme
}

function getThemePreferenceSnapshot(): ThemePreference {
    return currentPreference
}

function notifyListeners(): void {
    listeners.forEach((cb) => cb())
}

function updateScheme(nextScheme: ColorScheme): boolean {
    if (nextScheme !== currentScheme) {
        currentScheme = nextScheme
        applyTheme(nextScheme)
        return true
    }
    return false
}

function updateSchemeFromSystem(): void {
    if (currentPreference !== 'system') return
    if (updateScheme(resolveColorScheme('system'))) {
        notifyListeners()
    }
}

export function setThemePreference(preference: ThemePreference): void {
    const normalizedPreference = normalizeThemePreference(preference)
    const previousPreference = currentPreference
    const previousScheme = currentScheme

    currentPreference = normalizedPreference
    saveThemePreference(normalizedPreference)
    updateScheme(resolveColorScheme(normalizedPreference))

    if (previousPreference !== currentPreference || previousScheme !== currentScheme) {
        notifyListeners()
    }
}

// Track if theme listeners have been set up
let listenersInitialized = false

export function useTheme(): { colorScheme: ColorScheme; isDark: boolean } {
    const colorScheme = useSyncExternalStore(subscribe, getColorSchemeSnapshot, getColorSchemeSnapshot)

    return {
        colorScheme,
        isDark: colorScheme === 'dark',
    }
}

<<<<<<< HEAD
export function useThemePreference(): {
    themePreference: ThemePreference
    setThemePreference: (preference: ThemePreference) => void
} {
    const themePreference = useSyncExternalStore(subscribe, getThemePreferenceSnapshot, getThemePreferenceSnapshot)

    return {
        themePreference,
        setThemePreference,
    }
=======
export function useAppearance(): { appearance: AppearancePreference; setAppearance: (pref: AppearancePreference) => void } {
    const [appearance, setAppearanceState] = useState<AppearancePreference>(getStoredAppearance)

    useEffect(() => {
        if (!isBrowser()) return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== APPEARANCE_KEY) return
            setAppearanceState(parseAppearance(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setAppearance = useCallback((pref: AppearancePreference) => {
        setAppearanceState(pref)

        if (pref === 'system') {
            safeRemoveItem(APPEARANCE_KEY)
        } else {
            safeSetItem(APPEARANCE_KEY, pref)
        }

        updateScheme()
    }, [])

    return { appearance, setAppearance }
>>>>>>> a0c35bc (feat(web): add appearance setting (follow system / dark / light) (#253))
}

// Call this once at app startup to ensure theme is applied and listeners attached
export function initializeTheme(): void {
    currentPreference = getStoredThemePreference()
    currentScheme = resolveColorScheme(currentPreference)
    applyTheme(currentScheme)
    applyPlatform()

    // Set up listeners only once (after SDK may have loaded)
    if (!listenersInitialized) {
        listenersInitialized = true
        const tg = typeof window !== 'undefined' ? getTelegramWebApp() : null
        if (tg?.onEvent) {
            // Telegram theme changes
            tg.onEvent('themeChanged', updateSchemeFromSystem)
        }

        if (typeof window !== 'undefined' && window.matchMedia) {
            // Browser system preference changes
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', updateSchemeFromSystem)
            } else {
                mediaQuery.addListener(updateSchemeFromSystem)
            }
        }

        // Cross-tab appearance sync: update theme when another tab changes localStorage
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event: StorageEvent) => {
                if (event.key === APPEARANCE_KEY) updateScheme()
            })
        }
    }
}
