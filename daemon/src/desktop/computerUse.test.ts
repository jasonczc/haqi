import { describe, it, expect } from 'bun:test'

describe('computerUse', () => {
    it('module exports all functions', async () => {
        const mod = await import('./computerUse')
        expect(typeof mod.takeScreenshot).toBe('function')
        expect(typeof mod.click).toBe('function')
        expect(typeof mod.typeText).toBe('function')
        expect(typeof mod.pressKey).toBe('function')
        expect(typeof mod.scroll).toBe('function')
        expect(typeof mod.getCursorPosition).toBe('function')
        expect(typeof mod.openBrowser).toBe('function')
    })
})
