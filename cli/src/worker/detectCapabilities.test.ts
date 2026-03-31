import { describe, it, expect } from 'vitest'
import { detectWorkerCapabilities } from './detectCapabilities'

describe('detectWorkerCapabilities', () => {
    it('returns positive cpu count', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.resources?.cpu).toBeTypeOf('number')
        expect(capabilities.resources?.cpu).toBeGreaterThan(0)
    })

    it('returns positive memoryMb', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.resources?.memoryMb).toBeTypeOf('number')
        expect(capabilities.resources?.memoryMb).toBeGreaterThan(0)
    })

    it('returns docker as a boolean', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.docker).toBeTypeOf('boolean')
    })

    it('returns dockerSession matching docker', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.dockerSession).toBe(capabilities.docker)
    })

    it('returns internetAccess as true', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.internetAccess).toBe(true)
    })

    it('returns maxConcurrentSessions greater than 0', async () => {
        const capabilities = await detectWorkerCapabilities()
        expect(capabilities.maxConcurrentSessions).toBeTypeOf('number')
        expect(capabilities.maxConcurrentSessions).toBeGreaterThan(0)
    })

    it('returns diskGb as non-negative number when present', async () => {
        const capabilities = await detectWorkerCapabilities()
        if (capabilities.resources?.diskGb !== undefined) {
            expect(capabilities.resources.diskGb).toBeTypeOf('number')
            expect(capabilities.resources.diskGb).toBeGreaterThanOrEqual(0)
        }
    })
})
