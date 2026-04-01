import { describe, it, expect } from 'bun:test'
import { DesktopManager } from './vnc'

describe('DesktopManager', () => {
    it('creates with default config', () => {
        const dm = new DesktopManager()
        expect(dm.getConfig().display).toBe(':1')
        expect(dm.getConfig().novncPort).toBe(6080)
        expect(dm.isStarted()).toBe(false)
    })

    it('accepts custom config', () => {
        const dm = new DesktopManager({ display: ':2', resolution: '1920x1080' })
        expect(dm.getConfig().display).toBe(':2')
        expect(dm.getConfig().resolution).toBe('1920x1080')
    })
})
