import { describe, expect, it } from 'vitest'
import { isElectronUserAgent } from './runtimeEnvironment'

describe('runtimeEnvironment', () => {
    it('detects Electron user agents', () => {
        expect(isElectronUserAgent('Mozilla/5.0 HAQI Electron/41.3.0 Chrome/140.0.0.0')).toBe(true)
        expect(isElectronUserAgent('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36')).toBe(false)
    })
})
