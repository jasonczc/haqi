import { describe, expect, it } from 'vitest'
import { normalizeThemePreference } from './useTheme'

describe('useTheme helpers', () => {
    it('keeps valid theme preferences', () => {
        expect(normalizeThemePreference('light')).toBe('light')
        expect(normalizeThemePreference('dark')).toBe('dark')
        expect(normalizeThemePreference('system')).toBe('system')
    })

    it('falls back to system for invalid values', () => {
        expect(normalizeThemePreference('auto')).toBe('system')
        expect(normalizeThemePreference('')).toBe('system')
        expect(normalizeThemePreference(null)).toBe('system')
    })
})
