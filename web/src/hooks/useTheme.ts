import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getTelegramWebApp } from './useTelegram'

type ColorScheme = 'light' | 'dark'
export type ThemePreference = 'system' | 'light' | 'dark'
export type AppearancePreference = ThemePreference

const THEME_PREFERENCE_STORAGE_KEY = 'hapi-theme'
const APPEARANCE_KEY = THEME_PREFERENCE_STORAGE_KEY

export function normalizeThemePreference(value: string | null): ThemePreference {
    if (value === 'light' || value === 'dark' || value === 'system') {
        return value
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

export function getAppearanceOptions(): ReadonlyArray<{ value: AppearancePreference; labelKey: string }> {
    return [
        { value: 'system', labelKey: 'settings.display.appearance.system' },
        { value: 'dark', labelKey: 'settings.display.appearance.dark' },
        { value: 'light', labelKey: 'settings.display.appearance.light' },
    ]
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

let currentPreference: ThemePreference = getStoredThemePreference()
let currentScheme: ColorScheme = resolveColorScheme(currentPreference)
const listeners = new Set<() => void>()

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

let listenersInitialized = false

export function useTheme(): { colorScheme: ColorScheme; isDark: boolean } {
    const colorScheme = useSyncExternalStore(subscribe, getColorSchemeSnapshot, getColorSchemeSnapshot)

    return {
        colorScheme,
        isDark: colorScheme === 'dark',
    }
}

export function useThemePreference(): {
    themePreference: ThemePreference
    setThemePreference: (preference: ThemePreference) => void
} {
    const themePreference = useSyncExternalStore(subscribe, getThemePreferenceSnapshot, getThemePreferenceSnapshot)

    return {
        themePreference,
        setThemePreference,
    }
}

export function useAppearance(): { appearance: AppearancePreference; setAppearance: (pref: AppearancePreference) => void } {
    const { themePreference, setThemePreference } = useThemePreference()
    const [appearance, setAppearanceState] = useState<AppearancePreference>(themePreference)

    useEffect(() => {
        setAppearanceState(themePreference)
    }, [themePreference])

    const setAppearance = useCallback((pref: AppearancePreference) => {
        setAppearanceState(pref)
        setThemePreference(pref)
    }, [setThemePreference])

    return { appearance, setAppearance }
}

export function initializeTheme(): void {
    currentPreference = getStoredThemePreference()
    currentScheme = resolveColorScheme(currentPreference)
    applyTheme(currentScheme)
    applyPlatform()

    if (!listenersInitialized) {
        listenersInitialized = true
        const tg = typeof window !== 'undefined' ? getTelegramWebApp() : null
        if (tg?.onEvent) {
            tg.onEvent('themeChanged', updateSchemeFromSystem)
        }

        if (typeof window !== 'undefined' && window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', updateSchemeFromSystem)
            } else {
                mediaQuery.addListener(updateSchemeFromSystem)
            }
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event: StorageEvent) => {
                if (event.key === APPEARANCE_KEY) {
                    currentPreference = getStoredThemePreference()
                    updateScheme(resolveColorScheme(currentPreference))
                    notifyListeners()
                }
            })
        }
    }
}
