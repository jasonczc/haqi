import { describe, expect, it } from 'vitest'
import { normalizeDesktopSidebarHidden } from './useSessionSidebarVisibility'

describe('useSessionSidebarVisibility helpers', () => {
    it('treats "1" as hidden', () => {
        expect(normalizeDesktopSidebarHidden('1')).toBe(true)
    })

    it('treats "true" as hidden', () => {
        expect(normalizeDesktopSidebarHidden('true')).toBe(true)
    })

    it('treats other values as visible', () => {
        expect(normalizeDesktopSidebarHidden('0')).toBe(false)
        expect(normalizeDesktopSidebarHidden('false')).toBe(false)
        expect(normalizeDesktopSidebarHidden(null)).toBe(false)
    })
})
